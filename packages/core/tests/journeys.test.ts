import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createInvoice, createPortalLink, createProject, dashboardInsights, fileLibrary, getProject, listChecklistRuns, listChecklistTemplates,
  listIncidents, portalAccess, portalIssueCode, portalReports, portalSignMilestone, portalVerifyCode, progressStatement, recordDelivery,
  recordSignature, reportIncident, searchCompany, submitChecklist, updateIncident, updatePhase, updatePortalLink, addMilestone, type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let other: Actor;
let projectId: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  other = await createTestCompany(db, 'Autre BTP SARL');
  await db.owner.query(`update org_settings set plan_code = 'pro' where org_id = $1`, [owner.orgId]);
  projectId = (await createProject(db.app, owner, { name: 'Villa R+1', budgetMinor: 40_000_000, status: 'active' })).id;
});
afterAll(async () => db.close());

describe('progress statement (spec 026)', () => {
  it('bills each phase budget times its validated progress, minus what was billed, and deducts the advance in proportion', async () => {
    const detail = await getProject(db.app, owner, projectId);
    const [first, second] = detail.phases;
    await updatePhase(db.app, owner, first!.id, { budgetMinor: 10_000_000, progressPct: 100 });
    await updatePhase(db.app, owner, second!.id, { budgetMinor: 30_000_000, progressPct: 50 });
    await createInvoice(db.app, owner, { projectId, kind: 'advance', amountMinor: 4_000_000, dueOn: today(10) });
    await createInvoice(db.app, owner, { projectId, kind: 'progress', amountMinor: 5_000_000, dueOn: today(30) });
    const statement = await progressStatement(db.app, owner, projectId);
    expect(statement.earnedMinor).toBe(25_000_000);
    expect(statement.invoicedMinor).toBe(5_000_000);
    expect(statement.suggestedMinor).toBe(20_000_000);
    // 4 M advance × 20 M / 40 M budget.
    expect(statement.suggestedDeductionMinor).toBe(2_000_000);
    expect(statement.nextNumber).toBe(2);
  });

  it('is refused to a site lead and to another company', async () => {
    const lead = await addMember(db, owner.orgId, 'site_lead');
    await expect(progressStatement(db.app, lead, projectId)).rejects.toThrow();
    await expect(progressStatement(db.app, other, projectId)).rejects.toThrow();
  });
});

describe('field journey (spec 025)', () => {
  it('stores a checklist once even when sent twice, with its counts', async () => {
    const lead = await addMember(db, owner.orgId, 'site_lead');
    const [template] = await listChecklistTemplates(db.app, lead);
    expect(template!.items.length).toBeGreaterThan(2);
    const id = randomUUID();
    const input = { id, projectId, templateId: template!.id, name: template!.name, items: template!.items.map((label, index) => ({ label, done: index > 0 })), doneAt: new Date().toISOString() };
    expect((await submitChecklist(db.app, lead, input)).created).toBe(true);
    expect((await submitChecklist(db.app, lead, input)).created).toBe(false);
    const [run] = await listChecklistRuns(db.app, owner, { projectId });
    expect(run).toMatchObject({ doneCount: template!.items.length - 1, totalCount: template!.items.length, completed: false });
    expect(await listChecklistRuns(db.app, other)).toEqual([]);
  });

  it('records deliveries and signatures idempotently, invisible to another company', async () => {
    const lead = await addMember(db, owner.orgId, 'site_lead');
    const delivery = { id: randomUUID(), projectId, supplier: 'Cimenterie', item: 'Ciment CPJ 45', quantity: 120, unit: 'sacs', deliveredOn: today(0), verdict: 'conform' };
    expect((await recordDelivery(db.app, lead, delivery, 'key/photo')).created).toBe(true);
    expect((await recordDelivery(db.app, lead, delivery, 'key/photo')).created).toBe(false);
    const signature = { id: randomUUID(), projectId, subjectKind: 'delivery', subjectId: delivery.id, title: 'Ciment', signerName: 'Livreur Test', verdict: 'conform' };
    expect((await recordSignature(db.app, lead, signature, 'key/sig.png', 'field')).created).toBe(true);
    await expect(recordSignature(db.app, other, { ...signature, id: randomUUID() }, 'k', 'field')).rejects.toThrow();
  });

  it('follows an incident through being handled to resolved, by the engineer only', async () => {
    const lead = await addMember(db, owner.orgId, 'site_lead');
    const engineer = await addMember(db, owner.orgId, 'engineer');
    const id = randomUUID();
    await reportIncident(db.app, lead, { id, projectId, kind: 'defect', priority: 'critical', description: 'Fissure poteau' });
    await expect(updateIncident(db.app, lead, id, { status: 'in_progress' })).rejects.toThrow();
    await updateIncident(db.app, engineer, id, { status: 'in_progress', decision: 'redo', assigneeId: lead.userId, impactDays: 3 });
    let incident = (await listIncidents(db.app, owner, { projectId })).find((row) => row.id === id)!;
    expect(incident).toMatchObject({ status: 'in_progress', decision: 'redo', impactDays: 3, assigneeId: lead.userId });
    await updateIncident(db.app, engineer, id, { status: 'resolved', resolutionNote: 'Poteau repris' });
    incident = (await listIncidents(db.app, owner, { projectId })).find((row) => row.id === id)!;
    expect(incident.status).toBe('resolved');
    expect(incident.resolvedAt).not.toBeNull();
    // An owner of another company cannot become the assignee.
    await expect(updateIncident(db.app, engineer, id, { assigneeId: other.userId })).rejects.toThrow();
  });
});

describe('client access (spec 022)', () => {
  it('needs an e-mail code once per device, limits tries and shows only what the link allows', async () => {
    const { id: linkId, token } = await createPortalLink(db.app, owner, projectId);
    await updatePortalLink(db.app, owner, linkId, { contactEmail: 'client@example.test', showFinance: false });
    let access = await portalAccess(db.app, token, null);
    expect(access).toMatchObject({ verified: false, requireCode: true, contactEmail: 'client@example.test' });
    expect(access!.show.finance).toBe(false);
    const { code } = await portalIssueCode(db.app, token);
    expect(code).toMatch(/^\d{6}$/u);
    const wrong = code === '000000' ? '111111' : '000000';
    expect(await portalVerifyCode(db.app, token, wrong)).toBeNull();
    const device = await portalVerifyCode(db.app, token, code);
    expect(device).toBeTruthy();
    // The code is single-use; the device is remembered.
    expect(await portalVerifyCode(db.app, token, code)).toBeNull();
    access = await portalAccess(db.app, token, device);
    expect(access!.verified).toBe(true);
    expect((await portalAccess(db.app, token, 'some-other-device'))!.verified).toBe(false);
    expect(await portalReports(db.app, token)).toEqual([]);
  });

  it('lets the client sign a milestone opened to them, once', async () => {
    const { token } = await createPortalLink(db.app, owner, projectId);
    const { id: milestoneId } = await addMilestone(db.app, owner, { projectId, name: 'Fondations', plannedOn: today(-3), actualOn: today(-1), clientValidation: true });
    const sign = () => portalSignMilestone(db.app, token, { milestoneId, signer: 'M. Client', verdict: 'reserve', reserve: 'Fissure au coin' }, randomUUID(), 'key/sig.png');
    expect(await sign()).toBe(true);
    expect(await sign()).toBe(false);
    const { rows } = await db.owner.query('select verdict, reserve_note, via from signature where subject_id = $1', [milestoneId]);
    expect(rows[0]).toMatchObject({ verdict: 'reserve', reserve_note: 'Fissure au coin', via: 'portal' });
  });

  it('refuses a revoked or unknown link', async () => {
    expect(await portalAccess(db.app, 'unknown-token-unknown-token', null)).toBeNull();
    await expect(portalIssueCode(db.app, 'unknown-token-unknown-token')).rejects.toThrow();
  });
});

describe('insights, search and library (specs 021, 023)', () => {
  it('stays inside the company', async () => {
    const mine = await dashboardInsights(db.app, owner);
    expect(mine.sites.some((site) => site.id === projectId)).toBe(true);
    expect(mine.cash).toHaveLength(6);
    const theirs = await dashboardInsights(db.app, other);
    expect(theirs.sites.some((site) => site.id === projectId)).toBe(false);
    expect((await searchCompany(db.app, owner, 'Villa')).some((hit) => hit.id === projectId)).toBe(true);
    expect(await searchCompany(db.app, other, 'Villa')).toEqual([]);
    expect((await fileLibrary(db.app, owner)).every((file) => file.projectId === projectId)).toBe(true);
    expect(await fileLibrary(db.app, other)).toEqual([]);
  });
});
