import { useState } from 'react';
import type { Alert } from '@struo/core';
import { formatDate, formatMoney } from '@/components/ui.tsx';
import { useI18n } from '@/i18n/index.tsx';

// What each role acts on: the site people do not chase invoices, the accountant does not review reports.
const FOR_ROLE: Record<string, Alert['kind'][] | null> = {
  owner: null, admin: null,
  engineer: ['milestone_late', 'incident_open', 'task_late', 'reports_to_review', 'document_expired', 'document_expiring', 'document_to_fix'],
  site_lead: ['incident_open', 'milestone_late', 'reports_to_review'],
  accountant: ['invoice_overdue', 'collection_gap', 'document_expired', 'document_expiring', 'document_to_fix'],
};

/** Where « Open » leads for each kind of alert: the thing itself, not just its site. */
function target(alert: Alert): string {
  switch (alert.kind) {
    case 'invoice_overdue': return `/app/finance?invoice=${alert.target}`;
    case 'collection_gap': return alert.projectId ? `/app/projects/${alert.projectId}` : '/app/finance';
    case 'document_expired': case 'document_expiring': case 'document_to_fix': return `/app/documents?doc=${alert.target}`;
    case 'milestone_late': return '/app/planning';
    case 'incident_open': return '/app/field?tab=incidents';
    case 'reports_to_review': return '/app/field';
    case 'task_late': return '/app/tasks';
    default: return alert.projectId ? `/app/projects/${alert.projectId}` : '/app';
  }
}

/** Keeps the alerts a role acts on. */
export const alertsFor = (alerts: Alert[], role: string) => {
  const kinds = FOR_ROLE[role];
  return kinds ? alerts.filter((alert) => kinds.includes(alert.kind)) : alerts;
};

/** The alerts of the company, worded in the person's language, most severe first. */
export function AlertList({ alerts, limit }: { alerts: Alert[]; limit?: number }) {
  const { t, locale } = useI18n();
  const [all, setAll] = useState(false);
  if (!alerts.length) return <p className="notice ok">{t('dashboard.noAlerts')}</p>;
  const shown = all ? alerts : alerts.slice(0, limit ?? alerts.length);
  return (
    <div>
      {shown.map((alert, index) => {
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
            <a href={target(alert)} className="btn secondary small">{t('app.open')}</a>
          </div>
        );
      })}
      {limit && alerts.length > limit ? (
        <button type="button" className="btn ghost small" style={{ marginTop: '.5rem' }} onClick={() => setAll((current) => !current)}>
          {all ? t('ui.showLess') : t('ui.showAllCount', { n: alerts.length })}
        </button>
      ) : null}
    </div>
  );
}
