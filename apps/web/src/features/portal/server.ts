import * as core from '@struo/core';
import { createServerFn } from '@tanstack/react-start';
import { guarded } from '@/server/context.server.ts';
import { monerooGateway, simulatorGateway } from '@/server/adapters.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const tokenOf = (input: unknown) => {
  const token = (input as { token?: unknown })?.token;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/u.test(token)) throw new Error('portal_link_invalid');
  return token;
};

export const getPortal = createServerFn({ method: 'GET' })
  .validator((input: { token: string }) => ({ token: tokenOf(input) }))
  .handler(({ data }) => guarded(async () => core.portalView(runtime().db, data.token)));

export const portalMessage = createServerFn({ method: 'POST' })
  .validator((input: { token: string; body: string }) => ({ token: tokenOf(input), body: String(input.body) }))
  .handler(({ data }) => guarded(async () => core.portalPostMessage(runtime().db, data.token, data.body)));

export const portalValidate = createServerFn({ method: 'POST' })
  .validator((input: { token: string; milestoneId: string; signer: string }) => ({
    token: tokenOf(input), milestoneId: String(input.milestoneId), signer: String(input.signer),
  }))
  .handler(({ data }) => guarded(async () => core.portalValidateMilestone(runtime().db, data.token, data.milestoneId, data.signer)));

/**
 * Starts an online payment: the company's own provider account (Moneroo) or the simulator in test.
 * Returns the address of the checkout page.
 */
export const portalPay = createServerFn({ method: 'POST' })
  .validator((input: { token: string; invoiceId: string }) => ({ token: tokenOf(input), invoiceId: String(input.invoiceId) }))
  .handler(({ data }) =>
    guarded(async () => {
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
        returnUrl: `${env.APP_BASE_URL}/portal/${data.token}`,
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
      if (!env.PAYMENTS_SIMULATOR) throw new core.DomainError('not_found', 404);
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
      if (!env.PAYMENTS_SIMULATOR) throw new core.DomainError('not_found', 404);
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
