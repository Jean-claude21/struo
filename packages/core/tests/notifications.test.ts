import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProject, markNoticesRead, myNoticePrefs, myNotices, NOTICE_KINDS, noticeChoices, recordNotices, setMyNoticePref, siteOffice, type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let lead: Actor;
let engineerA: Actor;
let engineerB: Actor;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db, 'Notifications SARL');
  lead = await addMember(db, owner.orgId, 'site_lead');
  engineerA = await addMember(db, owner.orgId, 'engineer');
  engineerB = await addMember(db, owner.orgId, 'engineer');
});
afterAll(async () => db.close());

describe('the notification centre (spec 073)', () => {
  it('keeps each notice for its person only, and marks them read', async () => {
    await recordNotices(db.owner, owner.orgId, [
      { userId: lead.userId, kind: 'review', title: 'Rapport validé · KC-01', body: 'Votre rapport est validé.', url: '/field' },
      { userId: lead.userId, kind: 'task', title: 'Tâche confiée', body: 'KC-01 · Couler la dalle', url: '/field' },
      { userId: owner.userId, kind: 'report', title: 'Rapport à valider', url: '/app/field' },
    ]);
    const mine = await myNotices(db.app, lead);
    expect(mine.unread).toBe(2);
    expect(mine.items.map((item) => item.title)).not.toContain('Rapport à valider');
    // Row-level security: another member cannot read or mark them.
    expect((await myNotices(db.app, engineerA)).items).toHaveLength(0);
    expect(await markNoticesRead(db.app, engineerA)).toBe(0);
    expect(await markNoticesRead(db.app, lead, [mine.items[0]!.id])).toBe(1);
    expect((await myNotices(db.app, lead)).unread).toBe(1);
    expect(await markNoticesRead(db.app, lead)).toBe(1);
    expect((await myNotices(db.app, lead)).unread).toBe(0);
  });

  it('follows each person’s choices, with defaults per kind', async () => {
    expect((await myNoticePrefs(db.app, lead)).find((pref) => pref.kind === 'task')).toEqual({ kind: 'task', ...NOTICE_KINDS.task });
    await setMyNoticePref(db.app, lead, { kind: 'task', push: true, email: false });
    const choices = await noticeChoices(db.owner, owner.orgId, [lead.userId, owner.userId], 'task');
    expect(choices.get(lead.userId)).toEqual({ push: true, email: false });
    expect(choices.get(owner.userId)).toEqual(NOTICE_KINDS.task);
    await expect(setMyNoticePref(db.app, lead, { kind: 'unknown', push: true, email: true })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('tells the engineers of a site only, all of them when the site has no manager', async () => {
    const managed = (await createProject(db.app, owner, { name: 'Chantier de A', status: 'active', managerId: engineerA.userId })).id;
    const open = (await createProject(db.app, owner, { name: 'Chantier sans responsable', status: 'active' })).id;
    const ids = async (projectId: string) => (await siteOffice(db.owner, owner.orgId, projectId)).map((person) => person.userId).sort();
    expect(await ids(managed)).toEqual([owner.userId, engineerA.userId].sort());
    expect(await ids(open)).toEqual([owner.userId, engineerA.userId, engineerB.userId].sort());
  });
});
