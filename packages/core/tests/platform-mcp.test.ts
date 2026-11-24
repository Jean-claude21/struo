import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  changesSince, createPlatformKey, createPortalLink, createProject, featureGrants, grantFeature, listCompaniesFor, listPlatformKeys, platformBrief,
  grantPlatformMcp, listPlatformMcpGrants, platformKeyOwner, platformMcpGrant, revokeFeatureGrant, revokePlatformKey, revokePlatformMcpGrant, type Actor,
} from '../src/index.ts';
import { createTestCompany, createUser, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let admin: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db, 'Chantiers Pilote SARL');
  admin = await createUser(db.owner, 'Fondateur MCP');
});
afterAll(async () => db.close());

describe('the console through MCP (spec 056)', () => {
  it('keeps only the hash of a platform key, knows who it acts for, and stops when revoked', async () => {
    const { id, key } = await createPlatformKey(db.owner, admin, { name: 'Routine du lundi', readOnly: true });
    expect(key.startsWith('struo_pk_')).toBe(true);
    expect(await platformKeyOwner(db.owner, key)).toMatchObject({ adminId: admin, readOnly: true });
    expect(await platformKeyOwner(db.owner, 'struo_pk_wrong')).toBeNull();
    const listed = (await listPlatformKeys(db.owner)).find((row) => row.id === id)!;
    expect(listed.masked).not.toContain(key.slice(13, -4));
    expect(listed.lastUsedAt).not.toBeNull();
    await revokePlatformKey(db.owner, admin, id);
    expect(await platformKeyOwner(db.owner, key)).toBeNull();
  });

  it('grants a feature to one company outside its plan, until a date', async () => {
    await db.owner.query(`update org_settings set plan_code = 'starter' where org_id = $1`, [owner.orgId]);
    const projectId = (await createProject(db.app, owner, { name: 'Pilote', status: 'active' })).id;
    await expect(createPortalLink(db.app, owner, projectId)).rejects.toMatchObject({ code: 'plan_feature' });
    await grantFeature(db.owner, admin, { orgId: owner.orgId, feature: 'portal', until: today(30), reason: 'pilote' });
    await expect(createPortalLink(db.app, owner, projectId)).resolves.toMatchObject({ token: expect.any(String) });
    await grantFeature(db.owner, admin, { orgId: owner.orgId, feature: 'portal', until: today(-1) });
    expect((await featureGrants(db.owner, owner.orgId))[0]).toMatchObject({ feature: 'portal', active: false });
    await expect(createPortalLink(db.app, owner, projectId)).rejects.toMatchObject({ code: 'plan_feature' });
    await revokeFeatureGrant(db.owner, admin, owner.orgId, 'portal');
    expect(await featureGrants(db.owner, owner.orgId)).toHaveLength(0);
  });

  it('answers routines: companies filtered, what changed since a moment, the whole point', async () => {
    const companies = await listCompaniesFor(db.owner, { q: 'Pilote', plan: 'starter' });
    expect(companies.map((row) => row.name)).toEqual(['Chantiers Pilote SARL']);
    expect(companies[0]?.steps).toMatchObject({ site: true });
    const changes = await changesSince(db.owner, new Date(Date.now() - 3_600_000).toISOString());
    expect(changes.newCompanies.some((row) => (row as { name: string }).name === 'Chantiers Pilote SARL')).toBe(true);
    await expect(changesSince(db.owner, 'not a date')).rejects.toThrow();
    const brief = await platformBrief(db.owner);
    expect(brief).toMatchObject({ money: expect.any(Object), todo: expect.any(Object), health: expect.any(Object), platform: expect.any(Object), lastSevenDays: expect.any(Object) });
  });

  it('connects an assistant to the console through OAuth, read-only or not, until revoked', async () => {
    expect(await platformMcpGrant(db.owner, admin, 'client-claude')).toBeNull();
    await grantPlatformMcp(db.owner, admin, 'client-claude', true);
    expect(await platformMcpGrant(db.owner, admin, 'client-claude')).toMatchObject({ readOnly: true });
    await grantPlatformMcp(db.owner, admin, 'client-claude', false);
    expect((await listPlatformMcpGrants(db.owner)).filter((row) => row.clientId === 'client-claude')).toHaveLength(1);
    expect(await platformMcpGrant(db.owner, admin, 'client-claude')).toMatchObject({ readOnly: false });
    await revokePlatformMcpGrant(db.owner, admin, admin, 'client-claude');
    expect(await platformMcpGrant(db.owner, admin, 'client-claude')).toBeNull();
  });
});
