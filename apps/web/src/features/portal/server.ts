import * as core from '@struo/core';
import { createServerFn } from '@tanstack/react-start';
import { getCookie, setCookie } from '@tanstack/react-start/server';
import { translate } from '@/i18n/index.tsx';
import { guarded } from '@/server/context.server.ts';
import { monerooGateway, simulatorGateway } from '@/server/adapters.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const tokenOf = (input: unknown) => {
  const token = (input as { token?: unknown })?.token;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/u.test(token)) throw new Error('portal_link_invalid');
  return token;
};

/** The device cookie of a link (httpOnly, per link, scoped to the portal). */
const deviceCookie = (token: string) => `struo_pd_${core.hashToken(token).slice(0, 16)}`;

async function access(token: string) {
  const result = await core.portalAccess(runtime().db, token, getCookie(deviceCookie(token)) ?? null);
  if (!result) throw new core.DomainError('portal_link_invalid', 404);
  return result;
}

/**
 * The client's space. Before the device is confirmed by an e-mail code, only the gate (company,
 * project name, masked address) is returned; afterwards, what the link allows.
 */
export const getPortal = createServerFn({ method: 'GET' })
  .validator((input: { token: string }) => ({ token: tokenOf(input) }))
  .handler(({ data }) =>
    guarded(async () => {
      const { db } = runtime();
      const link = await core.portalAccess(db, data.token, getCookie(deviceCookie(data.token)) ?? null);
      if (!link) return null;
      const view = await core.portalView(db, data.token);
      if (!view) return null;
      if (link.requireCode && !link.verified) {
        return {
          gate: true as const,
          company: view.company,
          project: { name: view.project.name, location: view.project.location },
          contactName: link.contactName,
          maskedEmail: link.contactEmail ? core.maskEmail(link.contactEmail) : null,
        };
      }
      const reports = link.show.photos ? await core.portalReports(db, data.token) : [];
      return {
        gate: false as const,
        show: link.show,
        contactName: link.contactName,
        view: {
          ...view,
          photos: link.show.photos ? view.photos : [],
          milestones: link.show.planning ? view.milestones : [],
          invoices: link.show.finance ? view.invoices : [],
          documents: link.show.documents ? view.documents : [],
          messages: link.show.messages ? view.messages : [],
        },
        reports,
      };
    }),
  );

/** Sends a one-time code to the link's e-mail address. In test environments without mail, the code is shown. */
export const portalRequestCode = createServerFn({ method: 'POST' })
  .validator((input: { token: string }) => ({ token: tokenOf(input) }))
  .handler(({ data }) =>
    guarded(async () => {
      const { db, mailer, env } = runtime();
      const view = await core.portalView(db, data.token);
      if (!view) throw new core.DomainError('portal_link_invalid', 404);
      const { email, code } = await core.portalIssueCode(db, data.token);
      const locale = view.company.locale;
      await mailer.send({
        to: email,
        subject: translate(locale, 'clientPortal.codeSubject', { code, company: view.company.name }),
        text: translate(locale, 'clientPortal.codeBody', { code, company: view.company.name, project: view.project.name }),
      });
      return { maskedEmail: core.maskEmail(email), testCode: !mailer.configured && env.PAYMENTS_SIMULATOR ? code : null };
    }),
  );

export const portalVerifyCode = createServerFn({ method: 'POST' })
  .validator((input: { token: string; code: string }) => ({ token: tokenOf(input), code: String(input.code ?? '') }))
  .handler(({ data }) =>
    guarded(async () => {
      const device = await core.portalVerifyCode(runtime().db, data.token, data.code);
      if (!device) throw new core.DomainError('portal_code_invalid', 422);
      setCookie(deviceCookie(data.token), device, {
        path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, secure: runtime().env.APP_BASE_URL.startsWith('https://'),
      });
      return { ok: true };
    }),
  );

export const portalMessage = createServerFn({ method: 'POST' })
  .validator((input: { token: string; body: string }) => ({ token: tokenOf(input), body: String(input.body) }))
  .handler(({ data }) =>
    guarded(async () => {
      const link = await access(data.token);
      if (!link.verified || !link.show.messages) throw new core.DomainError('forbidden', 403);
      return core.portalPostMessage(runtime().db, data.token, data.body);
    }),
  );

/**
 * Starts an online payment: the company's own provider account (Moneroo) or the simulator in test.
 * Returns the address of the checkout page.
 */
export const portalPay = createServerFn({ method: 'POST' })
  .validator((input: { token: string; invoiceId: string }) => ({ token: tokenOf(input), invoiceId: String(input.invoiceId) }))
  .handler(({ data }) =>
    guarded(async () => {
      const link = await access(data.token);
      if (!link.verified || !link.show.finance) throw new core.DomainError('forbidden', 403);
      const { owner, env, secrets } = runtime();
      const context = await core.portalPaymentContext(owner, data.token, data.invoiceId);
      const gateway =
        context.provider === 'simulator'
          ? env.PAYMENTS_SIMULATOR
            ? simulatorGateway(env.APP_BASE_URL)
            : null
          : context.secretEnc
            ? monerooGateway(secrets.open(context.secretEnc), '')
            : null;
      if (!gateway) throw new core.DomainError('payment_unavailable', 409);
      const intentId = await core.createPaymentIntent(owner, {
        orgId: context.orgId, invoiceId: data.invoiceId, provider: gateway.code, amountMinor: context.balance, currencyCode: context.currency,
      });
      const checkout = await gateway.initiate({
        amountMinor: context.balance,
        currencyCode: context.currency,
        reference: context.number,
        description: `${context.number}`,
        returnUrl: `${env.APP_BASE_URL}/portal/${data.token}?paid=1`,
        customer: { email: context.clientEmail ?? 'client@example.invalid', name: context.clientName ?? 'Client' },
        metadata: { intent_id: intentId, invoice: context.number },
      });
      await core.attachPaymentIntent(owner, intentId, checkout.providerRef, checkout.checkoutUrl);
      return { checkoutUrl: checkout.checkoutUrl };
    }),
  );

/** The simulator's checkout page data (test environments only). */
export const getSimulatedPayment = createServerFn({ method: 'GET' })
  .validator((input: { intentId: string }) => ({ intentId: String(input.intentId) }))
  .handler(({ data }) =>
    guarded(async () => {
      const { owner, env } = runtime();
      if (!env.PAYMENTS_SIMULATOR || !/^[0-9a-f-]{36}$/iu.test(data.intentId)) throw new core.DomainError('not_found', 404);
      const { rows } = await owner.query<{ amount: number; currency: string; status: string; token_hint: string | null }>(
        `select amount_minor as amount, currency_code as currency, status, null as token_hint
           from payment_intent where id = $1 and provider = 'simulator'`,
        [data.intentId],
      );
      if (!rows[0]) throw new core.DomainError('not_found', 404);
      return rows[0];
    }),
  );

export const settleSimulatedPayment = createServerFn({ method: 'POST' })
  .validator((input: { intentId: string; outcome: string }) => ({
    intentId: String(input.intentId), outcome: input.outcome === 'succeeded' ? ('succeeded' as const) : ('failed' as const),
  }))
  .handler(({ data }) =>
    guarded(async () => {
      const { owner, env } = runtime();
      if (!env.PAYMENTS_SIMULATOR || !/^[0-9a-f-]{36}$/iu.test(data.intentId)) throw new core.DomainError('not_found', 404);
      const { rows } = await owner.query<{ amount: number; currency: string }>(
        `select amount_minor as amount, currency_code as currency from payment_intent where id = $1 and provider = 'simulator'`,
        [data.intentId],
      );
      if (!rows[0]) throw new core.DomainError('not_found', 404);
      return core.settlePaymentIntent(owner, {
        intentId: data.intentId, status: data.outcome, amountMinor: rows[0].amount, currencyCode: rows[0].currency,
      });
    }),
  );
