import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  extendTrial, licenseAlreadyUsed, licenseProductFor, listAllRedemptions, platformCompany, redeemLicense, resolveActor, saveLicenseProduct, setCompanySuspended,
  getSubscription, type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  const plan = (await db.owner.query<{ code: string }>(`select code from plan where price_minor > 0 order by position limit 1`)).rows[0]!.code;
  await saveLicenseProduct(db.owner, owner.userId, { productId: 'prd_pro12', planCode: plan, months: 12, label: 'Pro 12 mois', buyUrl: 'https://store.example/pro' });
});
afterAll(async () => db.close());

describe('the platform: licences and companies (spec 038)', () => {
  it('applies a licence once: the plan and twelve months, and refuses the same key again', async () => {
    const product = await licenseProductFor(db.owner, 'prd_pro12');
    const result = await redeemLicense(db.owner, owner, { key: 'ABC-123-XYZ', maskedKey: 'ABC-•••-XYZ', productId: 'prd_pro12', customerEmail: 'buyer@example.test' });
    expect(result.planCode).toBe(product.planCode);
    const months = (new Date(result.paidUntil).getTime() - Date.now()) / (30.4 * 86_400_000);
    expect(months).toBeGreaterThan(11.5);
    expect(await licenseAlreadyUsed(db.owner, 'abc-123-xyz')).toBe(true);
    await expect(redeemLicense(db.owner, owner, { key: 'abc-123-xyz', maskedKey: 'x', productId: 'prd_pro12', customerEmail: null })).rejects.toMatchObject({ code: 'license_already_used' });
    // A second key adds twelve more months to the current period.
    const second = await redeemLicense(db.owner, owner, { key: 'DEF-456', maskedKey: 'DEF-•••', productId: 'prd_pro12', customerEmail: null });
    expect(new Date(second.paidUntil).getTime()).toBeGreaterThan(new Date(result.paidUntil).getTime());
    expect((await getSubscription(db.app, owner)).paidUntil).toBeTruthy();
    expect((await listAllRedemptions(db.owner)).length).toBeGreaterThanOrEqual(2);
  });

  it('refuses a product that is not mapped, and a member who cannot manage the company', async () => {
    await expect(licenseProductFor(db.owner, 'prd_unknown')).rejects.toMatchObject({ code: 'license_unknown_product' });
    const accountant = await addMember(db, owner.orgId, 'accountant');
    await expect(redeemLicense(db.owner, accountant, { key: 'GHI-789', maskedKey: 'x', productId: 'prd_pro12', customerEmail: null })).rejects.toMatchObject({ status: 403 });
  });

  it('suspends a company (nobody can use it) and reactivates it; extends a trial', async () => {
    await setCompanySuspended(db.owner, owner.userId, owner.orgId, true, 'Impayé');
    await expect(resolveActor(db.app, owner.userId, owner.orgId, 'web')).rejects.toMatchObject({ code: 'company_suspended' });
    await setCompanySuspended(db.owner, owner.userId, owner.orgId, false);
    expect(await resolveActor(db.app, owner.userId, owner.orgId, 'web')).toMatchObject({ role: 'owner' });
    await extendTrial(db.owner, owner.userId, owner.orgId, 30);
    const detail = await platformCompany(db.owner, owner.orgId);
    expect(detail.redemptions.length).toBe(2);
    expect(detail.journal.map((row: { command: string }) => row.command)).toEqual(expect.arrayContaining(['company.suspend', 'company.reactivate', 'trial.extend']));
  });
});
