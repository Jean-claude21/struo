// Spec 085: the gaps found by testing a site end to end through MCP. Each test is one refusal (or
// warning) that used to be missing: the data stayed wrong, or the error said nothing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addExpense, addMilestone, cancelSupplierBill, createInvoice, recordPayment, checkNewInvoice, checkNewProject, companyToday, createClient, createProject,
  createSupplierBill, getProject, listMilestones, markMilestoneReached, moveMilestone, paySupplierBill, setMilestoneDependencies,
  updateMilestone, updatePhase, updateProject, type Actor,
} from '../src/index.ts';
import { createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let site: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db, 'Intégrité BTP SARL');
  site = (await createProject(db.app, owner, { code: 'IT-01', name: 'Villa test', status: 'active', startDate: today(0), endDate: today(60) })).id;
});
afterAll(async () => db.close());

const ms = (name: string, offset: number) => addMilestone(db.app, owner, { projectId: site, name, plannedOn: today(offset) }).then((row) => row.id);

describe('milestones (spec 085)', () => {
  it('cannot be reached before what it waits for, nor on a day to come', async () => {
    const foundations = await ms('Fondations', 5);
    const handover = await ms('Réception', 50);
    await setMilestoneDependencies(db.app, owner, handover, { dependsOn: [{ id: foundations }] });

    await expect(markMilestoneReached(db.app, owner, handover)).rejects.toMatchObject({ code: 'predecessors_pending', params: { pending: 'Fondations' } });
    await expect(markMilestoneReached(db.app, owner, foundations, { actualOn: today(3) })).rejects.toMatchObject({ code: 'reached_in_future' });

    const { actualOn } = await markMilestoneReached(db.app, owner, foundations);
    expect(actualOn).toBe(await companyToday(db.app, owner));
    await markMilestoneReached(db.app, owner, handover);
    expect((await listMilestones(db.app, owner, { projectId: site })).filter((row) => row.status === 'done')).toHaveLength(2);
    // Undoing the foundations while the reception stands is refused; the reception first.
    await expect(updateMilestone(db.app, owner, foundations, { actualOn: null })).rejects.toMatchObject({ code: 'successors_reached', params: { reached: 'Réception' } });
    await updateMilestone(db.app, owner, handover, { actualOn: null });
    await updateMilestone(db.app, owner, foundations, { actualOn: null });
  });

  it('says which milestones a cascade pushes past the site end', async () => {
    const slab = await ms('Dalle', 20);
    const roof = await ms('Toiture', 55);
    await setMilestoneDependencies(db.app, owner, roof, { dependsOn: [{ id: slab, lagDays: 30 }] });
    const near = await moveMilestone(db.app, owner, slab, { plannedOn: today(22) });
    expect(near.beyondSiteEnd).toEqual([]);
    const far = await moveMilestone(db.app, owner, slab, { plannedOn: today(40) });
    expect(far.beyondSiteEnd).toEqual([{ id: roof, name: 'Toiture', plannedOn: today(70), siteCode: 'IT-01', siteEnd: today(60) }]);
  });
});

describe('dates and previews (spec 085)', () => {
  it('names an end before the start, on a site and on a phase', async () => {
    await expect(updateProject(db.app, owner, site, { startDate: today(90) })).rejects.toMatchObject({ code: 'end_before_start' });
    await expect(createProject(db.app, owner, { name: 'À l’envers', startDate: today(10), endDate: today(1) })).rejects.toMatchObject({ code: 'end_before_start' });
    const phase = (await getProject(db.app, owner, site)).phases[0]!;
    await updatePhase(db.app, owner, phase.id, { startDate: today(10) });
    await expect(updatePhase(db.app, owner, phase.id, { endDate: today(2) })).rejects.toMatchObject({ code: 'end_before_start' });
  });

  it('a site attached to a client later', async () => {
    const client = await createClient(db.app, owner, { name: 'Client Exemple SARL' });
    await updateProject(db.app, owner, site, { clientId: client.id });
    expect((await getProject(db.app, owner, site)).clientName).toBe('Client Exemple SARL');
  });

  it('checks a new site and a new invoice without writing', async () => {
    await expect(checkNewProject(db.app, owner, { code: 'IT-01', name: 'Doublon' })).rejects.toMatchObject({ code: 'code_taken' });
    await expect(checkNewProject(db.app, owner, { name: 'Dates', startDate: today(5), endDate: today(1) })).rejects.toMatchObject({ code: 'end_before_start' });
    await expect(checkNewProject(db.app, owner, { code: 'IT-99', name: 'Libre' })).resolves.toBeUndefined();

    const invoice = { projectId: site, kind: 'progress', amountMinor: 1_000_000, issuedOn: today(0), dueOn: today(30) };
    await expect(checkNewInvoice(db.app, owner, invoice)).resolves.toBeUndefined();
    await expect(checkNewInvoice(db.app, owner, { ...invoice, dueOn: today(-1) })).rejects.toMatchObject({ code: 'due_before_issue' });
    // 1 000 000 + 18 % VAT = 1 180 000: one more is too much.
    await expect(checkNewInvoice(db.app, owner, { ...invoice, deductionMinor: 1_180_000 })).resolves.toBeUndefined();
    await expect(checkNewInvoice(db.app, owner, { ...invoice, deductionMinor: 1_180_001 })).rejects.toMatchObject({ code: 'deduction_too_high' });
  });
});

describe('costs (spec 085)', () => {
  it('refuses an expense dated in the future', async () => {
    await expect(addExpense(db.app, owner, { projectId: site, category: 'materials', label: 'Ciment', amountMinor: 1000, spentOn: today(3) })).rejects.toMatchObject({ code: 'spent_in_future' });
    await expect(addExpense(db.app, owner, { projectId: site, category: 'materials', label: 'Ciment', amountMinor: 1000 })).resolves.toHaveProperty('id');
  });

  it('refuses the same supplier bill twice, unless the first was cancelled', async () => {
    const bill = { projectId: site, supplier: 'Fers du Golfe', label: 'Fers HA12', reference: 'FG-001', amountMinor: 500_000, dueOn: today(20) };
    const first = await createSupplierBill(db.app, owner, bill);
    await expect(createSupplierBill(db.app, owner, { ...bill, supplier: 'fers du golfe', reference: 'fg-001' })).rejects.toMatchObject({ code: 'bill_duplicate' });
    await expect(createSupplierBill(db.app, owner, { ...bill, reference: 'FG-002' })).resolves.toHaveProperty('id');
    await expect(createSupplierBill(db.app, owner, { ...bill, reference: 'FG-003', issuedOn: today(10), dueOn: today(5) })).rejects.toMatchObject({ code: 'due_before_issue' });
    await expect(paySupplierBill(db.app, owner, first.id, { paidOn: today(3) })).rejects.toMatchObject({ code: 'spent_in_future' });
    await cancelSupplierBill(db.app, owner, first.id);
    await expect(createSupplierBill(db.app, owner, bill)).resolves.toHaveProperty('id');
  });
});

describe('payments (spec 085)', () => {
  it('cannot exceed what is left on the invoice, nor be dated in the future', async () => {
    // 100 000 + 18 % VAT − 5 % retention on the total = 112 100 to pay.
    const invoice = await createInvoice(db.app, owner, { projectId: site, kind: 'progress', amountMinor: 100_000, dueOn: today(30) });
    const pay = (amountMinor: number, receivedOn?: string) => recordPayment(db.app, owner, { projectId: site, invoiceId: invoice.id, amountMinor, method: 'transfer', receivedOn });
    await expect(pay(1000, today(2))).rejects.toMatchObject({ code: 'received_in_future' });
    await pay(100_000);
    await expect(pay(12_101)).rejects.toMatchObject({ code: 'payment_exceeds_balance', params: { balance: 12_100 } });
    await expect(pay(12_100)).resolves.toHaveProperty('id');
  });
});

describe('the company day (spec 085)', () => {
  it('« today » and SQL current_date follow the company time zone, not the server clock', async () => {
    const far = await createTestCompany(db, 'Fuseau Lointain SARL');
    await db.owner.query(`update org_settings set time_zone = 'Pacific/Kiritimati' where org_id = $1`, [far.orgId]);
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati' }).format(new Date());
    expect(await companyToday(db.app, far)).toBe(local);
    const farSite = (await createProject(db.app, far, { name: 'Chantier lointain' })).id;
    // Today over there is a valid expense date, whatever the server's UTC day.
    await expect(addExpense(db.app, far, { projectId: farSite, category: 'materials', label: 'Sable', amountMinor: 1000, spentOn: local })).resolves.toHaveProperty('id');
  });
});
