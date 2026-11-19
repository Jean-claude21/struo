import { Link } from '@tanstack/react-router';
import type { Alert } from '@struo/core';
import { formatDate, formatMoney } from '@/components/ui.tsx';
import { useI18n } from '@/i18n/index.tsx';

/** The alerts of the company, worded in the person's language, most severe first. */
export function AlertList({ alerts, limit }: { alerts: Alert[]; limit?: number }) {
  const { t, locale } = useI18n();
  if (!alerts.length) return <p className="notice ok">{t('dashboard.noAlerts')}</p>;
  return (
    <div>
      {alerts.slice(0, limit ?? alerts.length).map((alert, index) => {
        const params: Record<string, string | number | null> = { ...alert.params };
        if (typeof params.amount === 'number' && typeof params.currency === 'string') {
          params.amount = formatMoney(locale, params.amount, params.currency);
        }
        if (typeof params.date === 'string') params.date = formatDate(locale, params.date);
        if (alert.kind === 'incident_open' && typeof params.kind === 'string') {
          params.description = `${t(`field.kinds.${params.kind as 'other'}`)} — ${params.description ?? ''}`;
        }
        return (
          <div key={`${alert.kind}-${alert.target}-${index}`} className="alert-row">
            <span className={`badge ${alert.severity}`}>{t(`alerts.severity.${alert.severity}`)}</span>
            <span className="grow">{t(`alerts.${alert.kind}`, params)}</span>
            {alert.projectId ? (
              <Link to="/app/projects/$projectId" params={{ projectId: alert.projectId }} className="btn secondary small">
                {t('app.open')}
              </Link>
            ) : alert.kind === 'reports_to_review' ? (
              <Link to="/app/field" className="btn secondary small">
                {t('app.open')}
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
