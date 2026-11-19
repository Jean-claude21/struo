import { createFileRoute } from '@tanstack/react-router';
import { formatDate, formatMoney } from '@/components/ui.tsx';
import { getInvoicePrint } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/print/invoice/$invoiceId')({
  loader: ({ params }) => getInvoicePrint({ data: { id: params.invoiceId } }),
  component: InvoicePrint,
});

/**
 * Printable invoice (spec 035): the browser's « print to PDF » produces the file sent to the client.
 * Its lines (priced items, progress per lot, section titles), its references, rates and deductions,
 * and the company's legal and payment details. A draft says so in large letters.
 */
function InvoicePrint() {
  const { t, locale } = useI18n();
  const invoice = Route.useLoaderData();
  const money = (minor: number | null) => formatMoney(locale, minor, invoice.currency_code);
  const s = (invoice.settings ?? {}) as Record<string, string | null>;
  const qty = (milli: number) => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 3 }).format(milli / 1000);
  const hasProgress = invoice.lines.some((line) => line.kind === 'progress');
  const rows: [string, number | null, boolean?][] = [
    [t('finance.amountHt'), invoice.amount_minor],
    [invoice.vat_bps ? t('finance.vatRate', { rate: invoice.vat_bps / 100 }) : `${t('inv.vatExempt')}${invoice.vat_exempt_reason ? ` (${invoice.vat_exempt_reason})` : ''}`, invoice.vat_minor],
    [t('finance.totalTtc'), invoice.total_minor, true],
    ...(invoice.retention_minor ? ([[`− ${t('finance.retentionRate', { rate: invoice.retention_bps / 100 })}`, invoice.retention_minor]] as [string, number][]) : []),
    ...(invoice.deduction_minor ? ([[`− ${t('finance.deduction')}`, invoice.deduction_minor]] as [string, number][]) : []),
    ...invoice.adjustments.map((item) => [`− ${item.label}${item.rate_bps !== null ? ` (${item.rate_bps / 100} % ${item.base === 'ttc' ? 'TTC' : 'HT'})` : ''}`, Number(item.amount_minor)] as [string, number]),
    [t('finance.net'), invoice.net_minor, true],
    ...(invoice.status === 'issued' ? ([[t('finance.paid'), invoice.paid_minor ?? 0], [t('finance.balance'), invoice.balance_minor ?? invoice.net_minor, true]] as [string, number, boolean?][]) : []),
  ];
  return (
    <div className="print-page stack">
      <div className="no-print row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={() => window.print()}>{t('app.print')}</button>
      </div>
      {invoice.status === 'draft' ? <div className="print-draft">{t('inv.draftStamp')}</div> : null}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="small">
          <h2 style={{ margin: 0 }}>{s.legal_name || invoice.company_name}</h2>
          {s.address ? <div style={{ whiteSpace: 'pre-line' }}>{s.address}</div> : null}
          {[s.phone, s.email].filter(Boolean).join(' · ') ? <div>{[s.phone, s.email].filter(Boolean).join(' · ')}</div> : null}
          {s.tax_id ? <div>{t('inv.taxId')} : {s.tax_id}</div> : null}
          {s.trade_register ? <div>{t('inv.tradeRegister')} : {s.trade_register}</div> : null}
        </div>
        <div className="right">
          <h1 style={{ margin: 0 }}>{t('finance.printTitle', { kind: t(`finance.kinds.${invoice.kind as 'progress'}`), number: invoice.status === 'draft' ? t('inv.statusDraft') : invoice.number })}</h1>
          {invoice.status === 'cancelled' ? <p className="error">{t('finance.cancelled')}</p> : null}
          <div>{t('finance.issuedOn')} {formatDate(locale, invoice.issued_on)}</div>
          <div>{t('finance.dueOn')} {formatDate(locale, invoice.due_on)}</div>
          {invoice.contract_ref ? <div>{t('inv.contractRef')} : {invoice.contract_ref}</div> : null}
          {invoice.order_ref ? <div>{t('inv.orderRef')} : {invoice.order_ref}</div> : null}
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
          <strong>{invoice.project_code} — {invoice.project_name}</strong>
          {invoice.location ? <div>{invoice.location}</div> : null}
          {invoice.label ? <div className="muted">{invoice.label}</div> : null}
        </div>
      </div>
      {invoice.lines.length ? (
        <table className="print-lines">
          <thead>
            <tr>
              <th>{t('inv.designation')}</th>
              {hasProgress ? <><th className="right">{t('inv.contract')}</th><th className="right">{t('inv.cumulative')}</th><th className="right">{t('inv.previous')}</th></>
                : <><th>{t('inv.unit')}</th><th className="right">{t('inv.quantity')}</th><th className="right">{t('inv.unitPrice')}</th></>}
              <th className="right">{t('inv.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, index) => line.kind === 'text' ? (
              <tr key={index} className="section"><td colSpan={5}><strong>{line.designation}</strong></td></tr>
            ) : (
              <tr key={index}>
                <td>{line.designation}</td>
                {line.kind === 'progress' ? (
                  <><td className="right">{money(Number(line.contract_minor))}</td><td className="right">{line.cumulative_bps / 100} %</td><td className="right">{money(Number(line.previous_minor))}</td></>
                ) : (
                  <><td>{line.unit ?? ''}</td><td className="right">{qty(Number(line.quantity_milli))}</td><td className="right">{money(Number(line.unit_price_minor))}</td></>
                )}
                <td className="right">{money(Number(line.amount_minor))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <table className="print-totals">
        <tbody>
          {rows.map(([label, value, strong], index) => (
            <tr key={index}>
              <td>{strong ? <strong>{label}</strong> : label}</td>
              <td className="right">{strong ? <strong>{money(value)}</strong> : money(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {invoice.notes ? <p className="small" style={{ whiteSpace: 'pre-line' }}>{invoice.notes}</p> : null}
      <div className="grid-2 small">
        {s.bank_details || s.mobile_money ? (
          <div className="card">
            <div className="muted small">{t('inv.payment')}</div>
            {s.bank_details ? <div style={{ whiteSpace: 'pre-line' }}>{s.bank_details}</div> : null}
            {s.mobile_money ? <div style={{ whiteSpace: 'pre-line', marginTop: '.3rem' }}>{s.mobile_money}</div> : null}
          </div>
        ) : null}
        {invoice.terms ? <div className="card"><div className="muted small">{t('inv.terms')}</div><div style={{ whiteSpace: 'pre-line' }}>{invoice.terms}</div></div> : null}
      </div>
      {s.footer ? <p className="faint xsmall" style={{ textAlign: 'center', whiteSpace: 'pre-line' }}>{s.footer}</p> : null}
    </div>
  );
}
