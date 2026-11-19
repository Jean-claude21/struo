import { createFileRoute, notFound } from '@tanstack/react-router';
import { useState } from 'react';
import { ErrorText, formatMoney, useAction } from '@/components/ui.tsx';
import { getSimulatedPayment, settleSimulatedPayment } from '@/features/portal/server.ts';
import { useI18n } from '@/i18n/index.tsx';

/** The simulator's checkout (test environments only): no money moves. */
export const Route = createFileRoute('/pay/simulate/$intentId')({
  // Outside test environments (or an unknown intent) the page does not exist: a real 404, not an error.
  loader: async ({ params }) => {
    try {
      return await getSimulatedPayment({ data: { intentId: params.intentId } });
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: SimulatedPayment,
});

function SimulatedPayment() {
  const { t, locale } = useI18n();
  const intent = Route.useLoaderData();
  const { intentId } = Route.useParams();
  const { run, error, busy } = useAction();
  const [outcome, setOutcome] = useState<string | null>(intent.status === 'pending' ? null : intent.status);
  return (
    <div className="public">
      <div className="card auth-box stack">
        <h1>{t('pay.simulatorTitle')}</h1>
        <p>{t('pay.simulatorBody', { amount: formatMoney(locale, intent.amount, intent.currency) })}</p>
        {outcome ? (
          <>
            <p className={outcome === 'succeeded' ? 'notice ok' : 'notice'}>{outcome === 'succeeded' ? t('pay.done') : t('pay.failed')}</p>
            <button type="button" className="btn" onClick={() => window.history.go(-2)}>
              {t('pay.backToPortal')}
            </button>
          </>
        ) : (
          <div className="pair">
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={async () => {
                if (await run(() => settleSimulatedPayment({ data: { intentId, outcome: 'failed' } }), { reload: false })) setOutcome('failed');
              }}
            >
              {t('pay.fail')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={async () => {
                if (await run(() => settleSimulatedPayment({ data: { intentId, outcome: 'succeeded' } }), { reload: false })) setOutcome('succeeded');
              }}
            >
              {t('pay.succeed')}
            </button>
          </div>
        )}
        <ErrorText error={error} />
      </div>
    </div>
  );
}
