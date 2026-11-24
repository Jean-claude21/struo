import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createContactRequest, getSubscription, listContactRequests, listPlansIn, markContactHandled, setPlanPrice, startSubscriptionPayment, type Actor,
} from '../src/index.ts';
import { homeOf, screenOf, sees } from '../src/permissions.ts';
import { createTestCompany, setupDatabase, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
});
afterAll(async () => db.close());

describe('screens per role (spec 045)', () => {
  it('maps a path to its screen', () => {
    expect(screenOf('/app')).toBe('today');
    expect(screenOf('/app/finance')).toBe('finance');
    expect(screenOf('/app/invoices/abc')).toBe('finance');
    expect(screenOf('/app/projects/123')).toBe('projects');
    expect(screenOf('/app/unknown')).toBeNull();
  });
  it('shows each role its own part only', () => {
    expect(sees('engineer', 'finance')).toBe(false);
    expect(sees('engineer', 'planning')).toBe(true);
    expect(sees('accountant', 'finance')).toBe(true);
    expect(sees('accountant', 'planning')).toBe(false);
    expect(sees('site_lead', 'today')).toBe(false);
    expect(sees('site_lead', 'account')).toBe(true);
    expect(sees('owner', 'settings')).toBe(true);
    expect(homeOf('site_lead')).toBe('/field');
    expect(homeOf('accountant')).toBe('/app');
  });
});

describe('plan prices per currency (spec 045)', () => {
  it('prices plans in a currency, never converting', async () => {
    const xof = await listPlansIn(db.app, 'XOF');
    expect(xof.find((plan) => plan.code === 'pro')).toMatchObject({ priceMinor: 75000, currencyCode: 'XOF' });
    const eur = await listPlansIn(db.app, 'EUR');
    expect(eur.find((plan) => plan.code === 'pro')).toMatchObject({ priceMinor: 0, currencyCode: 'EUR' });
    await setPlanPrice(db.owner, { planCode: 'pro', currencyCode: 'eur', priceMinor: 9900 }, 'admin-test');
    expect((await listPlansIn(db.app, 'EUR')).find((plan) => plan.code === 'pro')!.priceMinor).toBe(9900);
    await setPlanPrice(db.owner, { planCode: 'pro', currencyCode: 'EUR', priceMinor: null }, 'admin-test');
    expect((await listPlansIn(db.app, 'EUR')).find((plan) => plan.code === 'pro')!.priceMinor).toBe(0);
  });
  it('refuses an invalid price', async () => {
    await expect(setPlanPrice(db.owner, { planCode: 'pro', currencyCode: 'EUR', priceMinor: -5 }, 'admin-test')).rejects.toThrow();
    await expect(setPlanPrice(db.owner, { planCode: 'pro', currencyCode: 'EURO', priceMinor: 100 }, 'admin-test')).rejects.toThrow();
  });
  it('bills a company in its own currency, and not where no price exists', async () => {
    const sub = await getSubscription(db.app, owner);
    expect(sub.plan.currencyCode).toBe('XOF');
    const payment = await startSubscriptionPayment(db.app, owner, { planCode: 'pro', months: 1, provider: 'simulator' });
    expect(payment).toMatchObject({ amountMinor: 75000, currencyCode: 'XOF' });
    await db.owner.query(`update org_settings set currency_code = 'GBP' where org_id = $1`, [owner.orgId]);
    await expect(startSubscriptionPayment(db.app, owner, { planCode: 'pro', months: 1, provider: 'simulator' })).rejects.toThrow();
    await db.owner.query(`update org_settings set currency_code = 'XOF' where org_id = $1`, [owner.orgId]);
  });
});

describe('contact requests (spec 045)', () => {
  it('keeps a request once, and lets the operator mark it handled', async () => {
    const reach = `+000 ${Date.now()}`;
    await createContactRequest(db.owner, { name: 'Test', company: 'Exemple BTP', reach, activeSites: 4, message: 'Bonjour', locale: 'fr' });
    await createContactRequest(db.owner, { name: 'Test', company: 'Exemple BTP', reach, activeSites: 4, message: 'Bonjour', locale: 'fr' });
    const mine = (await listContactRequests(db.owner)).filter((row) => row.reach === reach);
    expect(mine).toHaveLength(1);
    await markContactHandled(db.owner, mine[0]!.id, 'admin-test');
    expect((await listContactRequests(db.owner)).find((row) => row.reach === reach)!.handledAt).not.toBeNull();
  });
  it('refuses an empty contact', async () => {
    await expect(createContactRequest(db.owner, { name: '', company: 'X', reach: '12' })).rejects.toThrow();
  });
});
