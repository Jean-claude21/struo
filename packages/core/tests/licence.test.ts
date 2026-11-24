import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accessStage, companyAccess, createContactRequest, publicPrices, setPublicPrices, createProject, licenceNotice, licenceNoticeTargets, licenceSettings, listProjects, markNoticeOnce, resolveActor,
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
