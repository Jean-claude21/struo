import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFeature, createAnnouncement, createPortalLink, createProject, currentAnnouncement, endAnnouncement, founderMoney, founderTodo, listEditablePlans,
  listFeedback, onboardingSteps, planImpact, planRevisions, restorePlanRevision, savePlan, submitFeedback, type Actor,
} from '../src/index.ts';
import { createTestCompany, createUser, setupDatabase, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let demo: Actor;
let admin: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db, 'Bâtisseurs Réels SARL');
  demo = await createTestCompany(db, 'Démo SARL');
  admin = await createUser(db.owner, 'Fondateur');
  await db.owner.query(`update org_settings set plan_code = 'pro', paid_until = now() + interval '10 days' where org_id in ($1, $2)`, [owner.orgId, demo.orgId]);
  await db.owner.query('update org_settings set is_demo = true where org_id = $1', [demo.orgId]);
  await db.owner.query(`insert into plan_price (plan_code, currency_code, price_minor) values ('pro', 'EUR', 9900) on conflict do nothing`);
});
afterAll(async () => db.close());

const proDraft = async (patch: Record<string, unknown> = {}) => {
  const pro = (await listEditablePlans(db.owner)).find((plan) => plan.code === 'pro')!;
  return {
    code: 'pro', name: pro.name, nameEn: pro.nameEn, tagline: pro.tagline, taglineEn: pro.taglineEn, bullets: pro.bullets, bulletsEn: pro.bulletsEn,
    maxUsers: pro.maxUsers, maxProjects: pro.maxProjects, features: pro.features.filter((feature) => ['portal', 'ai', 'mcp', 'whatsapp'].includes(feature)),
    highlight: pro.highlight, public: pro.public, position: pro.position, ...patch,
  };
};

describe("the founder's console (spec 055)", () => {
  it('counts true money: demo companies never, each currency apart', async () => {
    const money = await founderMoney(db.owner);
    expect(money.paying).toBeGreaterThanOrEqual(1);
    expect(money.mrr.every((row) => typeof row.currency === 'string')).toBe(true);
    const todo = await founderTodo(db.owner);
    expect(todo.some((item) => item.kind === 'expiring' && item.orgId === owner.orgId)).toBe(true);
    expect(todo.some((item) => item.orgId === demo.orgId)).toBe(false);
    expect((await onboardingSteps(db.owner, owner.orgId))[owner.orgId]).toMatchObject({ site: false, invoice: false });
  });

  it('shows who a plan change touches, asks to confirm when paying clients lose something, and keeps every version', async () => {
    const without = await proDraft({ features: ['ai', 'mcp', 'whatsapp'] });
    const impact = await planImpact(db.owner, without);
    expect(impact).toMatchObject({ isNew: false, featuresRemoved: ['portal'] });
    expect(impact.paying).toBeGreaterThanOrEqual(1);
    await expect(savePlan(db.owner, admin, without)).rejects.toMatchObject({ code: 'plan_confirm_required' });
    await savePlan(db.owner, admin, without, { confirmCode: 'pro', note: 'test' });
    // The feature is really gone for the plan's companies.
    const projectId = (await createProject(db.app, owner, { name: 'Sans espace client', status: 'active' })).id;
    await expect(createPortalLink(db.app, owner, projectId)).rejects.toMatchObject({ code: 'plan_feature' });
    await expect(assertFeature(db.owner, owner.orgId, 'ai')).resolves.toBeUndefined();
    // Restored, the client space comes back.
    const [last] = await planRevisions(db.owner, 'pro');
    await restorePlanRevision(db.owner, admin, last!.id, 'pro');
    await expect(createPortalLink(db.app, owner, projectId)).resolves.toMatchObject({ token: expect.any(String) });
    expect((await planRevisions(db.owner, 'pro')).length).toBeGreaterThanOrEqual(2);
  });

  it('edits the words buyers read, and creates a plan; one plan highlighted at most', async () => {
    await savePlan(db.owner, admin, await proDraft({ bullets: 'Espace client\n**Assistant IA**', bulletsEn: 'Client space\n**AI assistant**' }));
    expect((await listEditablePlans(db.owner)).find((plan) => plan.code === 'pro')?.bullets).toContain('**Assistant IA**');
    expect((await savePlan(db.owner, admin, { code: 'equipe', name: 'Équipe', maxUsers: 10, maxProjects: 5, features: ['portal'], highlight: true, public: false, position: 9 })).created).toBe(true);
    const plans = await listEditablePlans(db.owner);
    expect(plans.filter((plan) => plan.highlight).map((plan) => plan.code)).toEqual(['equipe']);
    expect(plans.find((plan) => plan.code === 'equipe')?.prices).toEqual([]);
  });

  it('shows an announcement for its period, and takes what users report', async () => {
    const { id } = await createAnnouncement(db.owner, admin, { title: 'Maintenance dimanche', level: 'warning' });
    expect((await currentAnnouncement(db.app))?.title).toBe('Maintenance dimanche');
    await endAnnouncement(db.owner, admin, id);
    expect(await currentAnnouncement(db.app)).toBeNull();
    await submitFeedback(db.app, owner, { kind: 'problem', body: 'Le PDF ne s’ouvre pas', page: '/app/finance' });
    expect((await listFeedback(db.owner))[0]).toMatchObject({ kind: 'problem', page: '/app/finance', handledAt: null });
    expect((await founderTodo(db.owner)).some((item) => item.kind === 'feedback')).toBe(true);
  });
});
