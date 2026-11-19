import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { ErrorText, formatMoney, useAction } from '@/components/ui.tsx';
import { getSubscriptionCheckout, settleSimulatedSubscription } from '@/features/settings/server.ts';
import { useI18n } from '@/i18n/index.tsx';

/** The simulator's checkout for a subscription (test environments only): no money moves. */
export const Route = createFileRoute('/pay/subscription/$id')({
  loader: ({ params }) => getSubscriptionCheckout({ data: { id: params.id } }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: SimulatedSubscription,
});

function SimulatedSubscription() {
  const { t, locale } = useI18n();
  const payment = Route.useLoaderData();
  const { id } = Route.useParams();
  const { run, error, busy } = useAction();
  const [outcome, setOutcome] = useState<string | null>(payment.status === 'pending' ? null : payment.status);
  const settle = async (value: 'succeeded' | 'failed') => {
    if (await run(() => settleSimulatedSubscription({ data: { id, outcome: value } }), { reload: false })) setOutcome(value);
  };
  return (
    <div className="public">
      <div className="card auth-box stack">
        <h1>{t('pay.simulatorTitle')}</h1>
        <p>{t('pay.simulatorBody', { amount: formatMoney(locale, payment.amountMinor, payment.currencyCode) })}</p>
        {outcome ? (
          <>
            <p className={outcome === 'succeeded' ? 'notice ok' : 'notice'}>{outcome === 'succeeded' ? t('pay.done') : t('pay.failed')}</p>
            <a className="btn" href="/app/settings">
              {t('settings.title')}
            </a>
          </>
        ) : (
          <div className="pair">
            <button type="button" className="btn secondary" disabled={busy} onClick={() => void settle('failed')}>
              {t('pay.fail')}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void settle('succeeded')}>
              {t('pay.succeed')}
            </button>
          </div>
        )}
        <ErrorText error={error} />
      </div>
    </div>
  );
}
