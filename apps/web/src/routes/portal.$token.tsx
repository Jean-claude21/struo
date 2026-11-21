// The client's space (spec 022): opened from a link, confirmed once by an e-mail code on this device,
// then followed like a parcel — photos, steps, reports in plain words, milestones signed with a
// finger, payments and messages. Phone first, one main action per screen.
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Check, CircleCheck, CreditCard, FileText, HardHat, Home, KeyRound, Lock, Mail, MessageCircle, Send, Wallet } from 'lucide-react';
import { LanguageSwitch } from '@/components/PublicHeader.tsx';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad.tsx';
import { Modal, useToast } from '@/components/kit.tsx';
import { formatDate, formatMoney } from '@/components/ui.tsx';
import { getPortal, portalDecideChange, portalMessage, portalPay, portalRequestCode, portalVerifyCode } from '@/features/portal/server.ts';
import { useI18n } from '@/i18n/index.tsx';
import { usePhotoViewer } from '@/components/PhotoViewer.tsx';

export const Route = createFileRoute('/portal/$token')({
  validateSearch: (search: Record<string, unknown>): { paid?: string } => (typeof search.paid === 'string' ? { paid: search.paid } : {}),
  loader: async ({ params }) => {
    try {
      return { data: await getPortal({ data: { token: params.token } }) };
    } catch {
      return { data: null };
    }
  },
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }, { name: 'referrer', content: 'no-referrer' }] }),
  component: Portal,
});

type Loaded = NonNullable<Awaited<ReturnType<typeof getPortal>>>;
type Space = Extract<Loaded, { gate: false }>;
type Tab = 'site' | 'documents' | 'payments' | 'messages';

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

// ---------------------------------------------------------------- C4–C7: the space

function SpaceView({ data }: { data: Space }) {
  const { t, locale } = useI18n();
  const { token } = Route.useParams();
  const search = Route.useSearch();
  const router = useRouter();
  const toast = useToast();
  const { view, reports, show } = data;
  const [tab, setTab] = useState<Tab>('site');
  const openViewer = usePhotoViewer();
  const photoTime = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const [signing, setSigning] = useState<Space['view']['milestones'][number] | null>(null);
  const [report, setReport] = useState<Space['reports'][number] | null>(null);
  const money = (minor: number) => formatMoney(locale, minor, view.project.currency);
  const date = (value: string | null) => formatDate(locale, value);
  const brand = view.company.brandColor ?? undefined;
  useEffect(() => { if (search.paid) toast({ text: t('clientPortal.paidOk') }); }, [search.paid]); // eslint-disable-line react-hooks/exhaustive-deps

  const photoUrl = (id: string) => `/api/portal/${token}/file/${id}`;
  const due = view.invoices.filter((invoice) => invoice.balance > 0);
  const toSign = view.milestones.filter((milestone) => milestone.clientValidation && !milestone.validatedAt && milestone.actualOn);
  const currentPhase = view.phases.findIndex((phase) => phase.progress < 100);
  const tabs: { value: Tab; label: string; icon: typeof Home; badge?: number; hidden?: boolean }[] = [
    { value: 'site', label: t('clientPortal.tabSite'), icon: Home },
    { value: 'documents', label: t('clientPortal.tabDocuments'), icon: FileText, hidden: !show.documents },
    { value: 'payments', label: t('clientPortal.tabPayments'), icon: Wallet, badge: due.length, hidden: !show.finance },
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

      {tab === 'site' ? (
        <div className="stack loose">
          <ChangeOrders orders={data.changeOrders} token={token} money={money} onDone={() => router.invalidate()} />
          {view.photos.length ? (
            <div className="stories" aria-label={t('portal.photos')}>
              {view.photos.slice(0, 12).map((photo, index) => (
                <button key={photo.id} type="button" className={`story ${index > 2 ? 'seen' : ''}`} onClick={() => openViewer(view.photos.map((item) => ({ url: photoUrl(item.id), title: item.note ?? null, detail: photoTime(item.takenAt) })), index)}>
                  <span className="ring-img"><img src={photoUrl(photo.id)} alt="" loading="lazy" /></span>
                  {new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }).format(new Date(photo.takenAt))}
                </button>
              ))}
            </div>
          ) : null}
          <section className="card stack">
            <div className="row nowrap" style={{ alignItems: 'baseline' }}>
              <span style={{ fontSize: '2.6rem', fontWeight: 800, color: 'var(--brand)' }}>{view.project.progress} %</span>
              <span className="sp" />
              {view.project.endDate ? <span className="muted small">{t('clientPortal.endPlanned', { date: date(view.project.endDate) })}</span> : null}
            </div>
            <div className="steps-v">
              {view.phases.map((phase, index) => {
                const state = phase.progress >= 100 ? 'done' : index === currentPhase || phase.progress > 0 ? 'current' : 'todo';
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
          </section>
          {toSign.map((milestone) => (
            <section key={milestone.id} className="card stack" style={{ borderColor: 'var(--brand)', borderWidth: 2 }}>
              <span className="badge brand" style={{ alignSelf: 'flex-start' }}>{t('clientPortal.todo')}</span>
              <b style={{ fontSize: '1.05rem' }}>{t('clientPortal.validateMilestone', { name: milestone.name })}</b>
              <button type="button" className="btn block" onClick={() => setSigning(milestone)}>{t('clientPortal.seeAndValidate')}</button>
            </section>
          ))}
          {show.photos ? (
            <section className="stack">
              <h2 style={{ margin: 0 }}>{t('field.reports')}</h2>
              {reports.length ? reports.map((item) => (
                <button key={item.id} type="button" className="card stack" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', gap: '.5rem' }} onClick={() => setReport(item)}>
                  {item.photos[0] ? <img src={photoUrl(item.photos[0])} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8 }} loading="lazy" /> : null}
                  <b>{t('clientPortal.reportTitle', { date: date(item.takenAt) })}</b>
                  <span className="small" style={{ color: 'var(--ink-2)' }}>{item.note}</span>
                  {item.phase && item.progress !== null ? <span className="badge brand" style={{ alignSelf: 'flex-start' }}>{item.phase} · {item.progress} %</span> : null}
                </button>
              )) : <p className="muted">{t('clientPortal.noReports')}</p>}
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === 'documents' ? (
        <div className="stack">
          <h2>{t('portal.documents')}</h2>
          {view.documents.length ? view.documents.map((document) => (
            <a key={document.id} className="site-card" href={document.hasFile ? photoUrl(document.id) : undefined} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <span className="ftype" style={{ ['--c' as string]: '#8e2a22' }}><FileText size={16} /></span>
              <span className="grow">{document.title}</span>
            </a>
          )) : <p className="muted">{t('portal.noDocuments')}</p>}
        </div>
      ) : null}

      {tab === 'payments' ? <Payments view={view} money={money} date={date} /> : null}

      {tab === 'messages' ? <Messages view={view} onSent={() => router.invalidate()} /> : null}

      <nav className="client-tabs" aria-label={view.project.name}>
        {tabs.filter((item) => !item.hidden).map((item) => (
          <button key={item.value} type="button" className={tab === item.value ? 'on' : ''} onClick={() => setTab(item.value)} aria-current={tab === item.value ? 'page' : undefined}>
            <item.icon size={21} />{item.label}{item.badge ? <span className="b-dot">{item.badge}</span> : null}
          </button>
        ))}
      </nav>


      <Modal open={Boolean(report)} onClose={() => setReport(null)} title={report ? t('clientPortal.reportTitle', { date: date(report.takenAt) }) : ''}>
        {report ? (
          <div className="stack">
            {report.photos.map((id, index) => <button key={id} type="button" className="pv-open" onClick={() => openViewer(report.photos.map((item) => ({ url: photoUrl(item), detail: photoTime(report.takenAt) })), index)}><img src={photoUrl(id)} alt="" style={{ width: '100%', borderRadius: 8 }} loading="lazy" /></button>)}
            <p style={{ margin: 0, fontSize: '1.02rem' }}>{report.note}</p>
            <span className="muted small">{t('clientPortal.reportBy', { name: report.author })}</span>
            <div className="pair">
              {show.messages ? <button type="button" className="btn secondary" onClick={() => { setReport(null); setTab('messages'); }}>{t('clientPortal.ask')}</button> : <span />}
              <button type="button" className="btn" onClick={() => setReport(null)}>{t('clientPortal.thanks')}</button>
            </div>
          </div>
        ) : null}
      </Modal>

      {signing ? <SignMilestone milestone={signing} company={view.company.name} defaultName={data.contactName ?? view.project.client ?? ''}
        onClose={() => setSigning(null)} onDone={async () => { setSigning(null); toast({ text: t('clientPortal.signedOk') }); await router.invalidate(); }} /> : null}
    </div>
  );
}

/** Spec 048: the change orders sent to the client, to accept or refuse with their name. */
function ChangeOrders({ orders, token, money, onDone }: { orders: Space['changeOrders']; token: string; money: (minor: number) => string; onDone: () => Promise<void> }) {
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
      <h3 style={{ margin: 0 }}>{t('changes.portalTitle')}</h3>
      <p className="muted small" style={{ margin: 0 }}>{t('changes.portalSub')}</p>
      {orders.map((order) => (
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

function Payments({ view, money, date }: { view: Space['view']; money: (minor: number) => string; date: (value: string | null) => string }) {
  const { t, errorText } = useI18n();
  const { token } = Route.useParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const due = view.invoices.filter((invoice) => invoice.balance > 0);
  const paid = view.invoices.filter((invoice) => invoice.balance <= 0);
  const pay = async (invoiceId: string) => {
    setBusy(invoiceId); setError(null);
    try { const { checkoutUrl } = await portalPay({ data: { token, invoiceId } }); window.location.href = checkoutUrl; }
    catch (caught) { setError(errorText(caught)); setBusy(null); }
  };
  return (
    <div className="stack loose">
      <h2 style={{ margin: 0 }}>{t('clientPortal.tabPayments')}</h2>
      {due.length ? due.map((invoice) => (
        <section key={invoice.id} className="card stack">
          <span className="muted small">{invoice.number} · {t(`finance.kinds.${invoice.kind as 'progress'}`)}</span>
          <span style={{ fontSize: '1.9rem', fontWeight: 800 }}>{money(invoice.balance)}</span>
          <span className="small">{t('clientPortal.dueBefore', { date: date(invoice.dueOn) })}</span>
          {view.canPay ? (
            <>
              <span className="small muted">{t('clientPortal.payWith')} : Mobile Money (TMoney, Flooz), carte</span>
              <button type="button" className="btn block" disabled={busy === invoice.id} onClick={() => void pay(invoice.id)}><CreditCard size={18} />{t('clientPortal.payNow', { amount: money(invoice.balance) })}</button>
              <span className="faint xsmall">{t('clientPortal.payNote')}</span>
            </>
          ) : <div className="notice info small">{t('portal.payUnavailable')}</div>}
        </section>
      )) : <div className="notice ok"><CircleCheck size={18} />{t('clientPortal.nothingToPay')}</div>}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {paid.length ? (
        <section className="stack" style={{ gap: '.4rem' }}>
          <h3 style={{ margin: 0 }}>{t('clientPortal.history')}</h3>
          {paid.map((invoice) => (
            <div key={invoice.id} className="row nowrap small" style={{ borderBottom: '1px solid var(--divider)', padding: '.5rem 0' }}>
              <span className="grow">{invoice.number} · {t(`finance.kinds.${invoice.kind as 'progress'}`)}</span><b className="num">{money(invoice.net)}</b><CircleCheck size={16} style={{ color: 'var(--ok)' }} />
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Messages({ view, onSent }: { view: Space['view']; onSent: () => Promise<void> }) {
  const { t, locale, errorText } = useI18n();
  const { token } = Route.useParams();
  const [body, setBody] = useState('');
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
