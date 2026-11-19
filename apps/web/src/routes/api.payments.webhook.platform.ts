import { findSubscriptionPayment, settleSubscriptionPayment } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { monerooGateway } from '@/server/adapters.server.ts';
import { runtime } from '@/server/runtime.server.ts';

/**
 * The platform's payment provider (spec 017): a subscription payment changed. Signature checked
 * with the platform webhook secret, payment re-read at Moneroo, then applied once.
 */
export const Route = createFileRoute('/api/payments/webhook/platform')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { owner, env } = runtime();
        if (!env.PLATFORM_MONEROO_SECRET_KEY || !env.PLATFORM_MONEROO_WEBHOOK_SECRET) return new Response(null, { status: 404 });
        const raw = await request.text();
        const gateway = monerooGateway(env.PLATFORM_MONEROO_SECRET_KEY, env.PLATFORM_MONEROO_WEBHOOK_SECRET);
        const headers = Object.fromEntries([...request.headers.entries()].map(([key, value]) => [key.toLowerCase(), value]));
        if (!gateway.verifyWebhook(raw, headers)) return new Response(null, { status: 401 });
        try {
          const outcome = await gateway.resolve(raw);
          if (!outcome) return Response.json({ ignored: true });
          const payment = await findSubscriptionPayment(owner, { provider: 'moneroo', providerRef: outcome.providerRef });
          if (!payment) return Response.json({ ignored: true });
          const result = await settleSubscriptionPayment(owner, {
            id: payment.id, status: outcome.status, amountMinor: outcome.amountMinor, currencyCode: outcome.currencyCode,
          });
          return Response.json({ result });
        } catch (error) {
          console.error('[webhook:platform]', error);
          return new Response(null, { status: 500 });
        }
      },
    },
  },
});
