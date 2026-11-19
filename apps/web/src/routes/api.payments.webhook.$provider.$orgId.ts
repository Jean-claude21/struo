import { findIntentByProviderRef, paymentProviderSecrets, settlePaymentIntent } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { monerooGateway } from '@/server/adapters.server.ts';
import { runtime } from '@/server/runtime.server.ts';

/**
 * A company's payment provider tells us a payment changed. The signature is checked with that
 * company's own webhook secret, the payment is re-read at the provider, then applied once.
 */
export const Route = createFileRoute('/api/payments/webhook/$provider/$orgId')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { owner, secrets } = runtime();
        if (params.provider !== 'moneroo') return new Response(null, { status: 404 });
        const raw = await request.text();
        const config = await paymentProviderSecrets(owner, params.orgId);
        if (!config?.secretEnc || !config.webhookSecretEnc || config.provider !== 'moneroo') return new Response(null, { status: 404 });
        const gateway = monerooGateway(secrets.open(config.secretEnc), secrets.open(config.webhookSecretEnc));
        const headers = Object.fromEntries([...request.headers.entries()].map(([key, value]) => [key.toLowerCase(), value]));
        if (!gateway.verifyWebhook(raw, headers)) return new Response(null, { status: 401 });
        try {
          const outcome = await gateway.resolve(raw);
          if (!outcome) return Response.json({ ignored: true });
          const intent = await findIntentByProviderRef(owner, 'moneroo', outcome.providerRef);
          if (!intent || intent.orgId !== params.orgId) return Response.json({ ignored: true });
          const result = await settlePaymentIntent(owner, {
            intentId: intent.id, status: outcome.status, amountMinor: outcome.amountMinor, currencyCode: outcome.currencyCode,
          });
          return Response.json({ result });
        } catch (error) {
          console.error('[webhook]', error);
          return new Response(null, { status: 500 });
        }
      },
    },
  },
});
