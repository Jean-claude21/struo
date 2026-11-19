import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMilestone, createProject, gantt, getProject, listMilestones, moveMilestone, restoreMilestoneDates, setMilestoneDependencies, updateMilestone,
  updatePhase, type Actor,
} from '../src/index.ts';
import { createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let other: Actor;
let siteA: string;
let siteB: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  other = await createTestCompany(db, 'Autre BTP SARL');
  siteA = (await createProject(db.app, owner, { name: 'Villa R+1', status: 'active' })).id;
  siteB = (await createProject(db.app, owner, { name: 'Clôture', status: 'active' })).id;
});
afterAll(async () => db.close());

const ms = (projectId: string, name: string, offset: number) => addMilestone(db.app, owner, { projectId, name, plannedOn: today(offset) }).then((row) => row.id);
const dateOf = async (id: string) => (await listMilestones(db.app, owner)).find((row) => row.id === id)!.plannedOn;

describe('milestone dependencies (spec 031)', () => {
  it('pushes every milestone waiting for a moved one, keeps the lag, and undo puts them back', async () => {
    const foundations = await ms(siteA, 'Fondations', 10);
    const slab = await ms(siteA, 'Dalle R+1', 30);
    const roof = await ms(siteA, 'Toiture', 50);
    const fence = await ms(siteB, 'Clôture posée', 32);
    await setMilestoneDependencies(db.app, owner, slab, { dependsOn: [{ id: foundations, lagDays: 14 }] });
    await setMilestoneDependencies(db.app, owner, roof, { dependsOn: [{ id: slab, lagDays: 21 }] });
    await setMilestoneDependencies(db.app, owner, fence, { dependsOn: [{ id: slab }] }); // another site

    // Foundations 20 days later: slab must be ≥ +30+14 = day 44, roof ≥ 44+21 = 65, fence ≥ 44.
    const { shifted } = await moveMilestone(db.app, owner, foundations, { plannedOn: today(30) });
    expect(shifted.map((item) => item.name).sort()).toEqual(['Clôture posée', 'Dalle R+1', 'Toiture']);
    expect(await dateOf(slab)).toBe(today(44));
    expect(await dateOf(roof)).toBe(today(65));
    expect(await dateOf(fence)).toBe(today(44));

    // Moving earlier pushes nothing.
    expect((await moveMilestone(db.app, owner, foundations, { plannedOn: today(5) })).shifted).toEqual([]);

    await restoreMilestoneDates(db.app, owner, { items: [{ id: foundations, plannedOn: today(10) }, ...shifted.map((item) => ({ id: item.id, plannedOn: item.from }))] });
    expect(await dateOf(slab)).toBe(today(30));
    expect(await dateOf(roof)).toBe(today(50));

    const view = await gantt(db.app, owner);
    expect(view.dependencies).toHaveLength(3);
  });

  it('refuses a loop at any depth, and itself', async () => {
    const a = await ms(siteB, 'A', 1);
    const b = await ms(siteB, 'B', 2);
    const c = await ms(siteB, 'C', 3);
    await setMilestoneDependencies(db.app, owner, b, { dependsOn: [{ id: a }] });
    await setMilestoneDependencies(db.app, owner, c, { dependsOn: [{ id: b }] });
    await expect(setMilestoneDependencies(db.app, owner, a, { dependsOn: [{ id: c }] })).rejects.toMatchObject({ code: 'dependency_cycle' });
    await expect(setMilestoneDependencies(db.app, owner, a, { dependsOn: [{ id: a }] })).rejects.toMatchObject({ code: 'dependency_cycle' });
  });

  it('never moves a reached milestone, and stays inside the company', async () => {
    const first = await ms(siteB, 'Implantation', 1);
    const done = await ms(siteB, 'Réception partielle', 3);
    await setMilestoneDependencies(db.app, owner, done, { dependsOn: [{ id: first }] });
    await updateMilestone(db.app, owner, done, { actualOn: today(0) });
    expect((await moveMilestone(db.app, owner, first, { plannedOn: today(20) })).shifted).toEqual([]);
    await expect(moveMilestone(db.app, owner, done, { plannedOn: today(9) })).rejects.toMatchObject({ code: 'already_validated' });
    await expect(setMilestoneDependencies(db.app, other, done, { dependsOn: [] })).rejects.toMatchObject({ status: 404 });
    await expect(moveMilestone(db.app, other, first, { plannedOn: today(2) })).rejects.toMatchObject({ status: 404 });
  });

  it('gives phases a planned window shown in the Gantt', async () => {
    const phase = (await getProject(db.app, owner, siteA)).phases[0]!;
    await updatePhase(db.app, owner, phase.id, { startDate: today(0), endDate: today(20) });
    const row = (await gantt(db.app, owner)).sites.find((site) => site.id === siteA)!;
    expect(row.phases.find((item) => item.id === phase.id)).toMatchObject({ startDate: today(0), endDate: today(20) });
    await expect(updatePhase(db.app, owner, phase.id, { startDate: today(10), endDate: today(1) })).rejects.toBeTruthy();
  });
});
