// Spec 086: what the second round of MCP scenarios on the live site found. One test per gap.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addExpense, addMilestone, checkNewPayment, checkSupplierBillPayment, companyKpis, createClient, createDraftInvoice, createInvoice,
  createProject, createSupplierBill, gantt, getProject, listSupplierBills, paySupplierBill, recordPayment, setMilestoneDependencies,
  updateClient, updatePhase, updateProject, type Actor,
} from '../src/index.ts';
import { createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let site: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db, 'Second Tour BTP SARL');
  site = (await createProject(db.app, owner, { code: 'ST-01', name: 'Villa', status: 'active', startDate: today(0), endDate: today(60) })).id;
});
afterAll(async () => db.close());

describe('supplier bills (spec 086)', () => {
  it('an already overdue bill can still be entered, taken as issued on its due date', async () => {
    const { id } = await createSupplierBill(db.app, owner, { projectId: site, supplier: 'Sable & Co', label: 'Sable', reference: 'SC-1', amountMinor: 10_000, dueOn: today(-20) });
    const bill = (await listSupplierBills(db.app, owner)).find((row) => row.id === id)!;
    expect(bill).toMatchObject({ issuedOn: today(-20), dueOn: today(-20) });
    // A bill's own date after its due date is still refused.
    await expect(createSupplierBill(db.app, owner, { projectId: site, supplier: 'Sable & Co', label: 'Sable', reference: 'SC-2', amountMinor: 10_000, issuedOn: today(-5), dueOn: today(-10) }))
      .rejects.toMatchObject({ code: 'due_before_issue' });
  });

  it('checks a payment before the « yes »: unknown, future, already paid', async () => {
    const { id } = await createSupplierBill(db.app, owner, { projectId: site, supplier: 'Fers du Golfe', label: 'Fers', reference: 'FG-9', amountMinor: 20_000, dueOn: today(10) });
    await expect(checkSupplierBillPayment(db.app, owner, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'not_found' });
    await expect(checkSupplierBillPayment(db.app, owner, id, { paidOn: today(2) })).rejects.toMatchObject({ code: 'spent_in_future' });
    await expect(checkSupplierBillPayment(db.app, owner, id)).resolves.toEqual({ paidOn: today(0) });
    await paySupplierBill(db.app, owner, id);
    await expect(checkSupplierBillPayment(db.app, owner, id)).rejects.toMatchObject({ code: 'bill_closed' });
  });
});

describe('payments (spec 086)', () => {
  it('the preview refuses what the payment would: a draft, too much, a day to come', async () => {
    const draft = await createDraftInvoice(db.app, owner, { projectId: site, kind: 'advance' });
    await expect(checkNewPayment(db.app, owner, { projectId: site, invoiceId: draft.id, amountMinor: 1000, method: 'cash' })).rejects.toMatchObject({ code: 'invoice_not_payable' });
    // 100 000 + 18 % VAT − 5 % retention on the total = 112 100.
    const invoice = await createInvoice(db.app, owner, { projectId: site, kind: 'progress', amountMinor: 100_000, dueOn: today(30) });
    const payment = { projectId: site, invoiceId: invoice.id, method: 'transfer' };
    await expect(checkNewPayment(db.app, owner, { ...payment, amountMinor: 112_101 })).rejects.toMatchObject({ code: 'payment_exceeds_balance' });
    await expect(checkNewPayment(db.app, owner, { ...payment, amountMinor: 1000, receivedOn: today(3) })).rejects.toMatchObject({ code: 'received_in_future' });
    await expect(checkNewPayment(db.app, owner, { ...payment, amountMinor: 112_100 })).resolves.toBeUndefined();
    await expect(recordPayment(db.app, owner, { ...payment, invoiceId: draft.id, amountMinor: 1000 })).rejects.toMatchObject({ code: 'invoice_not_payable' });
  });
});

describe('clients (spec 086)', () => {
  it('two clients cannot share a name, whatever the case or accents', async () => {
    const first = await createClient(db.app, owner, { name: 'Société Kodjo' });
    await expect(createClient(db.app, owner, { name: '  societe KODJO ' })).rejects.toMatchObject({ code: 'client_name_taken' });
    const second = await createClient(db.app, owner, { name: 'Kodjo Frères' });
    await expect(updateClient(db.app, owner, second.id, { name: 'Société Kodjo' })).rejects.toMatchObject({ code: 'client_name_taken' });
    await expect(updateClient(db.app, owner, first.id, { name: 'Société Kodjo', phone: '+228 90 00 00 00' })).resolves.toBeUndefined();
  });

  it('an unknown client id on a site is « not found »', async () => {
    await expect(updateProject(db.app, owner, site, { clientId: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('the site window (spec 086)', () => {
  it('says what falls outside the site dates, when a site shrinks or a milestone or phase is placed outside', async () => {
    const inside = await addMilestone(db.app, owner, { projectId: site, name: 'Dalle', plannedOn: today(40) });
    expect(inside.outsideSiteDates).toEqual([]);
    const late = await addMilestone(db.app, owner, { projectId: site, name: 'Hors période', plannedOn: today(90) });
    expect(late.outsideSiteDates).toMatchObject([{ kind: 'milestone', id: late.id, siteEnd: today(60) }]);

    const phase = (await getProject(db.app, owner, site)).phases[0]!;
    const before = await updatePhase(db.app, owner, phase.id, { startDate: today(-30), endDate: today(-10) });
    expect(before.outsideSiteDates).toMatchObject([{ kind: 'phase', id: phase.id }]);
    await updatePhase(db.app, owner, phase.id, { startDate: today(1), endDate: today(30) });

    const shrunk = await updateProject(db.app, owner, site, { endDate: today(35) });
    expect(shrunk.outsideSiteDates.map((item) => item.name).sort()).toEqual(['Dalle', 'Hors période']);
    await updateProject(db.app, owner, site, { endDate: today(60) });
  });

  it('the same predecessor named twice keeps its longest gap', async () => {
    const a = await addMilestone(db.app, owner, { projectId: site, name: 'A', plannedOn: today(5) });
    const b = await addMilestone(db.app, owner, { projectId: site, name: 'B', plannedOn: today(30) });
    await setMilestoneDependencies(db.app, owner, b.id, { dependsOn: [{ id: a.id, lagDays: 5 }, { id: a.id, lagDays: 10 }] });
    expect((await gantt(db.app, owner)).dependencies.filter((dep) => dep.milestoneId === b.id)).toEqual([{ milestoneId: b.id, dependsOnId: a.id, lagDays: 10 }]);
  });
});

describe('indicators (spec 086)', () => {
  it('no negative runway, and a dated-ahead expense is not burnt yet', async () => {
    const company = await createTestCompany(db, 'Trésorerie Courte SARL');
    const projectId = (await createProject(db.app, company, { name: 'Clôture', status: 'active' })).id;
    await addExpense(db.app, company, { projectId, category: 'materials', label: 'Ciment', amountMinor: 300_000 });
    // An old row dated ahead (written before spec 085 refused it): the database still holds such rows.
    await db.owner.query(
      `insert into expense (org_id, project_id, spent_on, category, label, amount_minor, currency_code) values ($1, $2, current_date + 400, 'labour', 'Ancienne saisie', 900000, 'XOF')`,
      [company.orgId, projectId]);
    const k = await companyKpis(db.app, company, { from: today(-29), to: today() });
    expect(k.finance).toMatchObject({ burnMinor: 100_000, runwayMonths: 0 });
  });
});
