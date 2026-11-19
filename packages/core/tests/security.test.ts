import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProject, getProject, listProjects, listClients, createClient, DomainError, resolveActor, createInvoice,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, type TestDb } from './helpers.ts';

let db: TestDb;
beforeAll(async () => {
  db = await setupDatabase();
});
afterAll(async () => db.close());

describe('company isolation (constitution III)', () => {
  it('every table holding company data has row-level security enabled', async () => {
    const { rows } = await db.owner.query<{ table_name: string; rls: boolean }>(
      `select c.table_name, cl.relrowsecurity as rls
         from information_schema.columns c
         join pg_class cl on cl.relname = c.table_name and cl.relkind = 'r'
         join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
        where c.table_schema = 'public' and c.column_name = 'org_id'`,
    );
    expect(rows.length).toBeGreaterThan(15);
    expect(rows.filter((row) => !row.rls).map((row) => row.table_name)).toEqual([]);
  });

  it('the application role cannot bypass row-level security', async () => {
    const { rows } = await db.owner.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      `select rolbypassrls, rolsuper from pg_roles where rolname = 'struo_app'`,
    );
    expect(rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it("a member never sees nor writes another company's data", async () => {
    const a = await createTestCompany(db, 'Company A');
    const b = await createTestCompany(db, 'Company B');
    const { id: projectB } = await createProject(db.app, b, { name: 'Secret project of B' });
    await createClient(db.app, b, { name: 'Client of B' });

    expect(await listProjects(db.app, a)).toEqual([]);
    expect(await listClients(db.app, a)).toEqual([]);
    await expect(getProject(db.app, a, projectB)).rejects.toThrow(DomainError);

    // Forging the company id does not help: A is not a member of B.
    expect(await resolveActor(db.app, a.userId, b.orgId, 'web')).toBeNull();
    const forged = { ...a, orgId: b.orgId };
    await expect(createProject(db.app, forged, { name: 'Intrusion' })).rejects.toThrow();
    await expect(createInvoice(db.app, forged, { projectId: projectB, kind: 'progress', amountMinor: 100, dueOn: '2099-01-01' })).rejects.toThrow();

    // Even raw SQL as the application role sees nothing of B for A's user.
    const raw = await db.app.connect();
    try {
      await raw.query('begin');
      await raw.query(`select set_config('struo.user_id', $1, true)`, [a.userId]);
      const { rows } = await raw.query('select id from project');
      expect(rows).toEqual([]);
      await raw.query('rollback');
    } finally {
      raw.release();
    }
  });

  it('roles limit what a member may write', async () => {
    const owner = await createTestCompany(db, 'Company C');
    const siteLead = await addMember(db, owner.orgId, 'site_lead');
    await expect(createProject(db.app, siteLead, { name: 'Not allowed' })).rejects.toMatchObject({ code: 'forbidden' });
    const { id } = await createProject(db.app, owner, { name: 'Allowed' });
    // Reading is open to every member.
    expect((await getProject(db.app, siteLead, id)).name).toBe('Allowed');
  });

  it('the journal is append-only for the application', async () => {
    const owner = await createTestCompany(db, 'Company D');
    await createProject(db.app, owner, { name: 'Journaled' });
    const client = await db.app.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('struo.user_id', $1, true)`, [owner.userId]);
      await expect(client.query('delete from journal')).rejects.toThrow(/permission denied/u);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});

describe('plans and limits', () => {
  it('a trial company is limited to its plan', async () => {
    const owner = await createTestCompany(db, 'Company E');
    for (let i = 0; i < 3; i += 1) await createProject(db.app, owner, { name: `Project ${i}` });
    await expect(createProject(db.app, owner, { name: 'One too many' })).rejects.toMatchObject({ code: 'limit_projects' });
  });
});
