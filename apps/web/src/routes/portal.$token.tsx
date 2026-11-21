// The client's space (spec 022): opened from a link, confirmed once by an e-mail code on this device,
// then followed like a parcel — photos, steps, reports in plain words, milestones signed with a
// finger, payments and messages. Phone first, one main action per screen.
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, Check, CircleCheck, FileText, FolderOpen, HardHat, Home, KeyRound, Lock, Mail, MessageCircle, Send, Wallet } from 'lucide-react';
import { LanguageSwitch } from '@/components/PublicHeader.tsx';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad.tsx';
import { Modal, useToast } from '@/components/kit.tsx';
import { decimalsOf, formatDate, formatMoney, parseMoney } from '@/components/ui.tsx';
import { getPortal, portalDecideChange, portalMessage, portalRequestCode, portalSetEmail, portalSubscribePush, portalVerifyCode } from '@/features/portal/server.ts';
import { useI18n } from '@/i18n/index.tsx';
import { usePhotoViewer } from '@/components/PhotoViewer.tsx';

export const Route = createFileRoute('/portal/$token')({
  validateSearch: (search: Record<string, unknown>): { ask?: string } => (typeof search.ask === 'string' ? { ask: search.ask.slice(0, 300) } : {}),
  loader: async ({ params }) => {
    try {
      return { data: await getPortal({ data: { token: params.token } }) };
    } catch {
      return { data: null };
    }
  },
  head: ({ params }) => ({
    meta: [{ name: 'robots', content: 'noindex' }, { name: 'referrer', content: 'no-referrer' }],
    // Spec 051: installable like an app, named after the site.
    links: [{ rel: 'manifest', href: `/api/portal/${params.token}/manifest` }],
  }),
  component: Portal,
});

type Loaded = NonNullable<Awaited<ReturnType<typeof getPortal>>>;
type Space = Extract<Loaded, { gate: false }>;
type Tab = 'home' | 'reports' | 'invoices' | 'messages';

function Portal() {
  const { t } = useI18n();
  const { data } = Route.useLoaderData();
  if (!data) {
    return (
      <div className="client-app" style={{ paddingTop: '3rem' }}>
        <div className="notice bad"><Lock size={18} />{t('portal.invalid')}</div>
      </div>
    );
  }
  return data.gate ? <Gate data={data} /> : <SpaceView data={data} />;
}

// ---------------------------------------------------------------- C3: confirm the device once

function Gate({ data }: { data: Extract<Loaded, { gate: true }> }) {
  const { t, errorText } = useI18n();
  const { token } = Route.useParams();
  const router = useRouter();
  const [sent, setSent] = useState<{ maskedEmail: string; testCode: string | null } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const send = async () => {
    setBusy(true); setError(null);
    try { setSent(await portalRequestCode({ data: { token } })); window.setTimeout(() => input.current?.focus(), 50); }
    catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setError(null);
    try { await portalVerifyCode({ data: { token, code } }); await router.invalidate(); }
    catch (caught) { setError(errorText(caught)); setCode(''); }
    finally { setBusy(false); }
  };

  return (
    <div className="client-app" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '1rem' }}>
      <div className="row nowrap"><b style={{ fontSize: '1.05rem' }} className="grow">{data.company.name}</b><LanguageSwitch /></div>
      <div className="cover" style={{ height: 170, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--brand-soft), var(--surface-2))' }}>
        <HardHat size={64} style={{ color: 'var(--brand)' }} />
      </div>
      <div className="stack" style={{ gap: '.4rem' }}>
        <h1 style={{ margin: 0 }}>{data.contactName ? t('clientPortal.gateTitle', { name: data.contactName }) : t('clientPortal.gateHello')}</h1>
        <p className="muted" style={{ margin: 0 }}>{data.project.name}{data.project.location ? ` · ${data.project.location}` : ''}</p>
      </div>
      {!data.maskedEmail ? (
        <div className="notice"><Mail size={18} />{t('clientPortal.gateNoEmail', { company: data.company.name })}</div>
      ) : !sent ? (
        <>
          <p style={{ margin: 0 }}>{t('clientPortal.gateText', { email: data.maskedEmail })}</p>
          <button type="button" className="btn block" disabled={busy} onClick={() => void send()}><Mail size={18} />{t('clientPortal.sendCode')}</button>
        </>
      ) : (
        <form className="stack" onSubmit={(event) => { event.preventDefault(); if (code.length === 6) void verify(); }}>
          <div className="notice ok"><CircleCheck size={18} />{t('clientPortal.codeSent', { email: sent.maskedEmail })}</div>
          {sent.testCode ? <div className="notice info">{t('clientPortal.testCode', { code: sent.testCode })}</div> : null}
          <label className="field">{t('clientPortal.codeLabel')}
            <input ref={input} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))} inputMode="numeric"
              autoComplete="one-time-code" maxLength={6} style={{ fontSize: '1.6rem', letterSpacing: '.5em', textAlign: 'center', minHeight: 60 }} />
          </label>
          <p className="small muted" style={{ margin: 0 }}><Check size={14} /> {t('clientPortal.trusted')}</p>
          <button type="submit" className="btn block" disabled={busy || code.length !== 6}><KeyRound size={18} />{t('clientPortal.access')}</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void send()}>{t('clientPortal.resend')}</button>
        </form>
      )}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <p className="faint xsmall" style={{ textAlign: 'center', marginTop: 'auto' }}>{t('portal.poweredBy')}</p>
    </div>
  );
}

// ---------------------------------------------------------------- C4–C7: the space (spec 051)
// Four questions, four tabs: where is my site (Home), what was done (Reports), where is the money
// (Invoices), and a word with the team (Messages). Home answers « what is new » and « what waits for me ».

function SpaceView({ data }: { data: Space }) {
  const { t, locale } = useI18n();
  const search = Route.useSearch();
  const router = useRouter();
  const toast = useToast();
  const { view, show } = data;
  const hasInvoices = show.finance;
  const hasDocuments = show.documents;
  const [tab, setTab] = useState<Tab>(() => (search.ask && show.messages ? 'messages' : 'home'));
  const [ask, setAsk] = useState(search.ask ?? '');
  const [signing, setSigning] = useState<Space['view']['milestones'][number] | null>(null);
  const money = (minor: number) => formatMoney(locale, minor, view.project.currency);
  const date = (value: string | null) => formatDate(locale, value);
  const brand = view.company.brandColor ?? undefined;
  const due = view.invoices.filter((invoice) => invoice.balance > 0);
  const askAbout = (text: string) => { setAsk(text); setTab('messages'); };
  const tabs: { value: Tab; label: string; icon: typeof Home; badge?: number; hidden?: boolean }[] = [
    { value: 'home', label: t('clientApp.tabHome'), icon: Home },
    { value: 'reports', label: t('clientApp.tabReports'), icon: FileText },
    { value: 'invoices', label: hasInvoices ? t('clientApp.tabInvoices') : t('clientPortal.tabDocuments'), icon: hasInvoices ? Wallet : FolderOpen, badge: hasInvoices ? due.length : 0, hidden: !hasInvoices && !hasDocuments },
    { value: 'messages', label: t('clientPortal.tabMessages'), icon: MessageCircle, hidden: !show.messages },
  ];
  return (
    <div className="client-app" style={brand ? { ['--brand' as string]: brand } : undefined}>
      <header className="row nowrap" style={{ padding: '1rem 0 .5rem' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: '1.35rem' }} className="trunc">{view.project.name}</h1>
          <span className="muted small">{t('clientPortal.by', { company: view.company.name })}</span>
        </div>
        <LanguageSwitch />
      </header>

      {tab === 'home' ? <HomeTab data={data} money={money} date={date} onTab={setTab} onSign={setSigning} /> : null}
      {tab === 'reports' ? <ReportsTab data={data} date={date} onAsk={show.messages ? askAbout : null} /> : null}
      {tab === 'invoices' ? <InvoicesTab data={data} money={money} date={date} onDone={() => router.invalidate()} /> : null}
      {tab === 'messages' ? <Messages view={view} prefill={ask} onSent={async () => { setAsk(''); await router.invalidate(); }} /> : null}

      <nav className="client-tabs" aria-label={view.project.name}>
        {tabs.filter((item) => !item.hidden).map((item) => (
          <button key={item.value} type="button" className={tab === item.value ? 'on' : ''} onClick={() => setTab(item.value)} aria-current={tab === item.value ? 'page' : undefined}>
            <item.icon size={21} />{item.label}{item.badge ? <span className="b-dot">{item.badge}</span> : null}
          </button>
        ))}
      </nav>

      {signing ? <SignMilestone milestone={signing} company={view.company.name} defaultName={data.contactName ?? view.project.client ?? ''}
        onClose={() => setSigning(null)} onDone={async () => { setSigning(null); toast({ text: t('clientPortal.signedOk') }); await router.invalidate(); }} /> : null}
    </div>
  );
}

function HomeTab({ data, money, date, onTab, onSign }: {
  data: Space; money: (minor: number) => string; date: (value: string | null) => string; onTab: (tab: Tab) => void; onSign: (milestone: Space['view']['milestones'][number]) => void;
}) {
  const { t, locale } = useI18n();
  const { token } = Route.useParams();
  const router = useRouter();
  const openViewer = usePhotoViewer();
  const { view, news, show } = data;
  const photoUrl = (id: string) => `/api/portal/${token}/file/${id}`;
  const toSign = view.milestones.filter((milestone) => milestone.clientValidation && !milestone.validatedAt && milestone.actualOn);
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const pendingClaims = new Set(data.claims.filter((claim) => claim.status === 'pending').map((claim) => claim.invoiceId));
  const dueNow = view.invoices.filter((invoice) => invoice.balance > 0 && invoice.dueOn <= soon && !pendingClaims.has(invoice.id));
  const waitingChanges = data.changeOrders.filter((order) => order.status === 'sent');
  const next = view.milestones.filter((milestone) => !milestone.actualOn).sort((a, b) => a.plannedOn.localeCompare(b.plannedOn))[0];
  const last = data.clientReports[0];
  const newItems = news ? ([
    ['reports', news.reports, 'reports'], ['photos', news.photos, 'reports'], ['messages', news.messages, 'messages'],
    ['changes', news.changes, 'home'], ['invoices', news.invoices, 'invoices'], ['documents', news.documents, 'invoices'],
  ] as const).filter(([, count]) => count > 0) : [];
  const todo = waitingChanges.length + toSign.length + dueNow.length;
  return (
    <div className="stack loose">
      {data.since ? (
        newItems.length ? (
          <section className="card stack ca-news">
            <h2>{t('clientApp.newSince', { date: date(data.since.slice(0, 10)) })}</h2>
            <div className="chips">{newItems.map(([key, count, target]) => (
              <button key={key} type="button" className="chip" onClick={() => onTab(target)}>{t(`clientApp.news.${key}`, { n: count })}</button>
            ))}</div>
          </section>
        ) : null
      ) : <section className="card stack ca-news"><h2>{t('clientApp.welcome', { company: view.company.name })}</h2><p className="small muted" style={{ margin: 0 }}>{t('clientApp.welcomeText')}</p></section>}

      <section className="stack" style={{ gap: '.6rem' }}>
        <h2 className="ca-h">{t('clientApp.todo')}{todo ? <span className="b-dot inline">{todo}</span> : null}</h2>
        {waitingChanges.length ? <ChangeOrders orders={waitingChanges} token={token} money={money} onDone={() => router.invalidate()} /> : null}
        {toSign.map((milestone) => (
          <section key={milestone.id} className="card stack ca-todo">
            <b>{t('clientPortal.validateMilestone', { name: milestone.name })}</b>
            <button type="button" className="btn block" onClick={() => onSign(milestone)}>{t('clientPortal.seeAndValidate')}</button>
          </section>
        ))}
        {dueNow.map((invoice) => (
          <section key={invoice.id} className="card stack ca-todo">
            <div className="row nowrap"><b className="grow">{t('clientApp.invoiceDue', { number: invoice.number })}</b><b>{money(invoice.balance)}</b></div>
            <span className="small muted">{t('clientPortal.dueBefore', { date: date(invoice.dueOn) })}</span>
            <button type="button" className="btn secondary block" onClick={() => onTab('invoices')}>{t('clientApp.seeInvoice')}</button>
          </section>
        ))}
        {!todo ? <p className="notice ok"><CircleCheck size={18} />{t('clientApp.nothingTodo')}</p> : null}
      </section>

      <section className="card stack">
        <div className="row nowrap" style={{ alignItems: 'baseline' }}>
          <span style={{ fontSize: '2.6rem', fontWeight: 800, color: 'var(--brand)' }}>{view.project.progress} %</span>
          <span className="sp" />
          {view.project.endDate ? <span className="muted small">{t('clientPortal.endPlanned', { date: date(view.project.endDate) })}</span> : null}
        </div>
        {next ? <p className="small" style={{ margin: 0 }}>{t('clientApp.nextStep', { name: next.name, date: date(next.plannedOn) })}</p> : null}
        <Phases view={view} date={date} />
      </section>

      {last ? (
        <Link to="/portal/$token/report/$id" params={{ token, id: last.id }} className="card stack ca-last">
          <span className="small muted">{t('clientApp.lastReport', { date: date(last.to) })}</span>
          {last.summary ? <span className="ca-quote">« {last.summary} »</span> : null}
          <span className="row" style={{ justifyContent: 'flex-end', color: 'var(--brand-dark)' }}>{t('clientApp.read')}<ArrowRight size={16} /></span>
        </Link>
      ) : null}

      {show.photos && view.photos.length ? (
        <div className="stories" aria-label={t('portal.photos')}>
          {view.photos.slice(0, 12).map((photo, index) => (
            <button key={photo.id} type="button" className={`story ${index > 2 ? 'seen' : ''}`} onClick={() => openViewer(view.photos.map((item) => ({ url: photoUrl(item.id), title: item.phase ?? item.note ?? null, detail: date(item.takenAt.slice(0, 10)) })), index)}>
              <span className="ring-img"><img src={photoUrl(photo.id)} alt="" loading="lazy" /></span>
              {new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }).format(new Date(photo.takenAt))}
            </button>
          ))}
        </div>
      ) : null}

      <InstallCard pushKey={data.pushKey} returning={Boolean(data.since)} />
      <EmailChoice optOut={data.emailOptOut} />
    </div>
  );
}

function Phases({ view, date }: { view: Space['view']; date: (value: string | null) => string }) {
  const { t } = useI18n();
  const current = view.phases.findIndex((phase) => phase.progress < 100);
  return (
    <div className="steps-v">
      {view.phases.map((phase, index) => {
        const state = phase.progress >= 100 ? 'done' : index === current || phase.progress > 0 ? 'current' : 'todo';
        return (
          <div key={phase.name} className={`step-v ${state}`}>
            <span className="sv-dot">{state === 'done' ? <Check size={15} /> : state === 'current' ? <HardHat size={14} /> : null}</span>
            <div className="grow"><div className="sv-t">{phase.name}</div>
              {state === 'current' ? <div className="small" style={{ color: 'var(--brand-dark)' }}>{t('clientPortal.current')} · {phase.progress} %</div> : null}</div>
          </div>
        );
      })}
      <div className={`step-v ${view.project.status === 'done' ? 'done' : 'todo'}`}>
        <span className="sv-dot"><KeyRound size={13} /></span>
        <div className="grow"><div className="sv-t">{t('clientPortal.keys')}</div>{view.project.endDate ? <div className="small faint">{date(view.project.endDate)}</div> : null}</div>
      </div>
    </div>
  );
}

function ReportsTab({ data, date, onAsk }: { data: Space; date: (value: string | null) => string; onAsk: ((text: string) => void) | null }) {
  const { t, locale } = useI18n();
  const { token } = Route.useParams();
  const openViewer = usePhotoViewer();
  const [report, setReport] = useState<Space['reports'][number] | null>(null);
  const photoUrl = (id: string) => `/api/portal/${token}/file/${id}`;
  const photoTime = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium' }).format(new Date(value));
  const byPhase = new Map<string, Space['view']['photos']>();
  for (const photo of data.view.photos) {
    const key = photo.phase ?? t('clientApp.otherPhotos');
    byPhase.set(key, [...(byPhase.get(key) ?? []), photo]);
  }
  return (
    <div className="stack loose">
      <section className="stack" style={{ gap: '.6rem' }}>
        <h2 className="ca-h">{t('clientReport.portalTitle')}</h2>
        {data.clientReports.length ? data.clientReports.map((item) => (
          <Link key={item.id} to="/portal/$token/report/$id" params={{ token, id: item.id }} className="card stack ca-last">
            <b>{date(item.from)} → {date(item.to)}</b>
            {item.summary ? <span className="small muted">{item.summary}</span> : null}
            <span className="row" style={{ justifyContent: 'flex-end', color: 'var(--brand-dark)' }}>{t('clientApp.read')}<ArrowRight size={16} /></span>
          </Link>
        )) : <p className="muted">{t('clientApp.noReports')}</p>}
      </section>

      {data.show.photos && byPhase.size ? (
        <section className="stack" style={{ gap: '.6rem' }}>
          <h2 className="ca-h">{t('clientApp.photosByStage')}</h2>
          {[...byPhase.entries()].map(([phase, photos]) => (
            <div key={phase} className="stack" style={{ gap: '.35rem' }}>
              <b className="small">{phase} · {photos.length}</b>
              <div className="ca-grid">{photos.slice(0, 9).map((photo, index) => (
                <button key={photo.id} type="button" className="pv-open" onClick={() => openViewer(photos.map((item) => ({ url: photoUrl(item.id), title: phase, detail: photoTime(item.takenAt) })), index)}>
                  <img src={photoUrl(photo.id)} alt={phase} loading="lazy" />
                </button>
              ))}</div>
              {photos.length > 9 ? <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => openViewer(photos.map((item) => ({ url: photoUrl(item.id), title: phase, detail: photoTime(item.takenAt) })), 9)}>{t('clientApp.seeAll', { n: photos.length })}</button> : null}
            </div>
          ))}
        </section>
      ) : null}

      {data.showFieldReports && data.reports.length ? (
        <section className="stack">
          <h2 className="ca-h">{t('field.reports')}</h2>
          {data.reports.map((item) => (
            <button key={item.id} type="button" className="card stack" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', gap: '.5rem' }} onClick={() => setReport(item)}>
              {item.photos[0] ? <img src={photoUrl(item.photos[0])} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8 }} loading="lazy" /> : null}
              <b>{t('clientPortal.reportTitle', { date: date(item.takenAt) })}</b>
              <span className="small" style={{ color: 'var(--ink-2)' }}>{item.note}</span>
            </button>
          ))}
        </section>
      ) : null}

      <Modal open={Boolean(report)} onClose={() => setReport(null)} title={report ? t('clientPortal.reportTitle', { date: date(report.takenAt) }) : ''}>
        {report ? (
          <div className="stack">
            {report.photos.map((id, index) => <button key={id} type="button" className="pv-open" onClick={() => openViewer(report.photos.map((item) => ({ url: photoUrl(item), detail: photoTime(report.takenAt) })), index)}><img src={photoUrl(id)} alt="" style={{ width: '100%', borderRadius: 8 }} loading="lazy" /></button>)}
            <p style={{ margin: 0, fontSize: '1.02rem' }}>{report.note}</p>
            <span className="muted small">{t('clientPortal.reportBy', { name: report.author })}</span>
            <div className="pair">
              {onAsk ? <button type="button" className="btn secondary" onClick={() => { const text = t('clientApp.askAbout', { what: t('clientPortal.reportTitle', { date: date(report.takenAt) }) }); setReport(null); onAsk(text); }}>{t('clientPortal.ask')}</button> : <span />}
              <button type="button" className="btn" onClick={() => setReport(null)}>{t('clientPortal.thanks')}</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function InvoicesTab({ data, money, date, onDone }: { data: Space; money: (minor: number) => string; date: (value: string | null) => string; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const { token } = Route.useParams();
  const [claiming, setClaiming] = useState<Space['view']['invoices'][number] | null>(null);
  const { view, money: sums, howToPay } = data;
  const due = view.invoices.filter((invoice) => invoice.balance > 0);
  const paid = view.invoices.filter((invoice) => invoice.balance <= 0);
  const claimOf = (invoiceId: string) => data.claims.find((claim) => claim.invoiceId === invoiceId);
  const fileUrl = (id: string) => `/api/portal/${token}/file/${id}`;
  return (
    <div className="stack loose">
      {data.show.finance ? (
        <>
          {sums ? (
            <section className="card stack ca-money">
              <h2>{t('clientApp.moneyTitle')}</h2>
              <dl>
                <div><dt>{t('clientApp.contract')}</dt><dd>{money(sums.contractMinor)}</dd></div>
                {sums.acceptedChangesMinor ? <div><dt>{t('clientApp.changes')}</dt><dd>+ {money(sums.acceptedChangesMinor)}</dd></div> : null}
                <div className="total"><dt>{t('clientApp.total')}</dt><dd>{money(sums.totalMinor)}</dd></div>
                <div><dt>{t('clientApp.invoiced')}</dt><dd>{money(sums.invoicedMinor)}</dd></div>
                <div><dt>{t('clientApp.paid')}</dt><dd>{money(sums.paidMinor)}</dd></div>
                <div className="total"><dt>{t('clientApp.due')}</dt><dd>{money(sums.dueMinor)}</dd></div>
                <div><dt>{t('clientApp.toInvoice')}</dt><dd>{money(sums.toInvoiceMinor)}</dd></div>
              </dl>
            </section>
          ) : null}

          {data.changeOrders.some((order) => order.status !== 'sent') ? <ChangeOrders orders={data.changeOrders.filter((order) => order.status !== 'sent')} token={token} money={money} onDone={onDone} history /> : null}
          <section className="stack" style={{ gap: '.6rem' }}>
            <h2 className="ca-h">{t('clientApp.toPay')}</h2>
            {due.length ? due.map((invoice) => {
              const claim = claimOf(invoice.id);
              return (
                <section key={invoice.id} className="card stack">
                  <span className="muted small">{invoice.number} · {t(`finance.kinds.${invoice.kind as 'progress'}`)}</span>
                  <span style={{ fontSize: '1.7rem', fontWeight: 800 }}>{money(invoice.balance)}</span>
                  <span className="small">{t('clientPortal.dueBefore', { date: date(invoice.dueOn) })}</span>
                  {claim?.status === 'pending' ? <span className="notice info small">{t('clientApp.claimPending', { date: date(claim.paidOn) })}</span>
                    : claim?.status === 'rejected' ? <span className="notice warn small">{t('clientApp.claimRejected', { reason: claim.rejectReason ?? '' })}</span> : null}
                  {howToPay?.canDeclare && claim?.status !== 'pending' ? <button type="button" className="btn secondary block" onClick={() => setClaiming(invoice)}><CircleCheck size={18} />{t('clientApp.iPaid')}</button> : null}
                </section>
              );
            }) : <div className="notice ok"><CircleCheck size={18} />{t('clientPortal.nothingToPay')}</div>}
          </section>

          <section className="card stack">
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{t('clientApp.howToPay')}</h2>
            {howToPay?.bankDetails || howToPay?.mobileMoney || howToPay?.paymentTerms ? (
              <div className="stack" style={{ gap: '.5rem' }}>
                {howToPay.bankDetails ? <div><b className="small">{t('clientApp.bank')}</b><p className="ca-pre">{howToPay.bankDetails}</p></div> : null}
                {howToPay.mobileMoney ? <div><b className="small">{t('clientApp.mobile')}</b><p className="ca-pre">{howToPay.mobileMoney}</p></div> : null}
                {howToPay.paymentTerms ? <div><b className="small">{t('clientApp.terms')}</b><p className="ca-pre">{howToPay.paymentTerms}</p></div> : null}
              </div>
            ) : <p className="small muted" style={{ margin: 0 }}>{t('clientApp.howToPayNone', { company: view.company.name })}</p>}
            <p className="faint xsmall" style={{ margin: 0 }}>{t('clientApp.payDirect', { company: view.company.name })}</p>
          </section>

          {paid.length ? (
            <section className="stack" style={{ gap: '.4rem' }}>
              <h3 style={{ margin: 0 }}>{t('clientPortal.history')}</h3>
              {paid.map((invoice) => (
                <div key={invoice.id} className="row nowrap small" style={{ borderBottom: '1px solid var(--divider)', padding: '.5rem 0' }}>
                  <span className="grow trunc" style={{ minWidth: 0 }}>{invoice.number} · {t(`finance.kinds.${invoice.kind as 'progress'}`)}</span><b className="num nowrap">{money(invoice.net)}</b><CircleCheck size={16} style={{ color: 'var(--ok)' }} />
                </div>
              ))}
            </section>
          ) : null}
        </>
      ) : null}

      {data.show.documents ? (
        <section className="stack" style={{ gap: '.5rem' }}>
          <h2 className="ca-h">{t('portal.documents')}</h2>
          {view.documents.length ? view.documents.map((document) => (
            <a key={document.id} className="site-card" href={document.hasFile ? fileUrl(document.id) : undefined} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <span className="ftype" style={{ ['--c' as string]: '#8e2a22' }}><FileText size={16} /></span>
              <span className="grow">{document.title}</span>
            </a>
          )) : <p className="muted">{t('portal.noDocuments')}</p>}
        </section>
      ) : null}

      {claiming ? <ClaimDialog invoice={claiming} money={money} onClose={() => setClaiming(null)} onDone={async () => { setClaiming(null); await onDone(); }} /> : null}
    </div>
  );
}

function ClaimDialog({ invoice, money, onClose, onDone }: { invoice: Space['view']['invoices'][number]; money: (minor: number) => string; onClose: () => void; onDone: () => Promise<void> }) {
  const { t, errorText } = useI18n();
  const { token } = Route.useParams();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const submit = async (form: HTMLFormElement) => {
    const body = new FormData(form);
    const amount = parseMoney(String(body.get('amount') ?? ''), invoice.currency);
    if (!amount) { setError(t('clientApp.amountRequired')); return; }
    body.set('amountMinor', String(amount)); body.delete('amount'); body.set('invoiceId', invoice.id);
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/portal/${token}/claim`, { method: 'POST', body });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? 'generic');
      toast({ text: t('clientApp.claimSent') });
      await onDone();
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={t('clientApp.claimTitle', { number: invoice.number })}
      footer={(<><button type="button" className="btn secondary" onClick={onClose}>{t('app.cancel')}</button>
        <button type="submit" form="claim-form" className="btn" disabled={busy}>{busy ? '…' : t('clientApp.claimSend')}</button></>)}>
      <form id="claim-form" className="stack" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
        <p className="small muted" style={{ margin: 0 }}>{t('clientApp.claimHint')}</p>
        <label className="field">{t('clientApp.claimAmount')}<input name="amount" inputMode="decimal" defaultValue={String(invoice.balance / 10 ** decimalsOf(invoice.currency))} required aria-describedby="claim-due" /><span id="claim-due" className="small faint">{t('clientApp.claimDue', { amount: money(invoice.balance) })}</span></label>
        <label className="field">{t('clientApp.claimDate')}<input name="paidOn" type="date" defaultValue={today} max={today} required /></label>
        <label className="field">{t('clientApp.claimMethod')}
          <select name="method" defaultValue="transfer">{(['transfer', 'mobile_money', 'cheque', 'cash', 'card', 'other'] as const).map((method) => <option key={method} value={method}>{t(`finance.methods.${method}`)}</option>)}</select>
        </label>
        <label className="field">{t('clientApp.claimReference')}<input name="reference" maxLength={120} /></label>
        <label className="field">{t('clientApp.claimProof')}<input name="proof" type="file" accept="image/*,application/pdf" capture="environment" /></label>
        <label className="field">{t('clientApp.claimNote')}<textarea name="note" rows={2} maxLength={1000} /></label>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </form>
    </Modal>
  );
}

/** Installs the space on the phone, then turns notifications on (from the second visit). */
function InstallCard({ pushKey, returning }: { pushKey: string | null; returning: boolean }) {
  const { t } = useI18n();
  const { token } = Route.useParams();
  const toast = useToast();
  const [state, setState] = useState<'hidden' | 'ask' | 'ios' | 'done'>('hidden');
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  useEffect(() => {
    if (!returning) return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/iu.test(navigator.userAgent);
    const canPush = Boolean(pushKey) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    let dismissed = false;
    try { dismissed = localStorage.getItem(`struo-install-${token}`) === 'no'; } catch { /* private mode */ }
    if (dismissed) return;
    if (canPush && Notification.permission === 'granted') { setState('done'); return; }
    if (ios && !standalone) { setState('ios'); return; }
    if (canPush && Notification.permission === 'default') setState('ask');
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as Event & { prompt: () => Promise<void> }); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [pushKey, returning, token]);
  const enable = async () => {
    try {
      if (prompt) await prompt.prompt().catch(() => undefined);
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState('hidden'); return; }
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(pushKey!) });
      await portalSubscribePush({ data: { token, subscription: subscription.toJSON() } });
      setState('done');
      toast({ text: t('clientApp.pushOn') });
    } catch { toast({ text: t('clientApp.pushFailed'), kind: 'err' }); }
  };
  const dismiss = () => { try { localStorage.setItem(`struo-install-${token}`, 'no'); } catch { /* private mode */ } setState('hidden'); };
  if (state === 'hidden' || state === 'done') return null;
  return (
    <section className="card stack ca-install">
      <b>{t('clientApp.installTitle')}</b>
      <p className="small" style={{ margin: 0 }}>{state === 'ios' ? t('clientApp.installIos') : t('clientApp.installText')}</p>
      <div className="pair">
        <button type="button" className="btn ghost" onClick={dismiss}>{t('clientApp.later')}</button>
        {state === 'ask' ? <button type="button" className="btn" onClick={() => void enable()}><Bell size={16} />{t('clientApp.enable')}</button> : <span />}
      </div>
    </section>
  );
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/gu, '+').replace(/_/gu, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function EmailChoice({ optOut }: { optOut: boolean }) {
  const { t } = useI18n();
  const { token } = Route.useParams();
  const toast = useToast();
  const [value, setValue] = useState(!optOut);
  return (
    <label className="check small ca-email">
      <input type="checkbox" checked={value} onChange={async (event) => {
        const next = event.target.checked;
        setValue(next);
        try { await portalSetEmail({ data: { token, optOut: !next } }); toast({ text: next ? t('clientApp.emailOn') : t('clientApp.emailOff') }); }
        catch { setValue(!next); }
      }} />
      {t('clientApp.emailChoice')}
    </label>
  );
}

/** Spec 048: the change orders sent to the client, to accept or refuse with their name. */
function ChangeOrders({ orders, token, money, onDone, history = false }: { orders: Space['changeOrders']; token: string; money: (minor: number) => string; onDone: () => Promise<void>; history?: boolean }) {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pending = orders.filter((order) => order.status === 'sent');
  if (!orders.length) return null;
  const decide = async (id: string, accept: boolean, form: HTMLFormElement) => {
    const signer = String(new FormData(form).get('signer') ?? '').trim();
    if (!signer) { form.querySelector<HTMLInputElement>('input[name="signer"]')?.focus(); return; }
    setBusy(true);
    try { await portalDecideChange({ data: { token, id, accept, signer } }); toast({ text: t('changes.decided') }); await onDone(); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
    setBusy(false);
  };
  return (
    <section className="card stack">
      <h3 style={{ margin: 0 }}>{history ? t('clientReport.changes') : t('changes.portalTitle')}</h3>
      {history ? null : <p className="muted small" style={{ margin: 0 }}>{t('changes.portalSub')}</p>}
      {[...orders].sort((a, b) => Number(b.status === 'sent') - Number(a.status === 'sent') || a.number - b.number).map((order) => (
        <div key={order.id} className="stack" style={{ gap: '.4rem', borderTop: '1px solid var(--line)', paddingTop: '.7rem' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><b>{t('changes.number')} {order.number} · {order.title}</b><b>{money(order.amountMinor)}</b></div>
          {order.description ? <p className="small" style={{ margin: 0 }}>{order.description}</p> : null}
          {order.daysAdded ? <span className="small muted">{t('changes.daysAdded', { n: order.daysAdded })}</span> : null}
          {order.status === 'sent' && pending.includes(order) ? (
            <form className="stack" style={{ gap: '.4rem' }} onSubmit={(event) => event.preventDefault()}>
              <input name="signer" required maxLength={120} placeholder={t('changes.yourName')} aria-label={t('changes.yourName')} />
              <div className="pair">
                <button type="button" className="btn secondary" disabled={busy} onClick={(event) => void decide(order.id, false, event.currentTarget.form!)}>{t('changes.refuse')}</button>
                <button type="button" className="btn" disabled={busy} onClick={(event) => void decide(order.id, true, event.currentTarget.form!)}>{t('changes.accept')}</button>
              </div>
            </form>
          ) : <span className="badge">{t(`changes.statuses.${order.status as 'accepted'}`)}{order.decidedBy ? ` · ${order.decidedBy}` : ''}</span>}
        </div>
      ))}
    </section>
  );
}

function SignMilestone({ milestone, company, defaultName, onClose, onDone }: {
  milestone: Space['view']['milestones'][number]; company: string; defaultName: string; onClose: () => void; onDone: () => void;
}) {
  const { t, errorText } = useI18n();
  const { token } = Route.useParams();
  const pad = useRef<SignaturePadHandle>(null);
  const [verdict, setVerdict] = useState<'conform' | 'reserve'>('conform');
  const [reserve, setReserve] = useState('');
  const [name, setName] = useState(defaultName);
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const blob = await pad.current?.toBlob();
    if (!blob) return;
    setBusy(true); setError(null);
    const body = new FormData();
    body.append('milestoneId', milestone.id); body.append('signer', name); body.append('verdict', verdict); body.append('reserve', reserve);
    body.append('image', new File([blob], 'signature.png', { type: 'image/png' }));
    try {
      const response = await fetch(`/api/portal/${token}/sign`, { method: 'POST', body });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? 'generic');
      onDone();
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={t('clientPortal.signTitle', { name: milestone.name })}
      footer={(<><button type="button" className="btn secondary" onClick={onClose}>{t('clientPortal.later')}</button>
        <button type="button" className="btn" disabled={busy || empty || name.trim().length < 2 || (verdict === 'reserve' && !reserve.trim())} onClick={() => void submit()}>{t('clientPortal.signAndValidate')}</button></>)}>
      <div className="stack">
        <p style={{ margin: 0 }}>{t('clientPortal.signText', { company })}</p>
        <div className="stack" style={{ gap: '.4rem' }}>
          <label className="check"><input type="radio" checked={verdict === 'conform'} onChange={() => setVerdict('conform')} />{t('clientPortal.allGood')}</label>
          <label className="check"><input type="radio" checked={verdict === 'reserve'} onChange={() => setVerdict('reserve')} />{t('clientPortal.hasReserve')}</label>
        </div>
        {verdict === 'reserve' ? <label className="field">{t('clientPortal.reserveLabel')}<textarea value={reserve} onChange={(event) => setReserve(event.target.value)} maxLength={2000} /></label> : null}
        <label className="field">{t('clientPortal.yourName')}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="name" /></label>
        <SignaturePad ref={pad} label={t('clientPortal.signHere')} onChange={setEmpty} />
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
    </Modal>
  );
}

function Messages({ view, onSent, prefill = '' }: { view: Space['view']; onSent: () => Promise<void>; prefill?: string }) {
  const { t, locale, errorText } = useI18n();
  const { token } = Route.useParams();
  const [body, setBody] = useState(prefill);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView(); }, [view.messages.length]);
  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>{t('clientPortal.tabMessages')}</h2>
      {view.messages.length ? view.messages.map((message, index) => (
        <div key={index} className={`message ${message.authorKind === 'client' ? 'mine' : ''}`}>
          <div className="xsmall muted">{message.authorName} · {formatDate(locale, message.at, true)}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div>
        </div>
      )) : <p className="muted">{t('clientPortal.noMessages')}</p>}
      <div ref={end} />
      <form className="row nowrap" style={{ position: 'sticky', bottom: '4.5rem', background: 'var(--bg)', padding: '.5rem 0' }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!body.trim()) return;
          try { await portalMessage({ data: { token, body } }); setBody(''); await onSent(); } catch (caught) { setError(errorText(caught)); }
        }}>
        <input value={body} onChange={(event) => setBody(event.target.value)} placeholder={t('clientPortal.write')} aria-label={t('clientPortal.write')} maxLength={4000} />
        <button type="submit" className="btn" aria-label={t('clientPortal.send')}><Send size={18} /></button>
      </form>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
