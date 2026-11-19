import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addExpense, companyKpis, createInvoice, createProject, getProject, periodActivity, recordPayment, updatePhase, type Actor } from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let projectId: string;
const period = { from: today(-29), to: today() };
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  projectId = (await createProject(db.app, owner, { name: 'Immeuble R+3', budgetMinor: 100_000_000, status: 'active' })).id;
  const [first] = (await getProject(db.app, owner, projectId)).phases;
  await updatePhase(db.app, owner, first!.id, { budgetMinor: 100_000_000, progressPct: 20 });
  const { id } = await createInvoice(db.app, owner, { projectId, kind: 'progress', amountMinor: 10_000_000, dueOn: today(30) });
  await recordPayment(db.app, owner, { projectId, invoiceId: id, amountMinor: 5_000_000, method: 'transfer' });
  await addExpense(db.app, owner, { projectId, category: 'materials', label: 'Ciment', amountMinor: 8_000_000 });
});
afterAll(async () => db.close());

describe('the indicators of a company (spec 039)', () => {
  it('computes the money of the period exactly, in integers, and the cost index of a site', async () => {
    const k = await companyKpis(db.app, owner, period);
    expect(k.money).toBe(true);
    expect(k.finance).toMatchObject({ invoicedMinor: 10_000_000, collectedMinor: 5_000_000, spentMinor: 8_000_000 });
    expect(Number.isInteger(k.finance!.receivableMinor)).toBe(true);
    expect(k.finance!.cashMinor).toBe(-3_000_000);
    const site = k.sites.find((row) => row.id === projectId)!;
    // Earned value 20 % × 100 000 000 = 20 000 000 for 8 000 000 spent.
    expect(site.cpi).toBe(2.5);
    expect(k.trend).toHaveLength(12);
    const activity = await periodActivity(db.app, owner, period);
    expect(activity.invoices).toHaveLength(1);
    expect(activity.payments[0]).toMatchObject({ amount: 5_000_000 });
  });

  it('keeps money away from a role that does not read finances', async () => {
    const lead = await addMember(db, owner.orgId, 'site_lead');
    const k = await companyKpis(db.app, lead, period);
    expect(k.money).toBe(false);
    expect(k.finance).toBeNull();
    for (const site of k.sites) expect(site).not.toHaveProperty('cpi');
    expect(k.trend.every((row) => !('invoiced' in row))).toBe(true);
    const activity = await periodActivity(db.app, lead, period);
    expect(activity.invoices).toHaveLength(0);
    expect(activity.payments).toHaveLength(0);
  });
});
