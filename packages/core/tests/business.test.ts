import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  actorFromApiKey, addDocument, addExpense, addMilestone, createApiKey, createInvoice, createPortalLink, createProject,
  getProject, importProjectsCsv, listAlerts, listDocuments, listInvoices, marginBySegment, portalPostMessage,
  portalValidateMilestone, portalView, receivablesAging, recordPayment, revokeApiKey, revokePortalLink, reviewReport,
  submitReport, financeSummary, operationsSummary, recentActivity, listProjects, listMilestones, gantt, listExpenses,
  marginByProject, complianceByProject, listReports, listIncidents, listPayments, listClients, getSettings, getSubscription,
  getConfiguration, listMembers, fieldSnapshot, listApiKeys, listPortalLinks, listMessages, reportAudioLocation, setReportTranscript, createPaymentIntent, settlePaymentIntent, toMinor, type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  // Paid plan: no project limit for these scenarios.
  await db.owner.query(`update org_settings set plan_code = 'pro' where org_id = $1`, [owner.orgId]);
});
afterAll(async () => db.close());

describe('finance (spec 005)', () => {
  it('computes VAT, retention and net in the database, in integers', async () => {
    const { id: projectId } = await createProject(db.app, owner, { name: 'Villa R+1', budgetMinor: 50_000_000, status: 'active' });
    const { number } = await createInvoice(db.app, owner, {
      projectId, kind: 'progress', amountMinor: 10_000_000, dueOn: today(30),
    });
    expect(number).toMatch(/^F-\d{4}-0001$/u);
    const [invoice] = await listInvoices(db.app, owner, { projectId });
    expect(invoice).toMatchObject({
      vatMinor: 1_800_000, totalMinor: 11_800_000, retentionMinor: 590_000, netMinor: 11_210_000, balanceMinor: 11_210_000,
    });
    await recordPayment(db.app, owner, { projectId, invoiceId: invoice!.id, amountMinor: 5_000_000, method: 'mobile_money' });
    const [after] = await listInvoices(db.app, owner, { projectId });
    expect(after).toMatchObject({ paidMinor: 5_000_000, balanceMinor: 6_210_000 });
    // An advance carries no retention.
    await createInvoice(db.app, owner, { projectId, kind: 'advance', amountMinor: 1_000_000, dueOn: today(10) });
    const advance = (await listInvoices(db.app, owner, { projectId })).find((row) => row.kind === 'advance');
    expect(advance?.retentionMinor).toBe(0);
  });

  it('ages receivables and raises an overdue alert', async () => {
    const { id: projectId } = await createProject(db.app, owner, { name: 'Immeuble R+3', budgetMinor: 80_000_000, status: 'suspended' });
    await createInvoice(db.app, owner, { projectId, kind: 'progress', amountMinor: 16_000_000, issuedOn: today(-90), dueOn: today(-45) });
    const aging = await receivablesAging(db.app, owner);
    expect(aging.d60.count).toBe(1);
    const alerts = await listAlerts(db.app, owner);
    const overdue = alerts.find((alert) => alert.kind === 'invoice_overdue' && alert.projectId === projectId);
    expect(overdue?.severity).toBe('critical');
    const project = await getProject(db.app, owner, projectId);
    expect(project.health).toBe('critical');
    const summary = await financeSummary(db.app, owner);
    expect(summary.overdueMinor).toBeGreaterThan(0);
  });

  it('refuses an accountant-less write from a site lead', async () => {
    const siteLead = await addMember(db, owner.orgId, 'site_lead');
    const { id: projectId } = await createProject(db.app, owner, { name: 'Entrepôt' });
    await expect(createInvoice(db.app, siteLead, { projectId, kind: 'progress', amountMinor: 1, dueOn: today(1) }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });

  it('parses amounts typed by people into minor units', () => {
    expect(toMinor('1 250 000', 'XOF')).toBe(1_250_000);
    expect(toMinor('12,50', 'EUR')).toBe(1250);
    expect(toMinor('12,5', 'XOF')).toBeNull();
    expect(toMinor('abc', 'XOF')).toBeNull();
  });
});

describe('field (spec 004)', () => {
  it('accepts a report twice without duplicating it, and applies progress once validated', async () => {
    const { id: projectId } = await createProject(db.app, owner, { name: 'Chantier terrain', status: 'active' });
    const project = await getProject(db.app, owner, projectId);
    const phase = project.phases[2]!;
    const siteLead = await addMember(db, owner.orgId, 'site_lead');
    const report = {
      id: randomUUID(), projectId, phaseId: phase.id, progressPct: 60, note: 'Dalle coulée', takenAt: new Date().toISOString(),
      photos: [{ id: randomUUID(), storageKey: `org/${owner.orgId}/p.jpg`, mediaType: 'image/jpeg', sizeBytes: 1000, takenAt: new Date().toISOString() }],
    };
    expect(await submitReport(db.app, siteLead, report)).toMatchObject({ created: true });
    expect(await submitReport(db.app, siteLead, report)).toMatchObject({ created: false });
    expect((await getProject(db.app, owner, projectId)).phases[2]!.progressPct).toBe(0);
    await reviewReport(db.app, owner, report.id, { decision: 'validated' });
    expect((await getProject(db.app, owner, projectId)).phases[2]!.progressPct).toBe(60);
    await expect(reviewReport(db.app, owner, report.id, { decision: 'rejected' })).rejects.toMatchObject({ code: 'already_reviewed' });
  });
});

describe('documents, planning and expenses (specs 006–008)', () => {
  it('starts every project with its required documents, and alerts on expiry', async () => {
    const { id: projectId } = await createProject(db.app, owner, { name: 'Centre de santé', status: 'active' });
    const documents = await listDocuments(db.app, owner, { projectId });
    expect(documents.map((d) => d.title)).toEqual(['Contrat', 'Ordre de service', 'Permis de construire', 'Assurance RC']);
    expect(documents.every((d) => d.status === 'missing')).toBe(true);
    await addDocument(db.app, owner, { projectId, title: 'Assurance RC 2026', status: 'valid', expiresOn: today(-1) });
    const expired = (await listDocuments(db.app, owner, { projectId })).find((d) => d.title === 'Assurance RC 2026');
    expect(expired?.status).toBe('expired');
    const alerts = await listAlerts(db.app, owner);
    expect(alerts.some((a) => a.kind === 'document_expired' && a.projectId === projectId)).toBe(true);
  });

  it('flags late milestones beyond the threshold', async () => {
    const { id: projectId } = await createProject(db.app, owner, { name: 'Bureaux', status: 'active' });
    await addMilestone(db.app, owner, { projectId, name: 'Achèvement fondations', plannedOn: today(-20) });
    const alerts = await listAlerts(db.app, owner);
    expect(alerts.find((a) => a.kind === 'milestone_late' && a.projectId === projectId)?.params.days).toBe(20);
  });

  it('computes margins per segment from expenses', async () => {
    const { id: projectId } = await createProject(db.app, owner, { name: 'Rénovation', budgetMinor: 10_000_000, status: 'active' });
    await createInvoice(db.app, owner, { projectId, kind: 'final', amountMinor: 1_000_000, dueOn: today(5) });
    await addExpense(db.app, owner, { projectId, category: 'materials', label: 'Ciment', amountMinor: 300_000 });
    const segments = await marginBySegment(db.app, owner);
    expect(segments.length).toBeGreaterThan(0);
  });
});

describe('client portal (spec 010)', () => {
  it('shows one project through a token, takes messages and validations, and stops when revoked', async () => {
    const { id: projectId } = await createProject(db.app, owner, { name: 'Villa diaspora', status: 'active' });
    const { id: milestoneId } = await addMilestone(db.app, owner, {
      projectId, name: 'Réception fondations', plannedOn: today(1), clientValidation: true,
    });
    const { id: linkId, token } = await createPortalLink(db.app, owner, projectId);
    const view = await portalView(db.app, token);
    expect(view?.project.name).toBe('Villa diaspora');
    expect(view?.company.name).toBe('Bâtiments Exemple SARL');
    await portalPostMessage(db.app, token, 'Bonjour, des photos ?');
    expect((await portalView(db.app, token))?.messages.at(-1)?.body).toBe('Bonjour, des photos ?');
    expect(await portalValidateMilestone(db.app, token, milestoneId, 'Client Exemple')).toBe(true);
    expect(await portalValidateMilestone(db.app, token, milestoneId, 'Client Exemple')).toBe(false);
    expect(await portalView(db.app, 'wrong-token')).toBeNull();
    await revokePortalLink(db.app, owner, linkId);
    expect(await portalView(db.app, token)).toBeNull();
  });

  it('turns a succeeded online payment into one payment, once', async () => {
    const { id: projectId } = await createProject(db.app, owner, { name: 'Paiement en ligne', status: 'active' });
    const { id: invoiceId } = await createInvoice(db.app, owner, { projectId, kind: 'advance', amountMinor: 500_000, dueOn: today(10) });
    const intentId = await createPaymentIntent(db.owner, { orgId: owner.orgId, invoiceId, provider: 'simulator', amountMinor: 590_000, currencyCode: 'XOF' });
    const outcome = { intentId, status: 'succeeded' as const, amountMinor: 590_000, currencyCode: 'XOF' };
    expect(await settlePaymentIntent(db.owner, outcome)).toBe('applied');
    expect(await settlePaymentIntent(db.owner, outcome)).toBe('ignored');
    const [invoice] = await listInvoices(db.app, owner, { projectId });
    expect(invoice?.balanceMinor).toBe(0);
  });
});

describe('MCP keys (spec 011)', () => {
  it('acts as its creator in its company, until revoked', async () => {
    const { id, key } = await createApiKey(db.app, owner, 'Claude');
    const actor = await actorFromApiKey(db.app, key, 'mcp');
    expect(actor).toMatchObject({ orgId: owner.orgId, userId: owner.userId, role: 'owner', door: 'mcp' });
    expect(await actorFromApiKey(db.app, 'struo_sk_wrong', 'mcp')).toBeNull();
    await revokeApiKey(db.app, owner, id);
    expect(await actorFromApiKey(db.app, key, 'mcp')).toBeNull();
  });
});

describe('CSV import (spec 003)', () => {
  it('imports a spreadsheet export, creating types and clients, and reports refused lines', async () => {
    const csv = [
      'N°;Nom;Type;Client;Statut;Budget;Début;Fin;Lieu',
      'X001;Villa test;Résidentiel;M. Exemple;En cours;45 000 000;01/02/2026;31/10/2026;Lomé',
      'X002;Entrepôt test;Commercial;Société Exemple;Achevé;12500000;2025-01-10;2025-09-30;Port',
      ';;;;;;;;',
      'X001;Doublon;;;;;;;',
    ].join('\n');
    const result = await importProjectsCsv(db.app, owner, csv);
    expect(result.created).toBe(2);
    expect(result.errors.map((e) => e.code)).toEqual(['invalid_input', 'code_taken']);
  });
});

describe('every read of the dashboard and pages answers (smoke)', () => {
  it('runs each listing without SQL error', async () => {
    const reads = [
      operationsSummary(db.app, owner), recentActivity(db.app, owner), listProjects(db.app, owner), listMilestones(db.app, owner),
      gantt(db.app, owner), listExpenses(db.app, owner), marginByProject(db.app, owner), complianceByProject(db.app, owner),
      listReports(db.app, owner), listIncidents(db.app, owner), listPayments(db.app, owner), listClients(db.app, owner),
      getSettings(db.app, owner), getSubscription(db.app, owner), getConfiguration(db.app, owner), listMembers(db.app, owner),
      fieldSnapshot(db.app, owner), listApiKeys(db.app, owner), financeSummary(db.app, owner), receivablesAging(db.app, owner),
      listInvoices(db.app, owner), listAlerts(db.app, owner),
    ];
    const results = await Promise.allSettled(reads);
    expect(results.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason))).toEqual([]);
    const { id } = await createProject(db.app, owner, { name: 'Smoke' });
    await expect(Promise.all([listPortalLinks(db.app, owner, id), listMessages(db.app, owner, id), getProject(db.app, owner, id)])).resolves.toBeTruthy();
  });
});

describe('voice notes (spec 015)', () => {
  it('keeps a voice note with its report, then its transcript', async () => {
    const { id: projectId } = await createProject(db.app, owner, { name: 'Chantier vocal', status: 'active' });
    const id = randomUUID();
    const result = await submitReport(db.app, owner, {
      id, projectId, takenAt: new Date().toISOString(),
      audio: { storageKey: `org/${owner.orgId}/audio/${id}`, mediaType: 'audio/webm', sizeBytes: 2048 },
    });
    expect(result).toMatchObject({ created: true, hasAudio: true });
    expect(await reportAudioLocation(db.app, owner, id)).toEqual({ storageKey: `org/${owner.orgId}/audio/${id}`, mediaType: 'audio/webm' });
    let [report] = await listReports(db.app, owner, { projectId });
    expect(report).toMatchObject({ hasAudio: true, transcriptStatus: 'pending', transcript: null });
    await setReportTranscript(db.app, { ...owner, door: 'job' }, id, { status: 'done', text: 'Coulage de la dalle terminé.' });
    [report] = await listReports(db.app, owner, { projectId });
    expect(report).toMatchObject({ transcriptStatus: 'done', transcript: 'Coulage de la dalle terminé.' });
    // Another company cannot reach the note.
    const other = await createTestCompany(db, 'Autre entreprise');
    expect(await reportAudioLocation(db.app, other, id)).toBeNull();
  });
});
