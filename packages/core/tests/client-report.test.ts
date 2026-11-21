import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  addMilestone, clientReport, clientReportDraft, createClientReportDraft, createPortalLink, createProject, deleteClientReportDraft, getProject, listClientReports,
  portalClientReport, portalClientReports, portalContact, reviewReport, saveAutomaticClientReport, saveClientReport, sealPortalToken, sendClientReportDraft, submitReport,
  unknownFigures, updateClientReportDraft, updateInvoiceSettings, weeklyReportTargets, type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let lead: Actor;
let projectId: string;
let token: string;
let linkId: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  await db.owner.query(`update org_settings set plan_code = 'pro' where org_id = $1`, [owner.orgId]);
  lead = await addMember(db, owner.orgId, 'site_lead');
  projectId = (await createProject(db.app, owner, { name: 'Villa rapport', status: 'active', budgetMinor: 5_000_000 })).id;
  await addMilestone(db.app, owner, { projectId, name: 'Toiture', plannedOn: today(20) });
  ({ token, id: linkId } = await createPortalLink(db.app, owner, projectId));
  await db.owner.query(`update portal_link set contact_email = 'client@example.test', contact_name = 'M. Client' where id = $1`, [linkId]);
});
afterAll(async () => db.close());

describe('client report (spec 049)', () => {
  it('is built from the site, in the company look, and never carries costs', async () => {
    await updateInvoiceSettings(db.app, owner, { reportIntro: 'Voici votre semaine.', reportShowChanges: false });
    const report = await clientReport(db.app, owner, projectId, { from: today(-7), to: today(0) });
    expect(report).toMatchObject({ intro: 'Voici votre semaine.', changes: null, project: { name: 'Villa rapport' } });
    expect(report.upcoming?.[0]?.name).toBe('Toiture');
    expect(JSON.stringify(report)).not.toMatch(/budget|spent|margin|expense/iu);
    await expect(clientReport(db.app, owner, projectId, { from: today(0), to: today(-3) })).rejects.toThrow();
  });
  it('reaches the client only once sent, through their own link', async () => {
    expect(await portalClientReports(db.owner, token)).toHaveLength(0);
    const { id } = await saveClientReport(db.app, owner, { projectId, from: today(-7), to: today(0), note: 'Dalle coulée.', sentTo: 'client@example.test' });
    expect((await listClientReports(db.app, owner, projectId))[0]).toMatchObject({ id, note: 'Dalle coulée.' });
    expect((await portalClientReports(db.owner, token)).map((row) => row.id)).toEqual([id]);
    expect((await portalClientReport(db.owner, token, id))?.note).toBe('Dalle coulée.');
    expect(await portalClientReport(db.owner, 'not-a-token', id)).toBeNull();
    await expect(saveClientReport(db.app, lead, { projectId, from: today(-7), to: today(0) })).rejects.toThrow();
  });
  it('keeps the link sealed for later messages, and lists the weekly targets', async () => {
    await sealPortalToken(db.app, owner, linkId, 'sealed-value');
    expect(await portalContact(db.app, owner, projectId)).toMatchObject({ contactEmail: 'client@example.test', tokenEnc: 'sealed-value' });
    expect((await weeklyReportTargets(db.owner)).some((row) => row.projectId === projectId)).toBe(false);
    await updateInvoiceSettings(db.app, owner, { reportWeekly: true });
    expect((await weeklyReportTargets(db.owner)).find((row) => row.projectId === projectId)).toMatchObject({ email: 'client@example.test', tokenEnc: 'sealed-value' });
  });

  it('writes a draft in sections, with chosen photos, then freezes it when sent', async () => {
    const phase = (await getProject(db.app, owner, projectId)).phases[0]!;
    const photos = [randomUUID(), randomUUID()];
    const report = { id: randomUUID(), projectId, phaseId: phase.id, progressPct: 30, note: 'Fouilles terminées', takenAt: new Date().toISOString(),
      photos: photos.map((id) => ({ id, storageKey: `org/${owner.orgId}/${id}.jpg`, mediaType: 'image/jpeg', sizeBytes: 1000, takenAt: new Date().toISOString() })) };
    await submitReport(db.app, owner, report);
    await reviewReport(db.app, owner, report.id, { decision: 'validated' });
    const { id } = await createClientReportDraft(db.app, owner, { projectId, from: today(-7), to: today(0) });
    let draft = await clientReportDraft(db.app, owner, id);
    expect(draft).toMatchObject({ status: 'draft' });
    expect(draft.candidates.filter((photo) => photo.chosen)).toHaveLength(2);
    expect(draft.facts.notes.map((note) => note.text)).toContain('Fouilles terminées');
    await updateClientReportDraft(db.app, owner, id, { sections: { summary: 'Les fouilles sont terminées : 30 % du chantier, et 80 % du gros œuvre.' }, photoIds: [photos[0]] });
    draft = await clientReportDraft(db.app, owner, id);
    expect(draft.report.photos.map((photo) => photo.id)).toEqual([photos[0]]);
    expect(draft.warnings.summary).toEqual(['80']);
    expect(await portalClientReport(db.owner, token, id)).toBeNull();
    await expect(updateClientReportDraft(db.app, lead, id, { note: 'x' })).rejects.toThrow();
    await sendClientReportDraft(db.app, owner, id, 'client@example.test');
    await expect(updateClientReportDraft(db.app, owner, id, { note: 'trop tard' })).rejects.toMatchObject({ code: 'report_sent' });
    // Frozen: a photo validated after the sending does not appear in what the client sees.
    const later = { ...report, id: randomUUID(), photos: [{ id: randomUUID(), storageKey: `org/${owner.orgId}/later.jpg`, mediaType: 'image/jpeg', sizeBytes: 1000, takenAt: new Date().toISOString() }] };
    await submitReport(db.app, owner, later);
    await reviewReport(db.app, owner, later.id, { decision: 'validated' });
    const seen = await portalClientReport(db.owner, token, id);
    expect(seen).toMatchObject({ status: 'sent', sections: { summary: expect.stringContaining('fouilles') } });
    expect(seen?.photos.map((photo) => photo.id)).toEqual([photos[0]]);
    expect((await portalClientReports(db.owner, token)).find((row) => row.id === id)?.summary).toContain('fouilles');
    await expect(deleteClientReportDraft(db.app, owner, id)).rejects.toThrow();
  });
  it('prepares the weekly report as a draft unless the company sends it without a reading', async () => {
    const draftId = await saveAutomaticClientReport(db.owner, { orgId: owner.orgId, projectId, from: today(-7), to: today(-1), sentTo: null, sections: { summary: 'Semaine calme.' } });
    expect((await clientReportDraft(db.app, owner, draftId)).status).toBe('draft');
    expect((await portalClientReports(db.owner, token)).some((row) => row.id === draftId)).toBe(false);
    const sentId = await saveAutomaticClientReport(db.owner, { orgId: owner.orgId, projectId, from: today(-14), to: today(-8), sentTo: 'client@example.test', sections: { summary: 'Envoyé seul.' } });
    expect((await portalClientReport(db.owner, token, sentId))?.sections.summary).toBe('Envoyé seul.');
    await deleteClientReportDraft(db.app, owner, draftId);
    expect((await listClientReports(db.app, owner, projectId)).some((row) => row.id === draftId)).toBe(false);
  });
  it('flags figures the facts do not hold', () => {
    const facts = { progressPct: 45, plannedOn: '2026-12-05', reportsCount: 3 };
    expect(unknownFigures('Le chantier est à 45 % ; 3 rapports ; la toiture le 5 décembre.', facts)).toEqual([]);
    expect(unknownFigures('Le chantier est à 60 % et sera livré en 2027.', facts)).toEqual(['60', '2027']);
  });
});
