import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProject, createSubcontract, crewToday, fieldSnapshot, labourByProject, listAttendance, listExpenses, listSubcontracts, listWorkers,
  paySubcontract, recordAttendance, saveWorker, submitReport, updateSubcontract, type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let engineer: Actor;
let lead: Actor;
let accountant: Actor;
let other: Actor;
let projectId: string;
let mason: string;
let ironworker: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  await db.owner.query(`update org_settings set plan_code = 'pro' where org_id = $1`, [owner.orgId]);
  engineer = await addMember(db, owner.orgId, 'engineer');
  lead = await addMember(db, owner.orgId, 'site_lead');
  accountant = await addMember(db, owner.orgId, 'accountant');
  other = await createTestCompany(db, 'Autre BTP');
  projectId = (await createProject(db.app, owner, { name: 'Immeuble test', status: 'active' })).id;
  mason = (await saveWorker(db.app, owner, null, { name: 'Kossi Maçon', trade: 'Maçon', dayRateMinor: 5000 })).id;
  ironworker = (await saveWorker(db.app, owner, null, { name: 'Yawo Ferrailleur', trade: 'Ferrailleur', dayRateMinor: 6000 })).id;
});
afterAll(async () => db.close());

describe('workers (spec 047)', () => {
  it('shows day rates only to the roles that may see pay', async () => {
    expect((await listWorkers(db.app, accountant)).find((worker) => worker.id === mason)!.dayRateMinor).toBe(5000);
    expect((await listWorkers(db.app, engineer)).find((worker) => worker.id === mason)!.dayRateMinor).toBeNull();
    await expect(saveWorker(db.app, engineer, mason, { dayRateMinor: 1 })).rejects.toThrow();
    await saveWorker(db.app, engineer, mason, { phone: '+000 11' });
    await expect(saveWorker(db.app, lead, null, { name: 'Intrus' })).rejects.toThrow();
    expect(await listWorkers(db.app, other)).toHaveLength(0);
  });
});

describe('presences (spec 047)', () => {
  it('records who was present with the day report, and the site lead finds the crew again', async () => {
    const takenAt = new Date().toISOString();
    await submitReport(db.app, lead, { id: randomUUID(), projectId, note: 'Coffrage', takenAt, workerIds: [mason, ironworker] });
    const day = (await listAttendance(db.app, owner, { from: today(-1), to: today(1) }))[0]!;
    expect(day.workers.map((worker) => worker.name).sort()).toEqual(['Kossi Maçon', 'Yawo Ferrailleur']);
    expect((await crewToday(db.app, owner, day.day)).workers).toBe(2);
    const snapshot = await fieldSnapshot(db.app, lead);
    expect(snapshot.workers.map((worker) => worker.id).sort()).toEqual([mason, ironworker].sort());
    expect(snapshot.projects.find((project) => project.id === projectId)!.lastCrew.sort()).toEqual([mason, ironworker].sort());
    // The office corrects the day: only the mason was there.
    await recordAttendance(db.app, engineer, { projectId, day: day.day, workerIds: [mason], replace: true });
    expect((await listAttendance(db.app, owner, { from: day.day, to: day.day }))[0]!.workers).toHaveLength(1);
  });
  it('costs the labour from presences, for the roles that see pay', async () => {
    expect((await labourByProject(db.app, owner)).find((row) => row.projectId === projectId)).toMatchObject({ days: 1, workers: 1, costMinor: 5000 });
    expect((await labourByProject(db.app, engineer)).find((row) => row.projectId === projectId)!.costMinor).toBeNull();
  });
  it('refuses a worker of another company', async () => {
    const stranger = (await saveWorker(db.app, other, null, { name: 'Ailleurs' })).id;
    await expect(recordAttendance(db.app, owner, { projectId, day: today(0), workerIds: [stranger] })).rejects.toThrow();
  });
});

describe('subcontracts (spec 047)', () => {
  it('follows the agreed amount, the progress and the payments recorded as expenses', async () => {
    const { id } = await createSubcontract(db.app, engineer, { projectId, name: 'Électricité Afi', trade: 'Électricien', agreedMinor: 1_000_000 });
    await updateSubcontract(db.app, engineer, id, { progressPct: 40 });
    let [contract] = await listSubcontracts(db.app, owner, { projectId });
    expect(contract).toMatchObject({ agreedMinor: 1_000_000, progressPct: 40, paidMinor: 0, dueMinor: 400_000 });
    await expect(paySubcontract(db.app, engineer, id, { amountMinor: 1 })).resolves.toBeTruthy();
    await paySubcontract(db.app, accountant, id, { amountMinor: 299_999 });
    [contract] = await listSubcontracts(db.app, owner, { projectId });
    expect(contract).toMatchObject({ paidMinor: 300_000, dueMinor: 100_000 });
    const expenses = await listExpenses(db.app, owner, { projectId });
    expect(expenses.filter((expense) => expense.category === 'subcontracting').reduce((sum, expense) => sum + Number(expense.amountMinor), 0)).toBe(300_000);
    await expect(paySubcontract(db.app, lead, id, { amountMinor: 1 })).rejects.toThrow();
    expect(await listSubcontracts(db.app, other, {})).toHaveLength(0);
  });
});
