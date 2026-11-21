// Spec 051: the payments clients declare (« I paid »), for the people who handle money to confirm
// (it then becomes a payment on the invoice) or refuse with a reason the client reads.
import type { PaymentClaimRow } from '@struo/core';
import { Check, FileText, Inbox, X } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, Panel, useToast } from './kit.tsx';
import { DateText, formatMoney } from './ui.tsx';
import { confirmPaymentClaim, rejectPaymentClaim } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export function PaymentClaims({ claims, canWrite, onDone, compact = false }: { claims: PaymentClaimRow[]; canWrite: boolean; onDone: () => Promise<void> | void; compact?: boolean }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const shown = compact ? claims.filter((claim) => claim.status === 'pending') : claims;
  const run = async (id: string, work: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try { await work(); toast({ text: done }); setRefusing(null); setReason(''); await onDone(); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
    finally { setBusy(null); }
  };
  if (compact && !shown.length) return null;
  return (
    <Panel title={t('claims.title')} sub={t('claims.sub')} flush>
      {shown.length ? (
        <ul className="claims">{shown.map((claim) => (
          <li key={claim.id} className={claim.status}>
            <div className="row nowrap">
              <span className="grow trunc"><b>{claim.projectCode}</b> · {claim.clientName ?? claim.projectName} · {t('claims.invoice', { number: claim.invoiceNumber })}</span>
              <b className="num">{formatMoney(locale, claim.amountMinor, claim.currency)}</b>
            </div>
            <div className="row small muted" style={{ flexWrap: 'wrap', gap: '.2rem .8rem' }}>
              <span>{t('claims.paidOn')} <DateText value={claim.paidOn} /></span>
              <span>{t(`finance.methods.${claim.method as 'other'}`)}</span>
              {claim.reference ? <span>{t('claims.ref', { ref: claim.reference })}</span> : null}
              {claim.hasProof ? <a href={`/api/files/claim/${claim.id}`} target="_blank" rel="noreferrer"><FileText size={13} /> {t('claims.proof')}</a> : <span>{t('claims.noProof')}</span>}
            </div>
            {claim.note ? <p className="small" style={{ margin: 0 }}>« {claim.note} »</p> : null}
            {claim.status === 'pending' && canWrite ? (
              refusing === claim.id ? (
                <form className="row nowrap" onSubmit={(event) => { event.preventDefault(); void run(claim.id, () => rejectPaymentClaim({ data: { id: claim.id, reason } }), t('claims.refused')); }}>
                  <input value={reason} onChange={(event) => setReason(event.target.value)} minLength={2} maxLength={500} required placeholder={t('claims.reasonPlaceholder')} aria-label={t('claims.reason')} style={{ flex: 1, minWidth: 0 }} />
                  <button type="submit" className="btn danger small" disabled={busy === claim.id}>{t('claims.refuse')}</button>
                  <button type="button" className="btn ghost small" onClick={() => setRefusing(null)}>{t('app.cancel')}</button>
                </form>
              ) : (
                <div className="row">
                  <button type="button" className="btn small" disabled={busy === claim.id} onClick={() => void run(claim.id, () => confirmPaymentClaim({ data: { id: claim.id } }), t('claims.confirmed'))}><Check size={15} />{t('claims.confirm')}</button>
                  <button type="button" className="btn ghost small" disabled={busy === claim.id} onClick={() => setRefusing(claim.id)}><X size={15} />{t('claims.refuse')}</button>
                </div>
              )
            ) : claim.status !== 'pending' ? (
              <span className={`small ${claim.status === 'confirmed' ? 'ok-text' : 'bad-text'}`}>{claim.status === 'confirmed' ? t('claims.statusConfirmed') : t('claims.statusRejected', { reason: claim.rejectReason ?? '' })}</span>
            ) : null}
          </li>
        ))}</ul>
      ) : <EmptyState icon={Inbox} title={t('claims.none')} />}
    </Panel>
  );
}
