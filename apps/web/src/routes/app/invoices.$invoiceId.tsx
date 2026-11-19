// The invoice editor (spec 035): a draft's header, its lines — priced items, progress per lot, text —
// its rates, the advance and the complementary deductions. Every change is saved after a short pause
// and the server sends back the amounts (nothing is computed in the browser). « Émettre » gives the
// number of the company's series and freezes it.
import { can } from '@struo/core/permissions';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, FileText, Loader2, Plus, Trash2, Type } from 'lucide-react';
import { Modal, PageHeader, Panel, StatusChip, useToast } from '@/components/kit.tsx';
import { DateText, formatMoney, parseMoney } from '@/components/ui.tsx';
import { deleteDraftInvoice, getInvoiceEditor, issueInvoice, saveDraftInvoice } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/invoices/$invoiceId')({
  loader: ({ params }) => getInvoiceEditor({ data: { id: params.invoiceId } }),
  component: InvoiceEditor,
});

type Edit = Awaited<ReturnType<typeof getInvoiceEditor>>['invoice'];
type Line = Edit['lines'][number];
type Adjustment = Edit['adjustments'][number];

// Editable text for numbers: what the person types, turned into integers for the server.
const qtyText = (milli: number) => (milli / 1000).toString().replace('.', ',');
const toMilli = (value: string) => { const n = Number(value.replace(/\s/gu, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : 0; };
const pctText = (bps: number) => (bps / 100).toString().replace('.', ',');
const toBps = (value: string) => { const n = Number(value.replace(',', '.')); return Number.isFinite(n) ? Math.max(0, Math.min(10_000, Math.round(n * 100))) : 0; };

function InvoiceEditor() {
  const { t, locale, errorText } = useI18n();
  const loaded = Route.useLoaderData();
  const router = useRouter();
  const toast = useToast();
  const [edit, setEdit] = useState<Edit>(loaded.invoice);
  const [state, setState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [issuing, setIssuing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(edit);
  latest.current = edit;
  useEffect(() => { setEdit(loaded.invoice); }, [loaded.invoice]);

  const draft = edit.status === 'draft';
  const writable = draft && can(loaded.role, 'finance.write');
  const money = (minor: number) => formatMoney(locale, minor, edit.currencyCode);
  const moneyText = (minor: number) => (minor ? new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { useGrouping: false }).format(minor) : '');
  const toMinor = (value: string) => parseMoney(value, edit.currencyCode) ?? 0;

  const save = async () => {
    const current = latest.current;
    setState('saving');
    try {
      const fresh = await saveDraftInvoice({ data: { id: current.id, patch: {
        kind: current.kind, label: current.label, issuedOn: current.issuedOn, dueOn: current.dueOn, contractRef: current.contractRef, orderRef: current.orderRef,
        notes: current.notes, terms: current.terms, vatBps: current.vatBps, vatExemptReason: current.vatExemptReason, retentionBps: current.retentionBps,
        deductionMinor: current.deductionMinor,
        lines: current.lines.map(({ kind, section, designation, unit, quantityMilli, unitPriceMinor, phaseId, contractMinor, cumulativeBps, previousMinor }) => ({
          kind, section, designation: designation.trim() || '—', unit, quantityMilli, unitPriceMinor, phaseId, contractMinor, cumulativeBps, previousMinor })),
        adjustments: current.adjustments.map(({ label, rateBps, base, amountMinor }) => ({ label: label.trim() || '—', rateBps, base, amountMinor })),
      } } });
      // Keep what she is typing; take the server's amounts.
      setEdit((now) => ({ ...now, ...pickTotals(fresh), lines: now.lines.map((line, index) => ({ ...line, amountMinor: fresh.lines[index]?.amountMinor ?? line.amountMinor })),
        adjustments: now.adjustments.map((item, index) => ({ ...item, amountMinor: fresh.adjustments[index]?.amountMinor ?? item.amountMinor })) }));
      setState('saved');
    } catch (caught) {
      setState('error');
      toast({ text: errorText(caught), kind: 'err' });
    }
  };
  const change = (patch: Partial<Edit> | ((current: Edit) => Partial<Edit>)) => {
    setEdit((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }));
    setState('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 700);
  };
  const setLine = (index: number, patch: Partial<Line>) => change((current) => ({ lines: current.lines.map((line, position) => (position === index ? { ...line, ...patch } : line)) }));
  const addLine = (kind: Line['kind'], phase?: Edit['phases'][number]) => change((current) => ({ lines: [...current.lines, {
    id: crypto.randomUUID(), position: current.lines.length, kind, section: null, designation: phase?.name ?? '', unit: kind === 'item' ? 'u' : null,
    quantityMilli: kind === 'item' ? 1000 : 0, unitPriceMinor: 0, phaseId: phase?.id ?? null, contractMinor: phase?.budgetMinor ?? 0,
    cumulativeBps: phase ? phase.progressPct * 100 : 0, previousMinor: 0, amountMinor: 0 }] }));
  const move = (index: number, by: number) => change((current) => {
    const lines = [...current.lines]; const [line] = lines.splice(index, 1); lines.splice(Math.max(0, Math.min(lines.length, index + by)), 0, line!); return { lines };
  });
  const setAdjustment = (index: number, patch: Partial<Adjustment>) => change((current) => ({ adjustments: current.adjustments.map((item, position) => (position === index ? { ...item, ...patch } : item)) }));

  const issue = async () => {
    window.clearTimeout(timer.current);
    await save();
    try {
      const { number } = await issueInvoice({ data: { id: edit.id } });
      toast({ text: t('inv.issued', { number }) });
      setIssuing(false);
      await router.invalidate();
    } catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };

  const totals: [string, number, boolean?][] = [
    [t('finance.amountHt'), edit.amountMinor],
    [t('finance.vatRate', { rate: edit.vatBps / 100 }), edit.vatMinor],
    [t('finance.totalTtc'), edit.totalMinor, true],
    ...(edit.retentionMinor ? [[`− ${t('finance.retentionRate', { rate: edit.retentionBps / 100 })}`, edit.retentionMinor] as [string, number]] : []),
    ...(edit.deductionMinor ? [[`− ${t('finance.deduction')}`, edit.deductionMinor] as [string, number]] : []),
    ...edit.adjustments.map((item) => [`− ${item.label}`, item.amountMinor] as [string, number]),
    [t('finance.net'), edit.netMinor, true],
  ];

  return (
    <div className="stack loose">
      <PageHeader title={draft ? t('inv.draftTitle', { site: edit.projectCode }) : edit.number}
        text={<span className="row tight"><StatusChip shape={draft ? 'todo' : 'progress'} label={t(draft ? 'inv.statusDraft' : 'inv.statusIssued')} />
          <Link to="/app/projects/$projectId" params={{ projectId: edit.projectId }}>{edit.projectCode} · {edit.projectName}</Link>{edit.clientName ? ` · ${edit.clientName}` : ''}</span>}>
        <span className="small muted row tight">{state === 'saving' ? <><Loader2 size={13} className="spin" />{t('inv.saving')}</> : state === 'dirty' ? t('inv.dirty') : state === 'saved' && draft ? <><Check size={13} />{t('inv.saved')}</> : null}</span>
        <a className="btn secondary" href={`/print/invoice/${edit.id}`} target="_blank" rel="noreferrer"><FileText size={16} />{t('inv.preview')}</a>
        {writable ? <button type="button" className="btn" onClick={() => setIssuing(true)}>{t('inv.issue')}</button> : null}
      </PageHeader>

      <div className="inv-layout">
        <div className="stack">
          <Panel title={t('inv.header')}>
            <fieldset disabled={!writable} className="form-grid" style={{ border: 0, padding: 0, margin: 0 }}>
              <label className="field">{t('finance.kind')}
                <select value={edit.kind} onChange={(event) => change({ kind: event.target.value })}>
                  {(['advance', 'progress', 'final'] as const).map((kind) => <option key={kind} value={kind}>{t(`finance.kinds.${kind}`)}</option>)}
                </select></label>
              <label className="field">{t('finance.label')}<input value={edit.label ?? ''} maxLength={200} onChange={(event) => change({ label: event.target.value || null })} /></label>
              <label className="field">{t('finance.issuedOn')}<input type="date" value={edit.issuedOn} onChange={(event) => change({ issuedOn: event.target.value })} /></label>
              <label className="field">{t('finance.dueOn')}<input type="date" value={edit.dueOn} onChange={(event) => change({ dueOn: event.target.value })} /></label>
              <label className="field">{t('inv.contractRef')}<input value={edit.contractRef ?? ''} maxLength={120} onChange={(event) => change({ contractRef: event.target.value || null })} /></label>
              <label className="field">{t('inv.orderRef')}<input value={edit.orderRef ?? ''} maxLength={120} onChange={(event) => change({ orderRef: event.target.value || null })} /></label>
            </fieldset>
          </Panel>

          <Panel title={t('inv.lines')} sub={t('inv.linesSub')} flush>
            <div className="table-wrap">
              <table className="inv-lines">
                <thead><tr>
                  <th style={{ width: 30 }} /><th>{t('inv.designation')}</th><th style={{ width: 70 }}>{t('inv.unit')}</th>
                  <th className="right" style={{ width: 110 }}>{t('inv.qtyOrContract')}</th><th className="right" style={{ width: 120 }}>{t('inv.priceOrPct')}</th>
                  <th className="right" style={{ width: 120 }}>{t('inv.previous')}</th><th className="right" style={{ width: 130 }}>{t('inv.amount')}</th><th style={{ width: 70 }} />
                </tr></thead>
                <tbody>
                  {edit.lines.map((line, index) => (
                    <tr key={line.id} className={`k-${line.kind}`}>
                      <td className="faint xsmall">{line.kind === 'text' ? <Type size={13} /> : line.kind === 'progress' ? '%' : '×'}</td>
                      <td><input value={line.designation} disabled={!writable} maxLength={500} placeholder={t(line.kind === 'text' ? 'inv.sectionTitle' : 'inv.designation')}
                        onChange={(event) => setLine(index, { designation: event.target.value })} style={line.kind === 'text' ? { fontWeight: 700 } : undefined} /></td>
                      {line.kind === 'item' ? (
                        <>
                          <td><input value={line.unit ?? ''} disabled={!writable} maxLength={20} onChange={(event) => setLine(index, { unit: event.target.value || null })} /></td>
                          <td><input className="right" inputMode="decimal" disabled={!writable} defaultValue={qtyText(line.quantityMilli)} onChange={(event) => setLine(index, { quantityMilli: toMilli(event.target.value) })} /></td>
                          <td><input className="right" inputMode="decimal" disabled={!writable} defaultValue={moneyText(line.unitPriceMinor)} onChange={(event) => setLine(index, { unitPriceMinor: toMinor(event.target.value) })} /></td>
                          <td />
                        </>
                      ) : line.kind === 'progress' ? (
                        <>
                          <td className="faint xsmall">{t('inv.lot')}</td>
                          <td><input className="right" inputMode="decimal" disabled={!writable} defaultValue={moneyText(line.contractMinor)} onChange={(event) => setLine(index, { contractMinor: toMinor(event.target.value) })} /></td>
                          <td><input className="right" inputMode="decimal" disabled={!writable} defaultValue={pctText(line.cumulativeBps)} onChange={(event) => setLine(index, { cumulativeBps: toBps(event.target.value) })} /></td>
                          <td className="right muted small num">{line.previousMinor ? money(line.previousMinor) : '—'}</td>
                        </>
                      ) : <td colSpan={4} />}
                      <td className="right num"><b>{line.kind === 'text' ? '' : money(line.amountMinor)}</b></td>
                      <td className="nowrap">
                        {writable ? (
                          <span className="row tight nowrap" style={{ gap: 0 }}>
                            <button type="button" className="icon-btn sm" aria-label={t('inv.up')} onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={13} /></button>
                            <button type="button" className="icon-btn sm" aria-label={t('inv.down')} onClick={() => move(index, 1)} disabled={index === edit.lines.length - 1}><ArrowDown size={13} /></button>
                            <button type="button" className="icon-btn sm" aria-label={t('app.remove')} onClick={() => change((current) => ({ lines: current.lines.filter((_, position) => position !== index) }))}><Trash2 size={13} /></button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {!edit.lines.length ? <tr><td colSpan={8} className="muted small">{t('inv.noLines')}</td></tr> : null}
                </tbody>
              </table>
            </div>
            {writable ? (
              <div className="row tight" style={{ padding: '.75rem 1rem' }}>
                <button type="button" className="btn secondary small" onClick={() => addLine('item')}><Plus size={14} />{t('inv.addItem')}</button>
                <button type="button" className="btn ghost small" onClick={() => addLine('text')}><Type size={14} />{t('inv.addSection')}</button>
                <select className="small" value="" onChange={(event) => { const phase = edit.phases.find((item) => item.id === event.target.value); if (phase) addLine('progress', phase); }} style={{ width: 'auto', minHeight: 32 }}>
                  <option value="">{t('inv.addLot')}</option>
                  {edit.phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name} · {phase.progressPct} %</option>)}
                </select>
              </div>
            ) : null}
          </Panel>

          <Panel title={t('inv.deductions')} sub={t('inv.deductionsSub')}>
            <div className="stack" style={{ gap: '.5rem' }}>
              {edit.adjustments.map((item, index) => (
                <div key={item.id} className="row tight nowrap">
                  <input value={item.label} disabled={!writable} placeholder={t('inv.deductionLabel')} onChange={(event) => setAdjustment(index, { label: event.target.value })} style={{ flex: 2, minWidth: 0 }} />
                  <select value={item.rateBps === null ? 'amount' : item.base} disabled={!writable} style={{ width: 'auto' }}
                    onChange={(event) => setAdjustment(index, event.target.value === 'amount' ? { rateBps: null } : { base: event.target.value as 'ht' | 'ttc', rateBps: item.rateBps ?? 0 })}>
                    <option value="ht">{t('inv.rateHt')}</option><option value="ttc">{t('inv.rateTtc')}</option><option value="amount">{t('inv.fixed')}</option>
                  </select>
                  {item.rateBps === null
                    ? <input className="right" inputMode="decimal" disabled={!writable} defaultValue={moneyText(item.amountMinor)} onChange={(event) => setAdjustment(index, { amountMinor: toMinor(event.target.value) })} style={{ width: 130 }} />
                    : <input className="right" inputMode="decimal" disabled={!writable} defaultValue={pctText(item.rateBps)} onChange={(event) => setAdjustment(index, { rateBps: toBps(event.target.value) })} style={{ width: 80 }} />}
                  <span className="num small" style={{ width: 120, textAlign: 'right' }}>{money(item.amountMinor)}</span>
                  {writable ? <button type="button" className="icon-btn sm" aria-label={t('app.remove')} onClick={() => change((current) => ({ adjustments: current.adjustments.filter((_, position) => position !== index) }))}><Trash2 size={13} /></button> : null}
                </div>
              ))}
              {writable ? (
                <div className="row tight">
                  {(['inv.presetAib', 'inv.presetPenalty', 'inv.presetOther'] as const).map((key) => (
                    <button key={key} type="button" className="chip small" onClick={() => change((current) => ({ adjustments: [...current.adjustments, {
                      id: crypto.randomUUID(), position: current.adjustments.length, label: t(key), base: 'ht', rateBps: key === 'inv.presetAib' ? 500 : null, amountMinor: 0 }] }))}>
                      <Plus size={12} />{t(key)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title={t('inv.texts')}>
            <fieldset disabled={!writable} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <label className="field">{t('inv.notes')}<textarea rows={2} value={edit.notes ?? ''} maxLength={2000} onChange={(event) => change({ notes: event.target.value || null })} /></label>
              <label className="field">{t('inv.terms')}<textarea rows={2} value={edit.terms ?? ''} maxLength={1000} onChange={(event) => change({ terms: event.target.value || null })} /></label>
            </fieldset>
          </Panel>
        </div>

        <aside className="stack inv-side">
          <Panel title={t('inv.rates')}>
            <fieldset disabled={!writable} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <label className="field">{t('inv.vat')}<input inputMode="decimal" defaultValue={pctText(edit.vatBps)} onChange={(event) => change({ vatBps: toBps(event.target.value) })} /></label>
              {edit.vatBps === 0 ? <label className="field">{t('inv.exemptReason')}<input value={edit.vatExemptReason ?? ''} maxLength={200} onChange={(event) => change({ vatExemptReason: event.target.value || null })} placeholder={t('inv.exemptHint')} /></label> : null}
              <label className="field">{t('inv.retention')}<input inputMode="decimal" defaultValue={pctText(edit.retentionBps)} onChange={(event) => change({ retentionBps: toBps(event.target.value) })} /></label>
              <label className="field">{t('finance.deduction')}<input inputMode="decimal" defaultValue={moneyText(edit.deductionMinor)} onChange={(event) => change({ deductionMinor: toMinor(event.target.value) })} /></label>
            </fieldset>
          </Panel>
          <Panel title={t('inv.totals')}>
            <dl className="stack" style={{ gap: '.4rem', margin: 0 }}>
              {totals.map(([label, value, strong], index) => (
                <div key={index} className="row nowrap" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--divider)', paddingBottom: '.3rem' }}>
                  <dt className={strong ? '' : 'muted'}>{label}</dt>
                  <dd className="num" style={{ margin: 0, fontWeight: strong ? 700 : 550 }}>{money(value)}</dd>
                </div>
              ))}
            </dl>
            {state !== 'saved' && draft ? <p className="faint xsmall" style={{ margin: '.5rem 0 0' }}>{t('inv.recomputing')}</p> : null}
          </Panel>
          {writable ? <button type="button" className="btn ghost small danger-text" onClick={async () => {
            await deleteDraftInvoice({ data: { id: edit.id } }); window.location.href = '/app/finance';
          }}><Trash2 size={14} />{t('inv.deleteDraft')}</button> : null}
          {!draft ? <p className="small muted">{t('inv.frozen')} <DateText value={edit.issuedOn} /></p> : null}
        </aside>
      </div>

      <Modal open={issuing} onClose={() => setIssuing(false)} title={t('inv.issueTitle')}
        footer={(<><button type="button" className="btn secondary" onClick={() => setIssuing(false)}>{t('app.cancel')}</button>
          <button type="button" className="btn" onClick={() => void issue()}>{t('inv.issueConfirm', { amount: money(edit.netMinor) })}</button></>)}>
        <p style={{ margin: 0 }}>{t('inv.issueText')}</p>
      </Modal>
    </div>
  );
}

const pickTotals = (fresh: Edit) => ({
  amountMinor: fresh.amountMinor, vatMinor: fresh.vatMinor, totalMinor: fresh.totalMinor, retentionMinor: fresh.retentionMinor,
  deductionMinor: fresh.deductionMinor, otherDeductionsMinor: fresh.otherDeductionsMinor, netMinor: fresh.netMinor,
});
