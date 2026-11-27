// Spec 053: the money to come — the cash forecast at 30, 60 and 90 days, week by week, from what is
// recorded (never from late invoices), and the supplier bills to pay.
import { Check, Landmark, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BarChart, Legend } from './charts.tsx';
import { KpiTile, Panel, useToast } from './kit.tsx';
import { DateText, formatMoney, parseMoney, todayIso } from './ui.tsx';
import { cancelSupplierBill, createSupplierBill, getCash, paySupplierBill, setCashBalance } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

type Cash = Awaited<ReturnType<typeof getCash>>;
const CATEGORIES = ['materials', 'subcontracting', 'equipment', 'transport', 'fees', 'labour', 'other'] as const;

export function CashForecast({ canWrite }: { canWrite: boolean }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<Cash | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingBalance, setEditingBalance] = useState(false);
  const load = () => getCash().then(setData).catch((caught: unknown) => toast({ text: errorText(caught), kind: 'err' }));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data) return <p className="muted">…</p>;
  const { forecast } = data;
  const money = (minor: number) => formatMoney(locale, minor, forecast.currency);
  const short = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
  const run = async (work: () => Promise<unknown>, done: string) => {
    try { await work(); toast({ text: done }); await load(); } catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  const toPay = data.bills.filter((bill) => bill.status === 'to_pay');
  const tone = (value: number) => (value < 0 ? 'bad' : undefined);
  return (
    <div className="stack loose">
      <div className="grid">
        <KpiTile icon={Landmark} label={t('cash.today')} value={money(forecast.start.balanceMinor)} sub={forecast.start.estimated ? t('cash.estimated') : t('cash.bankOn', { date: forecast.start.on ? short(forecast.start.on) : '' })} />
        <KpiTile icon={Landmark} label={t('cash.in', { n: 30 })} value={money(forecast.at.d30)} tone={tone(forecast.at.d30) ?? 'brand'} />
        <KpiTile icon={Landmark} label={t('cash.in', { n: 60 })} value={money(forecast.at.d60)} tone={tone(forecast.at.d60)} />
        <KpiTile icon={Landmark} label={t('cash.in', { n: 90 })} value={money(forecast.at.d90)} tone={tone(forecast.at.d90)} />
      </div>
      {forecast.lowest.balanceMinor < 0 ? (
        <p className="notice bad" role="status">{t('cash.negative', { date: short(forecast.lowest.weekFrom), amount: money(forecast.lowest.balanceMinor) })}</p>
      ) : null}

      <Panel title={t('cash.weeks')} sub={t('cash.weeksSub')}>
        <BarChart locale={locale} label={t('cash.weeks')} categories={forecast.weeks.map((week) => short(week.from))}
          series={[{ values: forecast.weeks.map((week) => week.inMinor + week.plannedInMinor), color: 'var(--ok)' }, { values: forecast.weeks.map((week) => week.outMinor), color: 'var(--warn)' }]} />
        <Legend items={[{ label: t('cash.legendInAll'), color: 'var(--ok)' }, { label: t('cash.legendOut'), color: 'var(--warn)' }]} />
        <div className="table-wrap" style={{ marginTop: '.8rem' }}>
          <table className="cash-table">
            <thead><tr><th>{t('cash.week')}</th><th className="right">{t('cash.legendIn')}</th><th className="right">{t('cash.planned')}</th><th className="right">{t('cash.legendOut')}</th><th className="right">{t('cash.balance')}</th></tr></thead>
            <tbody>{forecast.weeks.map((week) => (
              <tr key={week.from}><td>{short(week.from)} → {short(week.to)}</td><td className="right num">{week.inMinor ? money(week.inMinor) : '—'}</td><td className="right num muted">{week.plannedInMinor ? money(week.plannedInMinor) : '—'}</td>
                <td className="right num">{money(week.outMinor)}</td><td className={`right num ${week.balanceMinor < 0 ? 'bad-text' : ''}`}><b>{money(week.balanceMinor)}</b></td></tr>
            ))}</tbody>
          </table>
        </div>
        <ul className="cash-notes small muted">
          <li>{t('cash.ruleIn')}</li>
          <li>{t('cash.rulePlanned', { days: forecast.pace.paymentTermDays })}</li>
          <li>{t('cash.ruleOut', { labour: money(forecast.pace.labourWeeklyMinor), spending: money(forecast.pace.spendingWeeklyMinor) })}</li>
          {forecast.overdueInMinor ? <li>{t('cash.overdue', { amount: money(forecast.overdueInMinor) })}</li> : null}
          {forecast.overdueBillsMinor ? <li>{t('cash.overdueBills', { amount: money(forecast.overdueBillsMinor) })}</li> : null}
          {forecast.subcontractsLeftMinor ? <li>{t('cash.subcontracts', { amount: money(forecast.subcontractsLeftMinor) })}</li> : null}
        </ul>
        {canWrite ? (editingBalance ? (
          <form className="row" style={{ flexWrap: 'wrap' }} onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const raw = String(form.get('amount') ?? '').trim();
            const negative = raw.startsWith('-');
            const amount = parseMoney(raw.replace(/^-/u, ''), forecast.currency);
            if (amount === null) return;
            void run(() => setCashBalance({ data: { amountMinor: negative ? -amount : amount, on: String(form.get('on')) } }), t('cash.balanceSaved')).then(() => setEditingBalance(false));
          }}>
            <label className="field">{t('cash.bankBalance')}<input name="amount" inputMode="decimal" required /></label>
            <label className="field">{t('cash.on')}<input name="on" type="date" defaultValue={todayIso()} max={todayIso()} required /></label>
            <button type="submit" className="btn small" style={{ alignSelf: 'flex-end' }}>{t('app.save')}</button>
            <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-end' }} onClick={() => setEditingBalance(false)}>{t('app.cancel')}</button>
          </form>
        ) : <button type="button" className="btn secondary small" onClick={() => setEditingBalance(true)}><Landmark size={15} />{forecast.start.estimated ? t('cash.giveBalance') : t('cash.updateBalance')}</button>) : null}
      </Panel>

      <Panel title={t('bills.title')} sub={toPay.length ? t('bills.sub', { amount: money(toPay.reduce((sum, bill) => sum + bill.amountMinor, 0)) }) : t('bills.none')}
        actions={canWrite && !adding ? <button type="button" className="btn small" onClick={() => setAdding(true)}><Plus size={15} />{t('bills.add')}</button> : null} flush>
        {adding ? (
          <form className="stack" style={{ padding: '1rem', borderBottom: '1px solid var(--divider)' }} onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const amount = parseMoney(String(form.get('amount') ?? ''), forecast.currency);
            if (!amount) return;
            void run(() => createSupplierBill({ data: {
              projectId: String(form.get('projectId') || '') || null, supplier: String(form.get('supplier')), label: String(form.get('label')),
              reference: String(form.get('reference') || '') || null, category: String(form.get('category')), amountMinor: amount, dueOn: String(form.get('dueOn')),
            } }), t('bills.added')).then(() => setAdding(false));
          }}>
            <div className="form-grid">
              <label className="field">{t('bills.supplier')}<input name="supplier" required maxLength={200} /></label>
              <label className="field">{t('bills.label')}<input name="label" required maxLength={200} /></label>
              <label className="field">{t('bills.amount')}<input name="amount" inputMode="decimal" required /></label>
              <label className="field">{t('bills.dueOn')}<input name="dueOn" type="date" required /></label>
              <label className="field">{t('app.project')}<select name="projectId" defaultValue=""><option value="">{t('bills.noSite')}</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>
              <label className="field">{t('bills.category')}<select name="category" defaultValue="materials">{CATEGORIES.map((category) => <option key={category} value={category}>{t(`expenses.categories.${category}`)}</option>)}</select></label>
              <label className="field">{t('bills.reference')}<input name="reference" maxLength={120} /></label>
            </div>
            <div className="row"><button type="submit" className="btn small">{t('app.save')}</button><button type="button" className="btn ghost small" onClick={() => setAdding(false)}>{t('app.cancel')}</button></div>
          </form>
        ) : null}
        {data.bills.length ? (
          <ul className="claims">{data.bills.slice(0, 40).map((bill) => (
            <li key={bill.id} className={bill.status === 'to_pay' && bill.overdueDays ? 'pending' : ''}>
              <div className="row nowrap">
                <span className="grow trunc"><b>{bill.supplier}</b> · {bill.label}{bill.projectCode ? ` · ${bill.projectCode}` : ''}</span>
                <b className="num">{money(bill.amountMinor)}</b>
              </div>
              <div className="row small muted" style={{ flexWrap: 'wrap', gap: '.2rem .8rem' }}>
                <span>{t('bills.due')} <DateText value={bill.dueOn} /></span>
                {bill.status === 'to_pay' && bill.overdueDays ? <span className="bad-text">{t('ui.lateDays', { n: bill.overdueDays })}</span> : null}
                {bill.status === 'paid' ? <span className="ok-text">{t('bills.paidOn')} <DateText value={bill.paidOn} /></span> : null}
                {bill.status === 'cancelled' ? <span>{t('bills.cancelled')}</span> : null}
                {bill.reference ? <span>{bill.reference}</span> : null}
              </div>
              {canWrite && bill.status === 'to_pay' ? (
                <div className="row">
                  <button type="button" className="btn small" onClick={() => void run(() => paySupplierBill({ data: { id: bill.id } }), bill.projectId ? t('bills.paidExpense') : t('bills.paid'))}><Check size={15} />{t('bills.pay')}</button>
                  <button type="button" className="btn ghost small" onClick={() => void run(() => cancelSupplierBill({ data: { id: bill.id } }), t('bills.cancelledDone'))}><X size={15} />{t('bills.cancel')}</button>
                </div>
              ) : null}
            </li>
          ))}</ul>
        ) : null}
      </Panel>
    </div>
  );
}
