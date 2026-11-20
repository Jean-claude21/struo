// The invoice as printed (spec 036), the same for the PDF and the live preview in Settings: the
// company's layout (classic, modern, compact), its colour, its logo and where it sits, its titles,
// the blocks and columns it shows, its own fields, the amount in words and the signature. Amounts
// come from the server; this only lays them out.
import type { CSSProperties } from 'react';
import { formatDate, formatMoney } from '@/components/ui.tsx';
import { amountInWords } from '@/lib/words.ts';
import { useI18n } from '@/i18n/index.tsx';

export interface SheetLook {
  template: 'classic' | 'modern' | 'compact'; accentColor: string | null; logoPosition: 'left' | 'center' | 'right'; logoHeight: number; font: 'sans' | 'serif';
  showAmountWords: boolean; showSignature: boolean; signerName: string | null; signerTitle: string | null;
  showClientContact: boolean; showSite: boolean; showPayments: boolean; showUnitColumns: boolean;
  titles: Partial<Record<'advance' | 'progress' | 'final', string>>; customFields: { label: string; value: string }[];
  legalName: string | null; taxId: string | null; tradeRegister: string | null; address: string | null; phone: string | null; email: string | null;
  bankDetails: string | null; mobileMoney: string | null; footer: string | null;
}

export interface SheetDoc {
  number: string; kind: string; status: string; label: string | null; issued_on: string; due_on: string; currency_code: string;
  amount_minor: number; vat_bps: number; vat_minor: number; total_minor: number; retention_bps: number; retention_minor: number;
  deduction_minor: number; net_minor: number; paid_minor: number | null; balance_minor: number | null;
  project_code: string; project_name: string; location: string | null; client_name: string | null; client_address: string | null;
  client_email: string | null; client_phone: string | null; company_name: string;
  contract_ref: string | null; order_ref: string | null; notes: string | null; terms: string | null; vat_exempt_reason: string | null;
  extra_fields: { label: string; value: string }[];
  lines: { kind: string; designation: string; unit: string | null; quantity_milli: number; unit_price_minor: number; contract_minor: number; cumulative_bps: number; previous_minor: number; amount_minor: number }[];
  adjustments: { label: string; rate_bps: number | null; base: string; amount_minor: number }[];
}

export function InvoiceSheet({ doc, look, logoUrl }: { doc: SheetDoc; look: SheetLook; logoUrl: string | null }) {
  const { t, locale } = useI18n();
  const money = (minor: number | null) => formatMoney(locale, minor, doc.currency_code);
  const qty = (milli: number) => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 3 }).format(milli / 1000);
  const accent = look.accentColor ?? '#b9461e';
  const kind = doc.kind as 'advance' | 'progress' | 'final';
  const title = look.titles[kind]?.trim() || t(`finance.kinds.${kind}`);
  const progress = doc.lines.some((line) => line.kind === 'progress');
  const draft = doc.status === 'draft';
  const totals: [string, number | null, boolean?][] = [
    [t('finance.amountHt'), doc.amount_minor],
    [doc.vat_bps ? t('finance.vatRate', { rate: doc.vat_bps / 100 }) : `${t('inv.vatExempt')}${doc.vat_exempt_reason ? ` (${doc.vat_exempt_reason})` : ''}`, doc.vat_minor],
    [t('finance.totalTtc'), doc.total_minor, true],
    ...(doc.retention_minor ? [[`− ${t('finance.retentionRate', { rate: doc.retention_bps / 100 })}`, doc.retention_minor] as [string, number]] : []),
    ...(doc.deduction_minor ? [[`− ${t('finance.deduction')}`, doc.deduction_minor] as [string, number]] : []),
    ...doc.adjustments.map((item) => [`− ${item.label}${item.rate_bps !== null ? ` (${item.rate_bps / 100} % ${item.base === 'ttc' ? 'TTC' : 'HT'})` : ''}`, Number(item.amount_minor)] as [string, number]),
    [t('finance.net'), doc.net_minor, true],
    ...(look.showPayments && doc.status === 'issued' ? [[t('finance.paid'), doc.paid_minor ?? 0], [t('finance.balance'), doc.balance_minor ?? doc.net_minor, true]] as [string, number, boolean?][] : []),
  ];
  const company = (
    <div className="is-company">
      {logoUrl && look.logoPosition !== 'center' ? <img src={logoUrl} alt="" style={{ height: look.logoHeight }} className="is-logo" /> : null}
      <div>
        <div className="is-name">{look.legalName || doc.company_name}</div>
        {look.address ? <div style={{ whiteSpace: 'pre-line' }}>{look.address}</div> : null}
        {[look.phone, look.email].filter(Boolean).length ? <div>{[look.phone, look.email].filter(Boolean).join(' · ')}</div> : null}
        {look.taxId ? <div>{t('inv.taxId')} : {look.taxId}</div> : null}
        {look.tradeRegister ? <div>{t('inv.tradeRegister')} : {look.tradeRegister}</div> : null}
        {look.customFields.map((field) => <div key={field.label}>{field.label} : {field.value}</div>)}
      </div>
    </div>
  );
  const identity = (
    <div className="is-identity">
      <div className="is-title">{title}</div>
      <div className="is-number">{draft ? t('inv.statusDraft') : doc.number}</div>
      <div>{t('finance.issuedOn')} {formatDate(locale, doc.issued_on)}</div>
      <div>{t('finance.dueOn')} {formatDate(locale, doc.due_on)}</div>
      {doc.contract_ref ? <div>{t('inv.contractRef')} : {doc.contract_ref}</div> : null}
      {doc.order_ref ? <div>{t('inv.orderRef')} : {doc.order_ref}</div> : null}
      {doc.extra_fields.map((field) => <div key={field.label}>{field.label} : {field.value}</div>)}
    </div>
  );
  return (
    <div className={`invoice-sheet is-${look.template} is-font-${look.font}`} style={{ '--accent': accent } as CSSProperties}>
      {draft ? <div className="is-draft">{t('inv.draftStamp')}</div> : null}
      {logoUrl && look.logoPosition === 'center' ? <div style={{ textAlign: 'center' }}><img src={logoUrl} alt="" style={{ height: look.logoHeight }} className="is-logo" /></div> : null}
      <header className={`is-head ${look.logoPosition === 'right' ? 'reverse' : ''}`}>{company}{identity}</header>
      <div className="is-parties">
        <div className="is-box">
          <div className="is-label">{t('finance.billedTo')}</div>
          <b>{doc.client_name ?? '—'}</b>
          {look.showClientContact ? <>
            {doc.client_address ? <div>{doc.client_address}</div> : null}
            {doc.client_email ? <div>{doc.client_email}</div> : null}
            {doc.client_phone ? <div>{doc.client_phone}</div> : null}
          </> : null}
        </div>
        {look.showSite ? (
          <div className="is-box">
            <div className="is-label">{t('finance.site')}</div>
            <b>{doc.project_code} — {doc.project_name}</b>
            {doc.location ? <div>{doc.location}</div> : null}
            {doc.label ? <div className="is-muted">{doc.label}</div> : null}
          </div>
        ) : null}
      </div>
      {doc.lines.length ? (
        <table className="is-lines">
          <thead><tr>
            <th>{t('inv.designation')}</th>
            {progress ? <><th className="r">{t('inv.contract')}</th><th className="r">{t('inv.cumulative')}</th><th className="r">{t('inv.previous')}</th></>
              : look.showUnitColumns ? <><th>{t('inv.unit')}</th><th className="r">{t('inv.quantity')}</th><th className="r">{t('inv.unitPrice')}</th></> : null}
            <th className="r">{t('inv.amount')}</th>
          </tr></thead>
          <tbody>
            {doc.lines.map((line, index) => line.kind === 'text' ? (
              <tr key={index} className="is-section"><td colSpan={5}>{line.designation}</td></tr>
            ) : (
              <tr key={index}>
                <td>{line.designation}</td>
                {progress ? (line.kind === 'progress'
                  ? <><td className="r">{money(Number(line.contract_minor))}</td><td className="r">{line.cumulative_bps / 100} %</td><td className="r">{money(Number(line.previous_minor))}</td></>
                  : <><td className="r">{qty(Number(line.quantity_milli))} {line.unit ?? ''}</td><td className="r">{money(Number(line.unit_price_minor))}</td><td /></>)
                  : look.showUnitColumns ? <><td>{line.unit ?? ''}</td><td className="r">{qty(Number(line.quantity_milli))}</td><td className="r">{money(Number(line.unit_price_minor))}</td></> : null}
                <td className="r">{money(Number(line.amount_minor))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <table className="is-totals">
        <tbody>{totals.map(([label, value, strong], index) => (
          <tr key={index} className={strong ? 'strong' : ''}><td>{label}</td><td className="r">{money(value)}</td></tr>
        ))}</tbody>
      </table>
      {look.showAmountWords ? <p className="is-words">{t('inv.inWords', { words: amountInWords(Number(doc.net_minor), doc.currency_code, locale) })}</p> : null}
      {doc.notes ? <p style={{ whiteSpace: 'pre-line' }}>{doc.notes}</p> : null}
      <div className="is-parties">
        {look.bankDetails || look.mobileMoney ? (
          <div className="is-box">
            <div className="is-label">{t('inv.payment')}</div>
            {look.bankDetails ? <div style={{ whiteSpace: 'pre-line' }}>{look.bankDetails}</div> : null}
            {look.mobileMoney ? <div style={{ whiteSpace: 'pre-line', marginTop: '.3rem' }}>{look.mobileMoney}</div> : null}
          </div>
        ) : null}
        {doc.terms ? <div className="is-box"><div className="is-label">{t('inv.terms')}</div><div style={{ whiteSpace: 'pre-line' }}>{doc.terms}</div></div> : null}
      </div>
      {look.showSignature ? (
        <div className="is-signature">
          <div className="is-label">{t('inv.signature')}</div>
          <div className="is-sign-space" />
          {look.signerName ? <b>{look.signerName}</b> : null}
          {look.signerTitle ? <div className="is-muted">{look.signerTitle}</div> : null}
        </div>
      ) : null}
      {look.footer ? <footer className="is-footer">{look.footer}</footer> : null}
    </div>
  );
}
