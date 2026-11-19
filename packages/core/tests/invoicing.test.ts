import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDraftInvoice, createInvoice, createProject, deleteDraftInvoice, getInvoiceForEdit, getProject, issueInvoice, listInvoices, saveDraftInvoice,
  updateInvoiceSettings, updatePhase, type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let projectId: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  projectId = (await createProject(db.app, owner, { name: 'Villa R+1', budgetMinor: 40_000_000, status: 'active' })).id;
  const [first, second] = (await getProject(db.app, owner, projectId)).phases;
  await updatePhase(db.app, owner, first!.id, { budgetMinor: 10_000_000, progressPct: 100 });
  await updatePhase(db.app, owner, second!.id, { budgetMinor: 30_000_000, progressPct: 50 });
});
afterAll(async () => db.close());

describe('invoices as a building company issues them (spec 035)', () => {
  it('prices item lines, sums them before VAT, and takes off complementary deductions', async () => {
    const { id } = await createDraftInvoice(db.app, owner, { projectId, kind: 'final', dueOn: today(30) });
    const edit = await saveDraftInvoice(db.app, owner, id, {
      contractRef: 'Marché n°12/2026',
      lines: [
        { kind: 'text', designation: 'Lot 1 — Gros œuvre' },
        { kind: 'item', designation: 'Béton dosé à 350 kg', unit: 'm³', quantityMilli: 12_500, unitPriceMinor: 85_000 },
        { kind: 'item', designation: 'Agglos de 15', unit: 'u', quantityMilli: 2_000_000, unitPriceMinor: 350 },
      ],
      adjustments: [{ label: 'AIB 5 %', rateBps: 500, base: 'ht' }, { label: 'Pénalité de retard', amountMinor: 50_000 }],
    });
    expect(edit.lines.map((line) => line.amountMinor)).toEqual([0, 1_062_500, 700_000]);
    expect(edit.amountMinor).toBe(1_762_500);
    expect(edit.vatMinor).toBe(317_250); // 18 %
    expect(edit.adjustments.map((item) => item.amountMinor)).toEqual([88_125, 50_000]);
    // total 2 079 750 − retention 5 % (103 988) − 138 125
    expect(edit.netMinor).toBe(edit.totalMinor - edit.retentionMinor - 138_125);
    expect(edit.number).toMatch(/^DRAFT-/u);
  });

  it('prefills a progress statement per lot from validated progress, net of what was invoiced before', async () => {
    await createInvoice(db.app, owner, { projectId, kind: 'advance', amountMinor: 4_000_000, dueOn: today(10) });
    await createInvoice(db.app, owner, { projectId, kind: 'progress', amountMinor: 5_000_000, dueOn: today(30) }); // no lines (older way)
    const { id } = await createDraftInvoice(db.app, owner, { projectId, kind: 'progress', fromProgress: true });
    const edit = await getInvoiceForEdit(db.app, owner, id);
    const progress = edit.lines.filter((line) => line.kind === 'progress');
    expect(progress.map((line) => line.amountMinor)).toEqual([10_000_000, 15_000_000, -5_000_000]);
    expect(edit.amountMinor).toBe(20_000_000);
    // Advance 4 000 000 + VAT, deducted in proportion of 20 M on a 40 M budget.
    expect(edit.deductionMinor).toBe(Math.round((4_720_000 * 20_000_000) / 40_000_000));
    const issued = await issueInvoice(db.app, owner, id);
    // A second statement now sees what this one invoiced per lot.
    const next = await createDraftInvoice(db.app, owner, { projectId, kind: 'progress', fromProgress: true });
    const again = await getInvoiceForEdit(db.app, owner, next.id);
    expect(again.amountMinor).toBe(0);
    expect(issued.number).toMatch(/^F-\d{4}-\d{4}$/u);
    await deleteDraftInvoice(db.app, owner, next.id);
  });

  it('numbers from the company series and freezes an issued invoice', async () => {
    await updateInvoiceSettings(db.app, owner, { numberPrefix: 'FAC', numberPadding: 3, numberYearly: false });
    const { id } = await createDraftInvoice(db.app, owner, { projectId, kind: 'final' });
    await expect(issueInvoice(db.app, owner, id)).rejects.toMatchObject({ code: 'invoice_empty' });
    await saveDraftInvoice(db.app, owner, id, { lines: [{ kind: 'item', designation: 'Clôture', quantityMilli: 1000, unitPriceMinor: 900_000 }] });
    const { number } = await issueInvoice(db.app, owner, id);
    expect(number).toMatch(/^FAC-\d{3}$/u);
    await expect(saveDraftInvoice(db.app, owner, id, { label: 'changed' })).rejects.toMatchObject({ code: 'invoice_not_draft' });
    await expect(deleteDraftInvoice(db.app, owner, id)).rejects.toMatchObject({ code: 'invoice_not_draft' });
    expect((await listInvoices(db.app, owner, {})).find((row) => row.id === id)?.number).toBe(number);
  });

  it('refuses deductions above the invoice, and drafts to a site lead', async () => {
    const { id } = await createDraftInvoice(db.app, owner, { projectId, kind: 'final' });
    await expect(saveDraftInvoice(db.app, owner, id, {
      lines: [{ kind: 'item', designation: 'Petit lot', quantityMilli: 1000, unitPriceMinor: 10_000 }],
      adjustments: [{ label: 'Trop', amountMinor: 1_000_000 }],
    })).rejects.toMatchObject({ code: 'deduction_too_high' });
    const lead = await addMember(db, owner.orgId, 'site_lead');
    await expect(createDraftInvoice(db.app, lead, { projectId, kind: 'final' })).rejects.toMatchObject({ status: 403 });
  });
});
