import { createFileRoute } from '@tanstack/react-router';
import { formatDate, formatMoney } from '@/components/ui.tsx';
import { getInvoicePrint } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/print/invoice/$invoiceId')({
  loader: ({ params }) => getInvoicePrint({ data: { id: params.invoiceId } }),
  component: InvoicePrint,
});

/** Printable invoice: the browser's « print to PDF » produces the file sent to the client. */
function InvoicePrint() {
  const { t, locale } = useI18n();
  const invoice = Route.useLoaderData();
  const money = (minor: number | null) => formatMoney(locale, minor, invoice.currency_code);
  const rows: [string, number | null, boolean?][] = [
    [t('finance.amountHt'), invoice.amount_minor],
    [t('finance.vatRate', { rate: invoice.vat_bps / 100 }), invoice.vat_minor],
    [t('finance.totalTtc'), invoice.total_minor, true],
    ...(invoice.retention_minor ? ([[`− ${t('finance.retentionRate', { rate: invoice.retention_bps / 100 })}`, invoice.retention_minor]] as [string, number][]) : []),
    ...(invoice.deduction_minor ? ([[`− ${t('finance.deduction')}`, invoice.deduction_minor]] as [string, number][]) : []),
    [t('finance.net'), invoice.net_minor, true],
    [t('finance.paid'), invoice.paid_minor ?? 0],
    [t('finance.balance'), invoice.balance_minor ?? invoice.net_minor, true],
  ];
  return (
    <div className="print-page stack">
      <div className="no-print row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={() => window.print()}>
          {t('app.print')}
        </button>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="muted small">{t('finance.issuer')}</div>
          <h2>{invoice.company_name}</h2>
        </div>
        <div className="right">
          <h1>{t('finance.printTitle', { kind: t(`finance.kinds.${invoice.kind as 'progress'}`), number: invoice.number })}</h1>
          {invoice.status === 'cancelled' ? <p className="error">{t('finance.cancelled')}</p> : null}
          <div>
            {t('finance.issuedOn')} {formatDate(locale, invoice.issued_on)}
          </div>
          <div>
            {t('finance.dueOn')} {formatDate(locale, invoice.due_on)}
          </div>
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="muted small">{t('finance.billedTo')}</div>
          <strong>{invoice.client_name ?? '—'}</strong>
          {invoice.client_address ? <div>{invoice.client_address}</div> : null}
          {invoice.client_email ? <div>{invoice.client_email}</div> : null}
          {invoice.client_phone ? <div>{invoice.client_phone}</div> : null}
        </div>
        <div className="card">
          <div className="muted small">{t('finance.site')}</div>
          <strong>
            {invoice.project_code} — {invoice.project_name}
          </strong>
          {invoice.location ? <div>{invoice.location}</div> : null}
          {invoice.label ? <div className="muted">{invoice.label}</div> : null}
        </div>
      </div>
      <table>
        <tbody>
          {rows.map(([label, value, strong]) => (
            <tr key={label}>
              <td>{strong ? <strong>{label}</strong> : label}</td>
              <td className="right">{strong ? <strong>{money(value)}</strong> : money(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
