import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cancelSupplierBill, cashForecast, createInvoice, createProject, createSupplierBill, listExpenses, listSupplierBills, paySupplierBill, setCashBalance, type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let engineer: Actor;
let projectId: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  engineer = await addMember(db, owner.orgId, 'engineer');
  projectId = (await createProject(db.app, owner, { name: 'Villa trésorerie', status: 'active', budgetMinor: 20_000_000 })).id;
});
afterAll(async () => db.close());

describe('the money to come (spec 053)', () => {
  it('keeps supplier bills to pay, and turns a paid bill of a site into its expense', async () => {
    const { id } = await createSupplierBill(db.app, owner, { projectId, supplier: 'Quincaillerie Exemple', label: 'Fers de 10', amountMinor: 300_000, dueOn: today(10) });
    const { id: other } = await createSupplierBill(db.app, owner, { supplier: 'Assureur Exemple', label: 'Prime annuelle', category: 'fees', amountMinor: 120_000, dueOn: today(40) });
    expect((await listSupplierBills(db.app, owner, { status: 'to_pay' })).map((bill) => bill.id)).toEqual([id, other]);
    await expect(createSupplierBill(db.app, engineer, { supplier: 'X', label: 'Y', amountMinor: 1, dueOn: today(1) })).rejects.toThrow();
    const { expenseId } = await paySupplierBill(db.app, owner, id, { paidOn: today(0) });
    expect(expenseId).not.toBeNull();
    expect((await listExpenses(db.app, owner, { projectId })).some((expense) => expense.id === expenseId)).toBe(true);
    await expect(paySupplierBill(db.app, owner, id)).rejects.toMatchObject({ code: 'bill_closed' });
    await cancelSupplierBill(db.app, owner, other);
    expect(await listSupplierBills(db.app, owner, { status: 'to_pay' })).toHaveLength(0);
  });

  it('forecasts from the bank balance, counting invoices due but never the late ones', async () => {
    await setCashBalance(db.app, owner, { amountMinor: 5_000_000, on: today(0) });
    await createInvoice(db.app, owner, { projectId, kind: 'advance', amountMinor: 1_000_000, dueOn: today(20) });
    await createInvoice(db.app, owner, { projectId, kind: 'advance', amountMinor: 500_000, issuedOn: today(-35), dueOn: today(-5) });
    await createSupplierBill(db.app, owner, { projectId, supplier: 'Cimenterie', label: 'Ciment', amountMinor: 800_000, dueOn: today(45) });
    const forecast = await cashForecast(db.app, owner);
    expect(forecast.start).toMatchObject({ balanceMinor: 5_000_000, estimated: false });
    expect(forecast.weeks).toHaveLength(13);
    const inflow = forecast.weeks.reduce((sum, week) => sum + week.inMinor, 0);
    expect(inflow).toBeGreaterThan(1_000_000);
    expect(forecast.overdueInMinor).toBeGreaterThan(500_000);
    expect(forecast.weeks.reduce((sum, week) => sum + week.billsMinor, 0)).toBe(800_000);
    // No pace of spending in a new company: the balance only moves with the dated money.
    expect(forecast.at.d90).toBe(5_000_000 + inflow - 800_000);
    expect(forecast.lowest.balanceMinor).toBeLessThanOrEqual(forecast.at.d90);
    await expect(cashForecast(db.app, engineer)).rejects.toThrow();
  });

  it('adds, apart, what is left to invoice on active sites, after the payment term', async () => {
    await createProject(db.app, owner, { name: 'Chantier à facturer', status: 'active', budgetMinor: 7_000_000, startDate: today(-30), endDate: today(56) });
    const forecast = await cashForecast(db.app, owner);
    const planned = forecast.weeks.map((week) => week.plannedInMinor);
    expect(planned.slice(0, Math.ceil(forecast.pace.paymentTermDays / 7)).every((value) => value === 0)).toBe(true);
    expect(planned.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
  });
});
