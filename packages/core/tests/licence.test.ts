import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accessStage, companyAccess, companyForBuyer, createCompany, founderTodo, platformOverview, productHealth, setCompanyInternal, demoPerDay, resetDemoLimits, setDemoPerDay, setTrialSettings, trialSettings, createContactRequest, listStorePulses, recordStorePulse, settleStorePulse, publicPrices, setPublicPrices, createProject, licenceNotice, licenceNoticeTargets, licenceSettings, listProjects, markNoticeOnce, resolveActor,
  setLicenceSettings, type Actor,
} from '../src/index.ts';
import { createTestCompany, createUser, setupDatabase, type TestDb } from './helpers.ts';

let db: TestDb;
let company: Actor;
let admin: string;
beforeAll(async () => {
  db = await setupDatabase();
  company = await createTestCompany(db, 'Fin de licence SARL');
  admin = await createUser(db.owner, 'Fondateur');
  await setLicenceSettings(db.owner, admin, { warnDays: 14, graceDays: 7 });
});
afterAll(async () => db.close());

const DAY = 86_400_000;
const settings = { warnDays: 14, graceDays: 7 };
const now = new Date('2026-06-15T12:00:00Z');
const at = (days: number) => new Date(now.getTime() + days * DAY);

describe('the end of a licence (spec 060)', () => {
  it('goes active, ending, grace, then read-only', () => {
    expect(accessStage('paid', at(30), settings, now).stage).toBe('active');
    expect(accessStage('paid', at(10), settings, now)).toMatchObject({ stage: 'ending', daysLeft: 10 });
    expect(accessStage('paid', at(-2), settings, now)).toMatchObject({ stage: 'grace', daysLeft: 5 });
    expect(accessStage('paid', at(-8), settings, now).stage).toBe('locked');
    // No period (demo, plan set by the platform): never locked.
    expect(accessStage(null, null, settings, now).stage).toBe('active');
    // No grace at all: read-only the day after.
    expect(accessStage('trial', at(-0.5), { warnDays: 3, graceDays: 0 }, now).stage).toBe('locked');
  });

  it('warns at the start of the window, then at 7, 3 and 1 days, then once ended and once read-only', () => {
    const notice = (days: number) => licenceNotice(accessStage('paid', at(days), settings, now), 14)?.target.split(':').slice(0, 2).join(':');
    expect(notice(20)).toBeUndefined();
    expect(notice(13)).toBe('ending:14');
    expect(notice(6)).toBe('ending:7');
    expect(notice(2)).toBe('ending:3');
    expect(notice(0.5)).toBe('ending:1');
    expect(notice(-1)).toBe('ended:2026-06-14');
    expect(notice(-9)).toBe('locked:2026-06-06');
  });

  it('turns the space read-only after the grace period, and opens it again with a new licence', async () => {
    await db.owner.query(`update org_settings set plan_code = 'pro', paid_until = now() - interval '3 days' where org_id = $1`, [company.orgId]);
    expect((await companyAccess(db.owner, company.orgId)).stage).toBe('grace');
    const inGrace = (await resolveActor(db.app, company.userId, company.orgId, 'web'))!;
    await expect(createProject(db.app, inGrace, { name: 'Encore possible', status: 'active' })).resolves.toMatchObject({ id: expect.any(String) });

    await db.owner.query(`update org_settings set paid_until = now() - interval '10 days' where org_id = $1`, [company.orgId]);
    const locked = (await resolveActor(db.app, company.userId, company.orgId, 'web'))!;
    expect(locked.locked).toBe(true);
    await expect(createProject(db.app, locked, { name: 'Refusé', status: 'active' })).rejects.toMatchObject({ code: 'licence_locked' });
    // Reading stays open.
    await expect(listProjects(db.app, locked)).resolves.toEqual(expect.any(Array));

    // The founder's grace setting is what decides.
    await setLicenceSettings(db.owner, admin, { warnDays: 14, graceDays: 30 });
    expect((await licenceSettings(db.owner)).graceDays).toBe(30);
    expect((await resolveActor(db.app, company.userId, company.orgId, 'web'))!.locked).toBeUndefined();
    await setLicenceSettings(db.owner, admin, settings);

    await db.owner.query(`update org_settings set paid_until = now() + interval '3 months' where org_id = $1`, [company.orgId]);
    expect((await resolveActor(db.app, company.userId, company.orgId, 'web'))!.locked).toBeUndefined();
  });

  it('lists the companies to warn and sends each notice only once', async () => {
    await db.owner.query(`update org_settings set paid_until = now() + interval '5 days' where org_id = $1`, [company.orgId]);
    const target = (await licenceNoticeTargets(db.owner)).find((item) => item.orgId === company.orgId);
    expect(target?.access.stage).toBe('ending');
    const notice = licenceNotice(target!.access, target!.warnDays)!;
    expect(await markNoticeOnce(db.owner, company.orgId, notice.target)).toBe(true);
    expect(await markNoticeOnce(db.owner, company.orgId, notice.target)).toBe(false);
  });

  it('refuses settings out of range', async () => {
    await expect(setLicenceSettings(db.owner, admin, { warnDays: 100, graceDays: 7 })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('public prices and call-back requests (spec 062)', () => {
  it('shows « on quote » until the founder turns prices on', async () => {
    expect(await publicPrices(db.owner)).toBe(false);
    expect(await setPublicPrices(db.owner, admin, true)).toBe(true);
    expect(await publicPrices(db.app)).toBe(true);
    await setPublicPrices(db.owner, admin, false);
  });

  it('records a call-back request once per hour for the same contact', async () => {
    const request = { name: 'Awa', company: 'Bâtir SARL', reach: '+00 11 22 33', activeSites: 4, message: '', locale: 'fr' };
    expect(await createContactRequest(db.owner, request)).toBe(true);
    expect(await createContactRequest(db.owner, request)).toBe(false);
  });

  it('only the name and a way to reach the person are required (spec 068)', async () => {
    expect(await createContactRequest(db.owner, { name: 'Kossi', company: '', reach: 'kossi@example.com', activeSites: null, message: '', locale: 'fr' })).toBe(true);
    await expect(createContactRequest(db.owner, { name: '', company: 'X', reach: 'kossi2@example.com', locale: 'fr' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(createContactRequest(db.owner, { name: 'Kossi', company: 'X', reach: '', locale: 'fr' })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('store Pulses (spec 069)', () => {
  it('records each delivery once and finds the company of the buyer by e-mail', async () => {
    expect(await recordStorePulse(db.owner, { deliveryId: 'del_1', event: 'license.issued', buyerEmail: 'X@Example.com', productId: 'prd_1' })).toBe(true);
    expect(await recordStorePulse(db.owner, { deliveryId: 'del_1', event: 'license.issued' })).toBe(false);
    await settleStorePulse(db.owner, 'del_1', 'applied', { companyName: 'Fin de licence SARL', text: 'pro until 2027-01-01' });
    expect((await listStorePulses(db.owner)).find((item) => item.deliveryId === 'del_1')).toMatchObject({ outcome: 'applied', buyerEmail: 'x@example.com' });
    const { rows } = await db.owner.query<{ email: string }>('select email from "user" where id = $1', [company.userId]);
    expect(await companyForBuyer(db.owner, rows[0]!.email.toUpperCase())).toMatchObject({ orgId: company.orgId, userId: company.userId });
    expect(await companyForBuyer(db.owner, 'nobody@example.com')).toBeNull();
  });
});

describe('the free trial belongs to the founder (spec 072)', () => {
  it('new companies get the trial length set in the console', async () => {
    await setTrialSettings(db.owner, admin, { days: 30, public: false });
    expect(await trialSettings(db.app)).toEqual({ days: 30, public: false });
    const { orgId } = await createCompany(db.app, company.userId, { name: 'Essai Trente SARL', countryCode: 'TG', currencyCode: 'XOF', vatBps: 1800, retentionBps: 500, locale: 'fr' });
    const { rows } = await db.owner.query<{ days: number }>(`select round(extract(epoch from (trial_ends_at - now())) / 86400)::int as days from org_settings where org_id = $1`, [orgId]);
    expect(rows[0]!.days).toBe(30);
    await setTrialSettings(db.owner, admin, { days: 14, public: true });
    await expect(setTrialSettings(db.owner, admin, { days: 0, public: true })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('the demo limit belongs to the founder (spec 072)', () => {
  it('sets the limit per address, opens it fully, and lifts the counts of the day', async () => {
    expect(await demoPerDay(db.owner)).toBe(10);
    expect(await setDemoPerDay(db.owner, admin, 0)).toBe(0);
    expect(await demoPerDay(db.owner)).toBe(0);
    await expect(resetDemoLimits(db.owner, admin)).resolves.toEqual(expect.any(Number));
    await setDemoPerDay(db.owner, admin, 10);
    await expect(setDemoPerDay(db.owner, admin, -1)).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('internal companies stay out of the figures (spec 074)', () => {
  it('works normally but leaves the founder figures', async () => {
    const { orgId } = await createCompany(db.app, company.userId, { name: 'Tests Internes SARL', countryCode: 'TG', currencyCode: 'XOF', vatBps: 1800, retentionBps: 500, locale: 'fr' });
    await db.owner.query(`update org_settings set trial_ends_at = now() + interval '2 days' where org_id = $1`, [orgId]);
    expect((await founderTodo(db.owner)).some((item) => item.orgId === orgId)).toBe(true);
    await setCompanyInternal(db.owner, admin, orgId, true);
    expect((await founderTodo(db.owner)).some((item) => item.orgId === orgId)).toBe(false);
    expect((await platformOverview(db.owner)).find((item) => item.orgId === orgId)?.isInternal).toBe(true);
    await expect(productHealth(db.owner)).resolves.toBeTruthy();
    // Still a working company: its access is computed like any other.
    expect((await companyAccess(db.owner, orgId)).stage).toBe('ending');
  });
});
