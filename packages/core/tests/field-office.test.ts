import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMaterialRequest, createProject, listMaterialRequests, listNotes, postNote, updateMaterialRequest, type Actor } from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let lead: Actor;
let accountant: Actor;
let projectId: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  lead = await addMember(db, owner.orgId, 'site_lead');
  accountant = await addMember(db, owner.orgId, 'accountant');
  projectId = (await createProject(db.app, owner, { name: 'Immeuble terrain', status: 'active' })).id;
});
afterAll(async () => db.close());

describe('field and office (spec 052)', () => {
  it('takes a material request from the field once, and lets the office move it on', async () => {
    const id = randomUUID();
    const request = { id, projectId, item: 'Ciment', quantity: '40 sacs', neededOn: today(2), note: 'Pour la dalle de jeudi' };
    expect(await createMaterialRequest(db.app, lead, request)).toEqual({ id, created: true });
    expect(await createMaterialRequest(db.app, lead, request)).toEqual({ id, created: false });
    await expect(createMaterialRequest(db.app, accountant, { ...request, id: randomUUID() })).rejects.toThrow();
    expect((await listMaterialRequests(db.app, owner, { open: true }))[0]).toMatchObject({ id, status: 'open', requesterName: expect.any(String) });
    await expect(updateMaterialRequest(db.app, lead, id, { status: 'ordered' })).rejects.toThrow();
    expect(await updateMaterialRequest(db.app, owner, id, { status: 'ordered', officeNote: 'Livraison mercredi' })).toMatchObject({ requestedBy: lead.userId, status: 'ordered' });
    await updateMaterialRequest(db.app, owner, id, { status: 'delivered' });
    await expect(updateMaterialRequest(db.app, owner, id, { status: 'cancelled' })).rejects.toMatchObject({ code: 'request_closed' });
    expect(await listMaterialRequests(db.app, lead, { open: true, mine: true })).toHaveLength(0);
    expect((await listMaterialRequests(db.app, lead, { mine: true }))[0]).toMatchObject({ status: 'delivered', officeNote: 'Livraison mercredi' });
  });

  it('keeps a thread message sent twice from the outbox once', async () => {
    const id = randomUUID();
    expect(await postNote(db.app, lead, { id, projectId, body: 'Il manque les fers de 10.' })).toEqual({ id, created: true });
    expect(await postNote(db.app, lead, { id, projectId, body: 'Il manque les fers de 10.' })).toEqual({ id, created: false });
    expect((await listNotes(db.app, owner, projectId)).filter((note) => note.id === id)).toHaveLength(1);
    expect((await postNote(db.app, owner, { projectId, body: 'Commandés.' })).created).toBe(true);
  });
});
