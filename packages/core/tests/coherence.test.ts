import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addDocument, addMilestone, contractValue, createChangeOrder, createPortalLink, createProject, createTask, decideChangeOrder, importWorkers,
  invoiceChangeOrder, listAlerts, listChangeOrders, listChecklistTemplates, listDocuments, listIncidents, listInvoices, listTasks, listWorkers,
  portalChangeOrders, portalDecideChangeOrder, reportIncident, saveChecklistTemplate, sendChangeOrder, siteDay, submitChecklist,
  updateIncident, updateTask, type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let engineer: Actor;
let lead: Actor;
let other: Actor;
let projectId: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  await db.owner.query(`update org_settings set plan_code = 'pro' where org_id = $1`, [owner.orgId]);
  engineer = await addMember(db, owner.orgId, 'engineer');
  lead = await addMember(db, owner.orgId, 'site_lead');
  other = await createTestCompany(db, 'Autre BTP');
  projectId = (await createProject(db.app, owner, { name: 'Clinique test', status: 'active', budgetMinor: 10_000_000 })).id;
  await db.owner.query('update project set manager_id = $2 where id = $1', [projectId, engineer.userId]);
});
afterAll(async () => db.close());

describe('incident and task are one action (spec 048)', () => {
  it('creates the task of an incident, and keeps both in step', async () => {
    const incidentId = randomUUID();
    await reportIncident(db.app, lead, { id: incidentId, projectId, kind: 'defect', priority: 'critical', description: 'Fissure sur poteau P4' });
    const task = (await listTasks(db.app, owner, { projectId })).find((item) => item.incidentId === incidentId)!;
    expect(task).toMatchObject({ title: 'Fissure sur poteau P4', assigneeId: engineer.userId, priority: 'urgent', status: 'todo', dueOn: today(1) });
    await updateTask(db.app, engineer, task.id, { status: 'doing' });
    expect((await listIncidents(db.app, owner, { projectId })).find((item) => item.id === incidentId)!.status).toBe('in_progress');
    await updateTask(db.app, engineer, task.id, { status: 'done' });
    expect((await listIncidents(db.app, owner, { projectId })).find((item) => item.id === incidentId)!.status).toBe('resolved');
    await updateIncident(db.app, engineer, incidentId, { status: 'open' });
    expect((await listTasks(db.app, owner, { projectId })).find((item) => item.id === task.id)!.status).toBe('todo');
  });
  it('links a task to a milestone of its own site only, and raises an alert when late', async () => {
    const { id: milestoneId } = await addMilestone(db.app, owner, { projectId, name: 'Dalle R+1', plannedOn: today(10) });
    const { id } = await createTask(db.app, owner, { projectId, title: 'Commander les aciers', milestoneId, dueOn: today(-2), assigneeId: engineer.userId });
    expect((await listTasks(db.app, owner, { projectId })).find((item) => item.id === id)).toMatchObject({ milestoneName: 'Dalle R+1' });
    const elsewhere = (await createProject(db.app, owner, { name: 'Autre chantier' })).id;
    await expect(createTask(db.app, owner, { projectId: elsewhere, title: 'X', milestoneId })).rejects.toThrow();
    expect((await listAlerts(db.app, owner)).some((alert) => alert.kind === 'task_late' && alert.target === id)).toBe(true);
  });
});

describe('checklists (spec 048)', () => {
  it('sets when a checklist applies, and turns unticked points into an incident with its task', async () => {
    const { id } = await saveChecklistTemplate(db.app, engineer, null, { name: 'Avant coulage', items: ['Coffrage', 'Ferraillage'], mode: 'phase', phaseName: 'Gros œuvre' });
    expect((await listChecklistTemplates(db.app, owner)).find((item) => item.id === id)).toMatchObject({ mode: 'phase', phaseName: 'Gros œuvre', required: true });
    await expect(saveChecklistTemplate(db.app, engineer, null, { name: 'Sans phase', items: ['A'], mode: 'phase' })).rejects.toThrow();
    await expect(saveChecklistTemplate(db.app, lead, null, { name: 'Intrus', items: ['A'], mode: 'daily' })).rejects.toThrow();
    await submitChecklist(db.app, lead, { id: randomUUID(), projectId, templateId: id, name: 'Avant coulage', items: [{ label: 'Coffrage', done: true }, { label: 'Ferraillage', done: false }], doneAt: new Date().toISOString() });
    const incident = (await listIncidents(db.app, owner, { projectId })).find((item) => item.description.includes('Ferraillage'))!;
    expect(incident).toMatchObject({ kind: 'defect', status: 'open' });
    expect((await listTasks(db.app, owner, { projectId })).some((item) => item.incidentId === incident.id)).toBe(true);
  });
});

describe('documents have a family (spec 048)', () => {
  it('files a document by family, from its type or as chosen', async () => {
    const { id } = await addDocument(db.app, owner, { projectId, title: 'Plan de ferraillage R+1', family: 'technical' });
    const { id: other2 } = await addDocument(db.app, owner, { projectId, title: 'Courrier' });
    const docs = await listDocuments(db.app, owner, { projectId });
    expect(docs.find((doc) => doc.id === id)!.family).toBe('technical');
    expect(docs.find((doc) => doc.id === other2)!.family).toBe('other');
  });
});

describe('change orders (spec 048)', () => {
  it('goes from draft to the client’s answer in the portal, then to an invoice', async () => {
    const { id, number } = await createChangeOrder(db.app, engineer, { projectId, title: 'Mur de clôture supplémentaire', amountMinor: 1_500_000, daysAdded: 6 });
    expect(number).toBe(1);
    const { token } = await createPortalLink(db.app, owner, projectId);
    expect(await portalChangeOrders(db.app, token)).toHaveLength(0);
    await sendChangeOrder(db.app, engineer, id);
    expect((await portalChangeOrders(db.app, token))[0]).toMatchObject({ number: 1, status: 'sent' });
    expect(await portalDecideChangeOrder(db.app, token, { id, accept: true, signer: 'M. Client' })).toBe(true);
    expect(await portalDecideChangeOrder(db.app, token, { id, accept: false, signer: 'M. Client' })).toBe(false);
    expect(await contractValue(db.app, owner, projectId)).toMatchObject({ budgetMinor: 10_000_000, acceptedMinor: 1_500_000, totalMinor: 11_500_000, daysAdded: 6 });
    const { invoiceId } = await invoiceChangeOrder(db.app, owner, id, today(30), (n, title) => `Avenant n°${n} · ${title}`);
    expect((await listInvoices(db.app, owner, { projectId })).find((invoice) => invoice.id === invoiceId)).toBeTruthy();
    await expect(invoiceChangeOrder(db.app, owner, id, today(30), () => 'x')).rejects.toThrow();
    expect((await listChangeOrders(db.app, owner, projectId))[0]!.invoiceId).toBe(invoiceId);
    expect(await listChangeOrders(db.app, other, projectId)).toHaveLength(0);
  });
  it('records an answer given in person, and refuses a second one', async () => {
    const { id } = await createChangeOrder(db.app, owner, { projectId, title: 'Carrelage haut de gamme', amountMinor: 800_000 });
    await decideChangeOrder(db.app, owner, id, { accept: false, decidedBy: 'Mme Client' });
    await expect(decideChangeOrder(db.app, owner, id, { accept: true, decidedBy: 'Mme Client' })).rejects.toThrow();
  });
});

describe('the day journal and the worker import (spec 048)', () => {
  it('gathers the day of a site from what is recorded', async () => {
    const journal = await siteDay(db.app, owner, projectId, today(0));
    expect(journal.project.name).toBe('Clinique test');
    expect(journal.checklists.length).toBeGreaterThan(0);
    expect(journal.incidents.length).toBeGreaterThan(0);
    await expect(siteDay(db.app, other, projectId, today(0))).rejects.toThrow();
  });
  it('imports workers pasted from a spreadsheet, skipping known names', async () => {
    const result = await importWorkers(db.app, owner, 'Nom;Métier;Téléphone;Taux\nAli Maçon;Maçon;90 11 22 33;6 000\nBeno Fer\tFerrailleur\t\t6500\nAli Maçon;Maçon;;');
    expect(result).toEqual({ added: 2, skipped: 2 });
    expect((await listWorkers(db.app, owner)).find((worker) => worker.name === 'Ali Maçon')).toMatchObject({ trade: 'Maçon', dayRateMinor: 6000 });
  });
});
