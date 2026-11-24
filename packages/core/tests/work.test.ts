import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addDocument, attachDocumentFile, createProject, createTask, documentFile, documentVersionFile, listDocumentVersions, listNotes,
  listTasks, postNote, removeTask, updateTask, type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let lead: Actor;
let accountant: Actor;
let other: Actor;
let projectId: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  await db.owner.query(`update org_settings set plan_code = 'pro' where org_id = $1`, [owner.orgId]);
  lead = await addMember(db, owner.orgId, 'site_lead');
  accountant = await addMember(db, owner.orgId, 'accountant');
  other = await createTestCompany(db, 'Autre BTP');
  projectId = (await createProject(db.app, owner, { name: 'Villa test', status: 'active' })).id;
});
afterAll(async () => db.close());

describe('tasks (spec 046)', () => {
  it('gives a task to a person, who moves it forward but cannot edit it', async () => {
    const { id } = await createTask(db.app, owner, { projectId, title: 'Commander le ferraillage', assigneeId: lead.userId, dueOn: today(-1), priority: 'urgent' });
    const [task] = await listTasks(db.app, owner, { projectId });
    expect(task).toMatchObject({ id, status: 'todo', late: true, assigneeId: lead.userId, priority: 'urgent' });
    await updateTask(db.app, lead, id, { status: 'doing' });
    await expect(updateTask(db.app, lead, id, { title: 'Autre chose' })).rejects.toThrow();
    await expect(updateTask(db.app, accountant, id, { status: 'done' })).rejects.toThrow();
    await updateTask(db.app, lead, id, { status: 'done' });
    const [done] = await listTasks(db.app, owner, { projectId });
    expect(done).toMatchObject({ status: 'done', late: false });
    expect(done!.doneAt).not.toBeNull();
    expect(await listTasks(db.app, owner, { projectId, open: true })).toHaveLength(0);
    await removeTask(db.app, owner, id);
    expect(await listTasks(db.app, owner, { projectId })).toHaveLength(0);
  });
  it('refuses a task given to someone outside the company, and a writer without the right', async () => {
    await expect(createTask(db.app, owner, { projectId, title: 'X', assigneeId: other.userId })).rejects.toThrow();
    await expect(createTask(db.app, accountant, { projectId, title: 'X' })).rejects.toThrow();
  });
  it('keeps every company apart', async () => {
    await createTask(db.app, owner, { projectId, title: 'Visible chez nous' });
    expect(await listTasks(db.app, other, {})).toHaveLength(0);
    await expect(createTask(db.app, other, { projectId, title: 'Intrus' })).rejects.toThrow();
  });
});

describe('internal thread (spec 046)', () => {
  it('lets every member write, newest first, and nobody outside read', async () => {
    await postNote(db.app, owner, { projectId, body: 'Coulage décalé à jeudi.' });
    await postNote(db.app, lead, { projectId, body: 'Sable livré.' });
    const notes = await listNotes(db.app, accountant, projectId);
    expect(notes.map((note) => note.body)).toEqual(['Sable livré.', 'Coulage décalé à jeudi.']);
    expect(await listNotes(db.app, other, projectId)).toHaveLength(0);
    await expect(postNote(db.app, other, { projectId, body: 'Intrus' })).rejects.toThrow();
  });
});

describe('document versions (spec 046)', () => {
  it('keeps the replaced file as a previous version', async () => {
    const { id } = await addDocument(db.app, owner, { projectId, title: 'Plan de structure' });
    await attachDocumentFile(db.app, owner, id, { storageKey: 'k/v1', mediaType: 'application/pdf', sizeBytes: 10 });
    expect(await listDocumentVersions(db.app, owner, id)).toHaveLength(0);
    await attachDocumentFile(db.app, owner, id, { storageKey: 'k/v2', mediaType: 'application/pdf', sizeBytes: 12 });
    const versions = await listDocumentVersions(db.app, owner, id);
    expect(versions).toHaveLength(1);
    expect((await documentFile(db.app, owner, id))!.storageKey).toBe('k/v2');
    expect((await documentVersionFile(db.app, owner, id, versions[0]!.id))!.storageKey).toBe('k/v1');
    expect(await documentVersionFile(db.app, other, id, versions[0]!.id)).toBeNull();
  });
});
