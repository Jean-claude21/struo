import { can } from '@struo/core/permissions';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { InvoiceDialog, PaymentDialog } from '@/components/forms.tsx';
import { InvoiceTable } from '@/components/tables.tsx';
import { DateText, Empty, formatMoney, Kpi, Money, Tabs } from '@/components/ui.tsx';
import { getFinance } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/finance')({
  loader: () => getFinance(),
  component: Finance,
});

type Tab = 'receivables' | 'invoices' | 'payments';

function Finance() {
  const { t, locale } = useI18n();
  const data = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>('receivables');
  const currency = data.settings.currencyCode;
  const canWrite = can(data.role, 'finance.write');
  const money = (minor: number) => formatMoney(locale, minor, currency);
  const open = data.invoices.filter((invoice) => invoice.status === 'issued' && invoice.balanceMinor > 0).sort((a, b) => b.overdueDays - a.overdueDays);
  return (
    <div className="stack">
      <div className="topbar">
        <h1>{t('finance.title')}</h1>
        {canWrite && data.projects.length ? (
          <div className="row">
            <PaymentDialog projects={data.projects} currency={currency} invoices={data.invoices} />
            <InvoiceDialog projects={data.projects} currency={currency} />
          </div>
        ) : null}
      </div>
      <div className="grid">
        <Kpi label={t('dashboard.invoiced')} value={money(data.summary.invoicedMinor)} />
        <Kpi label={t('dashboard.collected')} value={money(data.summary.collectedMinor)} />
        <Kpi label={t('dashboard.receivable')} value={money(data.summary.receivableMinor)} />
        <Kpi label={t('dashboard.retention')} value={money(data.summary.retentionMinor)} />
      </div>
      <div className="grid">
        {(['notDue', 'd30', 'd60', 'd90', 'd90plus'] as const).map((bucket) => (
          <Kpi
            key={bucket}
            label={`${t(`finance.aging.${bucket}`)} (${data.aging[bucket].count})`}
            value={money(data.aging[bucket].amount)}
            bad={bucket !== 'notDue' && data.aging[bucket].amount > 0}
          />
        ))}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'receivables', label: t('finance.receivables') },
          { value: 'invoices', label: t('finance.invoices') },
          { value: 'payments', label: t('finance.payments') },
        ]}
      />
      {tab === 'receivables' ? <InvoiceTable invoices={open} canWrite={canWrite} channels={data.channels} showProject /> : null}
      {tab === 'invoices' ? <InvoiceTable invoices={data.invoices} canWrite={canWrite} channels={data.channels} showProject /> : null}
      {tab === 'payments' ? (
        <section className="card table-wrap">
          {data.payments.length ? (
            <table>
              <thead>
                <tr>
                  <th>{t('app.date')}</th>
                  <th>{t('app.project')}</th>
                  <th>{t('finance.invoice')}</th>
                  <th>{t('finance.method')}</th>
                  <th>{t('finance.reference')}</th>
                  <th className="right">{t('app.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <DateText value={payment.receivedOn} />
                    </td>
                    <td>{payment.projectName}</td>
                    <td>{payment.invoiceNumber ?? '—'}</td>
                    <td>{t(`finance.methods.${payment.method as 'other'}`)}</td>
                    <td>{payment.reference ?? '—'}</td>
                    <td className="right">
                      <Money minor={payment.amountMinor} currency={payment.currencyCode} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty />
          )}
        </section>
      ) : null}
    </div>
  );
}
