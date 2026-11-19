// Progress statement (spec 026, screen K2): pick a site, see each phase's validated progress turned
// into an amount, minus what was already invoiced; adjust if needed, then create the invoice.
import { useEffect, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { Calculator } from 'lucide-react';
import { Modal, useToast } from './kit.tsx';
import { formatMoney, parseMoney, todayIso } from './ui.tsx';
import { createInvoice, getProgressStatement } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

type Statement = Awaited<ReturnType<typeof getProgressStatement>>;

export function StatementDialog({ projects, currency }: { projects: { id: string; code: string; name: string }[]; currency: string }) {
  const { t, locale, errorText } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [statement, setStatement] = useState<Statement | null>(null);
  const [amount, setAmount] = useState('');
  const [deduction, setDeduction] = useState('');
  const [due, setDue] = useState(todayIso(30));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const money = (minor: number) => formatMoney(locale, minor, statement?.currencyCode ?? currency);
  const asText = (minor: number) => String(minor / 10 ** (currency === 'XOF' || currency === 'XAF' ? 0 : 2));

  useEffect(() => {
    if (!open || !projectId) return;
    setStatement(null); setError(null);
    getProgressStatement({ data: { id: projectId } })
      .then((result) => { setStatement(result); setAmount(asText(result.suggestedMinor)); setDeduction(asText(result.suggestedDeductionMinor)); })
      .catch((caught) => setError(errorText(caught)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const create = async () => {
    const amountMinor = parseMoney(amount, currency);
    const deductionMinor = deduction ? parseMoney(deduction, currency) : 0;
    if (!amountMinor || deductionMinor === null) { setError(t('errors.invalid_amount')); return; }
    setBusy(true); setError(null);
    try {
      await createInvoice({ data: { projectId, kind: 'progress', label: t('stmt.label', { n: statement?.nextNumber ?? 1 }), amountMinor, deductionMinor, dueOn: due } });
      toast({ text: t('stmt.created') });
      setOpen(false);
      await router.invalidate();
    } catch (caught) { setError(errorText(caught)); } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" className="btn secondary" onClick={() => setOpen(true)}><Calculator size={16} />{t('stmt.prepare')}</button>
      <Modal open={open} onClose={() => setOpen(false)} wide title={t('stmt.title')}
        footer={(<><button type="button" className="btn secondary" onClick={() => setOpen(false)}>{t('app.cancel')}</button>
          <button type="button" className="btn" disabled={busy || !statement || !statement.suggestedMinor && !Number(amount)} onClick={() => void create()}>{t('stmt.create')}</button></>)}>
        <div className="stack loose">
          <label className="field">{t('stmt.site')}
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
            </select>
          </label>
          {statement ? (
            <>
              <div className="table-wrap"><table>
                <thead><tr><th>{t('stmt.phase')}</th><th className="right">{t('stmt.budget')}</th><th className="right">{t('stmt.validated')}</th><th className="right">{t('stmt.earned')}</th></tr></thead>
                <tbody>{statement.phases.map((phase) => (
                  <tr key={phase.name}><td>{phase.name}</td><td className="right num">{money(phase.budgetMinor)}</td><td className="right num">{phase.progressPct} %</td><td className="right num"><b>{money(phase.earnedMinor)}</b></td></tr>
                ))}</tbody>
              </table></div>
              <div className="card stack" style={{ gap: '.35rem' }}>
                <div className="row nowrap"><span className="grow muted">{t('stmt.earnedTotal')}</span><b className="num">{money(statement.earnedMinor)}</b></div>
                <div className="row nowrap"><span className="grow muted">{t('stmt.invoiced')}</span><span className="num">− {money(statement.invoicedMinor)}</span></div>
                <div className="row nowrap"><span className="grow" style={{ fontWeight: 600 }}>{t('stmt.toInvoice')}</span><b className="num" style={{ color: 'var(--brand)', fontSize: '1.2rem' }}>{money(statement.suggestedMinor)}</b></div>
                <span className="faint xsmall">{t('stmt.source')}</span>
              </div>
              {statement.suggestedMinor === 0 ? <div className="notice info">{t('stmt.nothing')}</div> : null}
              <div className="form-grid">
                <label className="field">{t('stmt.toInvoice')} ({currency})<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label>
                <label className="field">{t('stmt.deduction')} ({currency})<input value={deduction} onChange={(event) => setDeduction(event.target.value)} inputMode="decimal" />
                  <span className="faint xsmall" style={{ fontWeight: 400 }}>{t('stmt.advanceInfo', { total: money(statement.advanceMinor), done: money(statement.advanceDeductedMinor) })}</span></label>
                <label className="field">{t('stmt.due')}<input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label>
              </div>
            </>
          ) : error ? null : <p className="muted">{t('ui.loading')}</p>}
          {error ? <p className="error" role="alert">{error}</p> : null}
        </div>
      </Modal>
    </>
  );
}
