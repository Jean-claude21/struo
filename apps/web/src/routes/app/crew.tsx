// Field crew (spec 047): the workers without an account, who was present where (ticked by the site
// lead in the day's report, corrected here), and the subcontractors paid by the job.
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { HardHat, Handshake, Users } from 'lucide-react';
import { EmptyState, PageHeader, Panel, Progress, useToast } from '@/components/kit.tsx';
import { formatMoney, parseMoney, Tabs } from '@/components/ui.tsx';
import { createSubcontract, getCrew, paySubcontract, saveWorker, setAttendance, updateSubcontract } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/crew')({
  loader: () => getCrew(),
  component: Crew,
});

type Data = Awaited<ReturnType<typeof getCrew>>;

function useRun() {
  const { errorText } = useI18n();
  const toast = useToast();
  const router = useRouter();
  return async (work: () => Promise<unknown>, done?: string) => {
    try { await work(); if (done) toast({ text: done }); await router.invalidate(); return true; }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); return false; }
  };
}

function Crew() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const [tab, setTab] = useState<'workers' | 'presence' | 'subcontracts'>('workers');
  const today = data.attendance.filter((day) => day.day === data.today);
  return (
    <div className="stack">
      <PageHeader title={t('crew.title')} text={t('crew.text')} />
      <div className="grid">
        <div className="kpi-mini"><span>{t('crew.today')}</span><b>{t('crew.onSites', { n: today.reduce((sum, day) => sum + day.workers.length, 0), sites: today.length })}</b></div>
        <div className="kpi-mini"><span>{t('crew.registered')}</span><b>{data.workers.filter((worker) => worker.active).length}</b></div>
        <div className="kpi-mini"><span>{t('crew.openSubcontracts')}</span><b>{data.subcontracts.filter((item) => item.status === 'open').length}</b></div>
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'workers', label: t('crew.tabs.workers') }, { value: 'presence', label: t('crew.tabs.presence') }, { value: 'subcontracts', label: t('crew.tabs.subcontracts') },
      ]} />
      {tab === 'workers' ? <Workers data={data} /> : null}
      {tab === 'presence' ? <Presence data={data} /> : null}
      {tab === 'subcontracts' ? <Subcontracts data={data} /> : null}
    </div>
  );
}

function Workers({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  const run = useRun();
  const money = (minor: number | null) => (minor === null ? '—' : formatMoney(locale, minor, data.currency));
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = (name: string) => String(new FormData(form).get(name) ?? '').trim();
    const rate = value('rate');
    const patch: Record<string, unknown> = { name: value('name'), trade: value('trade') || null, phone: value('phone') || null };
    if (data.canRates && rate) {
      const minor = parseMoney(rate, data.currency);
      if (minor === null) return;
      patch.dayRateMinor = minor;
    }
    if (await run(() => saveWorker({ data: { id: null, patch } }), t('crew.added'))) form.reset();
  };
  return (
    <Panel title={t('crew.tabs.workers')} sub={t('crew.workersSub')} flush>
      <form className="task-add" onSubmit={(event) => void add(event)}>
        <input name="name" required maxLength={120} placeholder={t('crew.name')} aria-label={t('crew.name')} />
        <input name="trade" maxLength={80} placeholder={t('crew.trade')} aria-label={t('crew.trade')} />
        <input name="phone" maxLength={40} placeholder={t('crew.phone')} aria-label={t('crew.phone')} inputMode="tel" />
        {data.canRates ? <input name="rate" inputMode="decimal" placeholder={t('crew.rate', { currency: data.currency })} aria-label={t('crew.rate', { currency: data.currency })} /> : null}
        <button type="submit" className="btn small">{t('crew.add')}</button>
      </form>
      {data.workers.length ? (
        <div className="table-wrap"><table>
          <thead><tr><th>{t('crew.name')}</th><th>{t('crew.trade')}</th><th>{t('crew.phone')}</th>{data.canRates ? <th className="right">{t('crew.rate', { currency: data.currency })}</th> : null}<th className="right">{t('crew.days30')}</th><th>{t('crew.lastSeen')}</th><th /></tr></thead>
          <tbody>{data.workers.map((worker) => (
            <tr key={worker.id} className={worker.active ? undefined : 'muted'}>
              <td><b>{worker.name}</b></td>
              <td>{worker.trade ?? ''}</td>
              <td>{worker.phone ? <a href={`tel:${worker.phone}`}>{worker.phone}</a> : ''}</td>
              {data.canRates ? (
                <td className="right">
                  <input key={`${worker.id}-${worker.dayRateMinor ?? ''}`} defaultValue={worker.dayRateMinor === null ? '' : money(worker.dayRateMinor).replace(/[^\d,.\s]/gu, '').trim()}
                    inputMode="decimal" aria-label={t('crew.rate', { currency: data.currency })} style={{ width: 120, textAlign: 'right' }}
                    onBlur={(event) => {
                      const text = event.currentTarget.value.trim();
                      const minor = text === '' ? null : parseMoney(text, data.currency);
                      if (text !== '' && minor === null) return;
                      if (minor !== worker.dayRateMinor) void run(() => saveWorker({ data: { id: worker.id, patch: { dayRateMinor: minor } } }));
                    }} />
                </td>
              ) : null}
              <td className="right num">{worker.daysLast30}</td>
              <td className="small">{worker.lastSeen ? `${worker.lastSeen.slice(8, 10)}/${worker.lastSeen.slice(5, 7)} · ${worker.lastSiteCode ?? ''}` : '—'}</td>
              <td className="right"><button type="button" className="btn ghost small" onClick={() => void run(() => saveWorker({ data: { id: worker.id, patch: { active: !worker.active } } }))}>{worker.active ? t('crew.deactivate') : t('crew.activate')}</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <div style={{ padding: '1rem' }}><EmptyState icon={Users} title={t('crew.noWorkers')} text={t('crew.noWorkersHint')} /></div>}
    </Panel>
  );
}

function Presence({ data }: { data: Data }) {
  const { t } = useI18n();
  const run = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState({ projectId: data.projects[0]?.id ?? '', day: data.today });
  const active = data.workers.filter((worker) => worker.active);
  const startEdit = (key: string, ids: string[]) => { setEditing(key); setPicked(new Set(ids)); };
  const save = async (projectId: string, day: string) => { if (await run(() => setAttendance({ data: { projectId, day, workerIds: [...picked] } }), t('crew.saved'))) setEditing(null); };
  const chips = (
    <div className="chips">
      {active.map((worker) => (
        <button key={worker.id} type="button" className={`chip ${picked.has(worker.id) ? 'selected' : ''}`} aria-pressed={picked.has(worker.id)}
          onClick={() => setPicked((current) => { const next = new Set(current); if (next.has(worker.id)) next.delete(worker.id); else next.add(worker.id); return next; })}>{worker.name}</button>
      ))}
    </div>
  );
  return (
    <Panel title={t('crew.tabs.presence')} sub={t('crew.presenceSub')}>
      <div className="stack">
        <div className="row" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
          <select value={adding.projectId} onChange={(event) => setAdding({ ...adding, projectId: event.target.value })} aria-label={t('tasks.site')} style={{ width: 'auto' }}>
            {data.projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
          </select>
          <input type="date" value={adding.day} max={data.today} onChange={(event) => setAdding({ ...adding, day: event.target.value })} aria-label={t('crew.day')} style={{ width: 'auto' }} />
          <button type="button" className="btn secondary small" disabled={!adding.projectId || !active.length}
            onClick={() => startEdit(`${adding.projectId}|${adding.day}`, data.attendance.find((day) => day.projectId === adding.projectId && day.day === adding.day)?.workers.map((worker) => worker.id) ?? [])}>{t('crew.tick')}</button>
        </div>
        {editing && !data.attendance.some((day) => `${day.projectId}|${day.day}` === editing) ? (
          <div className="card stack">{chips}<div className="row"><button type="button" className="btn small" onClick={() => void save(editing.split('|')[0]!, editing.split('|')[1]!)}>{t('crew.savePresence', { n: picked.size })}</button><button type="button" className="btn ghost small" onClick={() => setEditing(null)}>{t('app.cancel')}</button></div></div>
        ) : null}
        {data.attendance.length ? data.attendance.map((day) => {
          const key = `${day.projectId}|${day.day}`;
          return (
            <div key={key} className="presence-day">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span><b>{day.day.slice(8, 10)}/{day.day.slice(5, 7)}</b> · {day.projectCode} · {day.projectName}</span>
                <span className="row tight"><span className="badge">{t('crew.people', { n: day.workers.length })}</span>
                  {editing === key ? null : <button type="button" className="btn ghost small" onClick={() => startEdit(key, day.workers.map((worker) => worker.id))}>{t('crew.correct')}</button>}</span>
              </div>
              {editing === key ? (
                <div className="stack" style={{ marginTop: '.5rem' }}>{chips}<div className="row"><button type="button" className="btn small" onClick={() => void save(day.projectId, day.day)}>{t('crew.savePresence', { n: picked.size })}</button><button type="button" className="btn ghost small" onClick={() => setEditing(null)}>{t('app.cancel')}</button></div></div>
              ) : <p className="small muted" style={{ margin: '.3rem 0 0' }}>{day.workers.map((worker) => worker.name).join(', ')}</p>}
            </div>
          );
        }) : <EmptyState icon={HardHat} title={t('crew.noPresence')} text={t('crew.noPresenceHint')} />}
      </div>
    </Panel>
  );
}

function Subcontracts({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  const run = useRun();
  const [paying, setPaying] = useState<string | null>(null);
  const money = (minor: number, currency = data.currency) => formatMoney(locale, minor, currency);
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = (name: string) => String(new FormData(form).get(name) ?? '').trim();
    const agreed = parseMoney(value('agreed'), data.currency);
    if (!agreed) return;
    if (await run(() => createSubcontract({ data: { projectId: value('projectId'), name: value('name'), trade: value('trade') || null, phone: value('phone') || null, agreedMinor: agreed } }), t('crew.added'))) form.reset();
  };
  return (
    <Panel title={t('crew.tabs.subcontracts')} sub={t('crew.subcontractsSub')} flush>
      <form className="task-add" onSubmit={(event) => void add(event)}>
        <input name="name" required maxLength={160} placeholder={t('crew.subName')} aria-label={t('crew.subName')} />
        <select name="projectId" required defaultValue="" aria-label={t('tasks.site')}>
          <option value="" disabled>{t('tasks.site')}</option>
          {data.projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
        </select>
        <input name="trade" maxLength={80} placeholder={t('crew.trade')} aria-label={t('crew.trade')} />
        <input name="phone" maxLength={40} placeholder={t('crew.phone')} aria-label={t('crew.phone')} inputMode="tel" />
        <input name="agreed" required inputMode="decimal" placeholder={t('crew.agreedShort')} aria-label={t('crew.agreed', { currency: data.currency })} />
        <button type="submit" className="btn small">{t('crew.add')}</button>
      </form>
      {data.subcontracts.length ? (
        <div className="table-wrap"><table>
          <thead><tr><th>{t('crew.subName')}</th><th>{t('tasks.site')}</th><th className="right">{t('crew.agreedShort')}</th><th style={{ minWidth: 160 }}>{t('crew.progress')}</th><th className="right">{t('crew.paid')}</th><th className="right">{t('crew.due')}</th><th /></tr></thead>
          <tbody>{data.subcontracts.map((item) => (
            <tr key={item.id} className={item.status === 'closed' ? 'muted' : undefined}>
              <td><b>{item.name}</b>{item.trade ? <div className="small muted">{item.trade}</div> : null}</td>
              <td className="small">{item.projectCode}</td>
              <td className="right num">{money(item.agreedMinor, item.currencyCode)}</td>
              <td>
                <div className="row tight nowrap">
                  <Progress value={item.progressPct} label={false} />
                  <input type="number" min={0} max={100} step={5} defaultValue={item.progressPct} key={`${item.id}-${item.progressPct}`} aria-label={t('crew.progress')} style={{ width: 70 }}
                    onBlur={(event) => { const value = Number(event.currentTarget.value); if (value !== item.progressPct && value >= 0 && value <= 100) void run(() => updateSubcontract({ data: { id: item.id, patch: { progressPct: value } } })); }} />
                </div>
              </td>
              <td className="right num">{money(item.paidMinor, item.currencyCode)}</td>
              <td className={`right num ${item.dueMinor > 0 ? 'bad-text' : ''}`}>{money(item.dueMinor, item.currencyCode)}</td>
              <td className="right">
                {data.canPay && item.status === 'open' ? (paying === item.id ? (
                  <form className="row tight nowrap" onSubmit={(event) => {
                    event.preventDefault();
                    const minor = parseMoney(String(new FormData(event.currentTarget).get('amount') ?? ''), item.currencyCode);
                    if (minor) void run(() => paySubcontract({ data: { id: item.id, amountMinor: minor } }), t('crew.paidDone')).then((ok) => { if (ok) setPaying(null); });
                  }}>
                    <input name="amount" inputMode="decimal" autoFocus required aria-label={t('crew.amount')} style={{ width: 120 }} />
                    <button type="submit" className="btn small">{t('crew.pay')}</button>
                  </form>
                ) : <button type="button" className="btn ghost small" onClick={() => setPaying(item.id)}>{t('crew.pay')}</button>) : null}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <div style={{ padding: '1rem' }}><EmptyState icon={Handshake} title={t('crew.noSubcontracts')} text={t('crew.noSubcontractsHint')} /></div>}
    </Panel>
  );
}
