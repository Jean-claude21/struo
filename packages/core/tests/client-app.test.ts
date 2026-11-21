import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clientOptedOut, clientRecipients, confirmPaymentClaim, createInvoice, createPortalLink, createProject, listPaymentClaims, memberPushTargets,
  portalDeclarePayment, portalMoney, portalNews, portalPaymentClaims, portalPaymentInstructions, portalPushTargets, portalVisit, postTeamMessage,
  rejectPaymentClaim, removePush, saveMemberPush, savePortalPush, setPortalEmailOptOut, updateInvoiceSettings, updatePortalLink, type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let projectId: string;
let token: string;
let invoiceId: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  projectId = (await createProject(db.app, owner, { name: 'Villa espace', status: 'active', budgetMinor: 10_000_000 })).id;
  const link = await createPortalLink(db.app, owner, projectId);
  token = link.token;
  await updatePortalLink(db.app, owner, link.id, { contactEmail: 'client@example.test', contactName: 'Mme Cliente', showFinance: true, showMessages: true });
  ({ id: invoiceId } = await createInvoice(db.app, owner, { projectId, kind: 'advance', amountMinor: 1_000_000, dueOn: today(10) }));
});
afterAll(async () => db.close());

describe("the client's application (spec 051)", () => {
  it('tells what is new since the last visit, once', async () => {
    expect((await portalVisit(db.owner, token)).since).toBeNull();
    expect(await portalNews(db.owner, token, null)).toBeNull();
    // A second load within half an hour keeps the same « since ».
    expect((await portalVisit(db.owner, token)).since).toBeNull();
    await db.owner.query(`update portal_link set last_visit_at = now() - interval '2 days' where project_id = $1`, [projectId]);
    const { since } = await portalVisit(db.owner, token);
    expect(since).not.toBeNull();
    await db.owner.query(`update portal_link set seen_before_at = now() - interval '1 hour' where project_id = $1`, [projectId]);
    await postTeamMessage(db.app, owner, projectId, 'La dalle est coulée.');
    const news = await portalNews(db.owner, token, new Date(Date.now() - 3_600_000).toISOString());
    expect(news).toMatchObject({ messages: 1 });
  });

  it('shows where the money stands and how the company asks to be paid', async () => {
    const money = await portalMoney(db.owner, token);
    expect(money).toMatchObject({ contractMinor: 10_000_000, totalMinor: 10_000_000 });
    expect(money!.dueMinor).toBeGreaterThan(0);
    expect(money!.toInvoiceMinor).toBe(10_000_000 - money!.invoicedMinor);
    await updateInvoiceSettings(db.app, owner, { bankDetails: 'IBAN FR76 0000 0000 0000' });
    expect(await portalPaymentInstructions(db.owner, token)).toMatchObject({ bankDetails: 'IBAN FR76 0000 0000 0000', canDeclare: true });
  });

  it('turns « I paid » into a payment only once the company confirms it', async () => {
    const accountant = await addMember(db, owner.orgId, 'accountant');
    const claim = await portalDeclarePayment(db.owner, token, { invoiceId, amountMinor: 400_000, paidOn: today(0), method: 'transfer', reference: 'VIR-1' });
    await expect(portalDeclarePayment(db.owner, token, { invoiceId, amountMinor: 400_000, paidOn: today(0), method: 'transfer' })).rejects.toMatchObject({ code: 'claim_pending' });
    expect((await listPaymentClaims(db.app, accountant, { status: 'pending' })).map((row) => row.id)).toEqual([claim.id]);
    const before = (await portalMoney(db.owner, token))!.paidMinor;
    await rejectPaymentClaim(db.app, accountant, claim.id, { reason: 'Virement non reçu' });
    expect((await portalPaymentClaims(db.owner, token))[0]).toMatchObject({ status: 'rejected', rejectReason: 'Virement non reçu' });
    expect((await portalMoney(db.owner, token))!.paidMinor).toBe(before);
    const again = await portalDeclarePayment(db.owner, token, { invoiceId, amountMinor: 400_000, paidOn: today(0), method: 'transfer' });
    await confirmPaymentClaim(db.app, accountant, again.id, {});
    expect((await portalMoney(db.owner, token))!.paidMinor).toBe(before + 400_000);
    await expect(confirmPaymentClaim(db.app, accountant, again.id, {})).rejects.toMatchObject({ code: 'claim_decided' });
    await updateInvoiceSettings(db.app, owner, { clientCanDeclare: false });
    await expect(portalDeclarePayment(db.owner, token, { invoiceId, amountMinor: 1000, paidOn: today(0), method: 'cash' })).rejects.toThrow();
  });

  it("respects the client's e-mail choice, and keeps phones per link and per member", async () => {
    expect((await clientRecipients(db.owner, projectId)).map((row) => row.email)).toEqual(['client@example.test']);
    await setPortalEmailOptOut(db.owner, token, true);
    expect(await clientOptedOut(db.owner, projectId)).toBe(true);
    expect(await clientRecipients(db.owner, projectId)).toHaveLength(0);
    const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } });
    await savePortalPush(db.owner, token, sub('https://push.example.test/client-1'));
    expect(await portalPushTargets(db.owner, projectId)).toHaveLength(1);
    await saveMemberPush(db.owner, owner, sub('https://push.example.test/owner-1'));
    expect(await memberPushTargets(db.owner, owner.orgId, [owner.userId])).toHaveLength(1);
    // The same phone moving from a client link to a member is one subscription.
    await saveMemberPush(db.owner, owner, sub('https://push.example.test/client-1'));
    expect(await portalPushTargets(db.owner, projectId)).toHaveLength(0);
    await removePush(db.owner, 'https://push.example.test/owner-1');
    expect(await memberPushTargets(db.owner, owner.orgId, [owner.userId])).toHaveLength(1);
  });
});
