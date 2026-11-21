// Public landing (spec 045, after 042). The angle is the pilot client's own words: clarity on every
// site (what, when, where) without being overwhelmed, and looking professional. The look follows the
// user's chosen reference (the standalone page built with the same design system): a site-ink hero
// with the live « Today » console, an orange ribbon of the day's events, paper reading bands.
// Proof: the product at work, sourced industry figures, the visitor's own estimate. Prices are those
// of the visitor's country currency (never converted). No guarantee, no invented customer.
import { createFileRoute, getRouteApi, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Check, CloudOff, FileText, MapPin, PhoneOff, Wifi, X } from 'lucide-react';
import { Logo, PublicHeader } from '@/components/PublicHeader.tsx';
import { formatMoney } from '@/components/ui.tsx';
import { COUNTRY_COOKIE, sortedCountries } from '@/features/settings/countries.ts';
import { getPlans, sendContactRequest } from '@/features/settings/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';
import { trackSuccess } from '@/lib/audience.ts';
import { planWords, Rich } from '@/components/PlanWords.tsx';

export const Route = createFileRoute('/')({
  loader: () => getPlans(),
  component: Landing,
});

const root = getRouteApi('__root__');
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- the day's events (demo data)
type Tone = 'ok' | 'warn' | 'bad';
const SITES = [
  { code: 'KC-01', x: 22, y: 30 }, { code: 'KC-02', x: 70, y: 22 }, { code: 'KC-03', x: 48, y: 58 },
  { code: 'KC-04', x: 78, y: 70 }, { code: 'KC-05', x: 30, y: 74 },
];
const EVENTS: { site: number; time: string; tone: Tone; key: string }[] = [
  { site: 0, time: '07:42', tone: 'ok', key: 'e8' }, { site: 3, time: '09:05', tone: 'bad', key: 'e5' },
  { site: 4, time: '10:52', tone: 'ok', key: 'e2' }, { site: 1, time: '11:20', tone: 'ok', key: 'e1' },
  { site: 2, time: '10:31', tone: 'warn', key: 'e3' }, { site: 0, time: '09:47', tone: 'ok', key: 'e4' },
  { site: 1, time: '08:40', tone: 'ok', key: 'e6' }, { site: 4, time: '08:12', tone: 'ok', key: 'e7' },
];

function useTicker(length: number, every: number) {
  const [head, setHead] = useState(0);
  useEffect(() => {
    if (reduceMotion()) return;
    const timer = window.setInterval(() => setHead((value) => (value + 1) % length), every);
    return () => window.clearInterval(timer);
  }, [length, every]);
  return head;
}

/** The « Today » console: five sites on the map, the signals of the day arriving one by one. */
function TodayConsole() {
  const { t } = useI18n();
  const head = useTicker(EVENTS.length, 3200);
  const feed = Array.from({ length: 4 }, (_, index) => EVENTS[(head + index) % EVENTS.length]!);
  const live = feed[0]!;
  return (
    <figure className="lp-console" aria-label={t('lp.hero.consoleLabel')}>
      <div className="lp-console-bar">
        <span className="lp-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>{t('lp.hero.console')}</span>
        <span className="lp-live">{t('lp.hero.live')}</span>
      </div>
      <div className="lp-console-body">
        <div className="lp-map">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={t('lp.hero.mapLabel')}>
            <path d="M-5 38 L 105 18" className="lp-road" /><path d="M-5 80 L 105 52" className="lp-road" />
            <path d="M18 -5 L 40 105" className="lp-road" /><path d="M62 -5 L 84 105" className="lp-road" />
            <path d="M-5 60 L 60 105" className="lp-road thin" /><path d="M40 -5 L 105 34" className="lp-road thin" />
          </svg>
          {SITES.map((site, index) => {
            const tone = feed.find((event) => event.site === index)?.tone ?? 'ok';
            return (
              <span key={site.code} className={`lp-pin ${tone} ${live.site === index ? 'on' : ''}`} style={{ left: `${site.x}%`, top: `${site.y}%` }}>
                <b>{site.code}</b>
              </span>
            );
          })}
          <div className="lp-count"><span>{t('lp.hero.active')}</span><b>05</b></div>
        </div>
        <div className="lp-signals">
          <div className="lp-signals-head"><b>{t('lp.hero.signals')}</b><span>{t('lp.hero.received', { n: 4 })}</span></div>
          <ol aria-live="polite">
            {feed.map((event, index) => (
              <li key={`${head}-${index}`} className={index === 0 ? 'new' : undefined}>
                <span className="lp-time"><time>{event.time}</time> {SITES[event.site]!.code}</span>
                <span className="lp-signal">{t(`lx.board.${event.key}` as MessageKey)}</span>
                <span className={`lp-chip ${event.tone === 'ok' ? 'ok' : 'warn'}`}>{event.tone === 'ok' ? t('lp.hero.ok') : t('lp.hero.watch')}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="lp-console-foot"><span>{t('lp.hero.sync')}</span><span className="lp-synced">{t('lp.hero.synced')}</span></div>
      <span className="lp-sticker">{t('lp.hero.offline')}</span>
    </figure>
  );
}

/** The orange ribbon: the day's events passing, the way they reach the office. */
function Ribbon() {
  const { t } = useI18n();
  const items = EVENTS.map((event) => `${event.time} · ${SITES[event.site]!.code} · ${t(`lx.board.${event.key}` as MessageKey)}`);
  return (
    <div className="lp-ribbon" role="region" aria-label={t('lp.ribbon.label')}>
      <ul className="lp-ribbon-track">
        {[...items, ...items].map((item, index) => <li key={index} aria-hidden={index >= items.length}>{item}</li>)}
      </ul>
    </div>
  );
}

/** Cut the network, add a report, turn it back on: the report leaves by itself. */
function OfflinePhone() {
  const { t } = useI18n();
  const [offline, setOffline] = useState(false);
  const [items, setItems] = useState([{ key: 'o1', time: '07:20', sent: true }, { key: 'o2', time: '08:02', sent: true }]);
  const [clock, setClock] = useState(9 * 60 + 5);
  const waiting = items.filter((item) => !item.sent).length;
  const add = () => {
    const next = clock + 17;
    setClock(next);
    const keys = ['o3', 'o4', 'o5', 'o1', 'o2'];
    setItems((list) => [...list.slice(-3), { key: keys[list.length % keys.length]!, time: `${String(Math.floor(next / 60) % 24).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`, sent: !offline }]);
  };
  const toggle = () => {
    const now = !offline;
    setOffline(now);
    if (!now) items.forEach((_, index) => window.setTimeout(() => setItems((list) => list.map((item, position) => (position <= index ? { ...item, sent: true } : item))), 600 * (index + 1)));
  };
  return (
    <div className="lp-offline">
      <div className="lx-phone">
        <div className="lx-screen">
          <div className="lx-status"><span>09:05</span>{offline ? <CloudOff size={13} /> : <Wifi size={13} />}</div>
          <div className="lx-app-head"><b>{t('lx.offline.site')}</b><span className={`lx-sync ${offline ? 'wait' : waiting ? 'busy' : 'ok'}`}>{offline ? t('lx.offline.waiting', { n: waiting }) : waiting ? t('lx.offline.sending') : t('lx.offline.allSent')}</span></div>
          <ul className="lx-queue">
            {items.slice().reverse().map((item, index) => (
              <li key={`${item.key}-${item.time}-${index}`}><span className="lx-thumb" /><div>{t(`lx.offline.${item.key}` as MessageKey)}<small>{t('lx.offline.taken', { time: item.time })}</small></div><span className={`lx-state ${item.sent ? 'ok' : 'wait'}`}>{item.sent ? t('lx.offline.sent') : t('lx.offline.pending')}</span></li>
            ))}
          </ul>
          <button type="button" className="lx-add" onClick={add}>{t('lx.offline.add')}</button>
        </div>
      </div>
      <div className="lp-offline-side">
        <button type="button" className="lx-toggle" aria-pressed={offline} onClick={toggle} data-umami-event="lp-offline-toggle">
          <span className="lx-knob" />{offline ? t('lx.offline.on') : t('lx.offline.off')}
        </button>
        <p className="lp-hint">{t('lx.offline.hint')}</p>
      </div>
    </div>
  );
}

// Starting value of one working hour per currency: an editable assumption, never a claim.
const HOURLY: Record<string, number> = {
  EUR: 25, USD: 28, GBP: 22, CAD: 35, CHF: 45, MAD: 80, TND: 15, DZD: 600, XOF: 2500, XAF: 2500,
  NGN: 3500, GHS: 60, KES: 600, RWF: 3500, CDF: 8000, GNF: 25000, MGA: 12000,
};
const decimals = (currency: string) => new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;

/** The visitor's own estimate, in their currency, next to the price of the plan we recommend. */
function Estimate({ currency, proMinor }: { currency: string; proMinor: number }) {
  const { t, locale } = useI18n();
  const [people, setPeople] = useState(3);
  const [hours, setHours] = useState(5.5);
  const [cost, setCost] = useState(HOURLY[currency] ?? 20);
  const [share, setShare] = useState(25);
  useEffect(() => setCost(HOURLY[currency] ?? 20), [currency]);
  const lostHours = (people * hours * 52) / 12;
  const winHours = (lostHours * share) / 100;
  const money = (major: number) => formatMoney(locale, Math.round(major * 10 ** decimals(currency)), currency);
  const number = (value: number, digits = 0) => value.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: digits });
  return (
    <form className="lp-estimate" onSubmit={(event) => event.preventDefault()}>
      <label>{t('lp.cost.people')}<output>{people}</output>
        <input type="range" min={1} max={30} value={people} onChange={(event) => setPeople(Number(event.target.value))} />
        <small>{t('lp.cost.peopleHint')}</small>
      </label>
      <label>{t('lp.cost.hours')}<output>{t('lp.cost.hoursUnit', { n: number(hours, 1) })}</output>
        <input type="range" min={1} max={20} step={0.5} value={hours} onChange={(event) => setHours(Number(event.target.value))} />
      </label>
      <label>{t('lp.cost.cost', { currency })}
        <input type="number" min={0} step="any" inputMode="decimal" value={cost} onChange={(event) => setCost(Math.max(0, Number(event.target.value) || 0))} />
      </label>
      <label>{t('lp.cost.share')}<output>{share} %</output>
        <input type="range" min={10} max={60} step={5} value={share} onChange={(event) => setShare(Number(event.target.value))} />
        <small>{t('lp.cost.shareHint')}</small>
      </label>
      <div className="lp-result" aria-live="polite">
        <div><span>{t('lp.cost.lost')}</span><strong>{t('lp.cost.hoursUnit', { n: number(lostHours) })}</strong><em>{money(lostHours * cost)}</em></div>
        <div className="win"><span>{t('lp.cost.win')}</span><strong>{t('lp.cost.hoursUnit', { n: number(winHours) })}</strong><em>{money(winHours * cost)}</em></div>
        <p>{t('lp.cost.days', { n: number(winHours / 8, 1) })}{proMinor > 0 ? ` ${t('lp.cost.compare', { price: formatMoney(locale, proMinor, currency) })}` : ''}</p>
      </div>
    </form>
  );
}

/** Call-back request: the prospect leaves a way to be reached; nothing else is asked. */
function ContactForm() {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    setState('sending');
    try {
      await sendContactRequest({ data: { name: text('name'), company: text('company'), reach: text('reach'), activeSites: text('sites') ? Number(text('sites')) : null, message: text('message'), website: text('website') } });
      setState('sent');
      trackSuccess('contact-sent');
    } catch {
      setState('error');
    }
  };
  if (state === 'sent') return <p className="lp-sent" role="status"><Check size={18} />{t('lp.contact.sent')}</p>;
  return (
    <form className="lp-contact-form" onSubmit={(event) => void submit(event)}>
      <label>{t('lp.contact.name')}<input name="name" required maxLength={120} autoComplete="name" /></label>
      <label>{t('lp.contact.company')}<input name="company" required maxLength={160} autoComplete="organization" /></label>
      <label>{t('lp.contact.reach')}<input name="reach" required minLength={3} maxLength={160} autoComplete="tel" /></label>
      <label>{t('lp.contact.sites')}<input name="sites" type="number" min={0} max={10000} inputMode="numeric" /></label>
      <label className="wide">{t('lp.contact.message')}<textarea name="message" rows={3} maxLength={2000} /></label>
      <input name="website" tabIndex={-1} autoComplete="off" className="lp-trap" aria-hidden="true" />
      <div className="wide lp-contact-actions">
        <button type="submit" className="lx-btn primary" disabled={state === 'sending'} data-umami-event="lp-contact">{state === 'sending' ? t('lp.contact.sending') : t('lp.contact.send')}<ArrowRight size={17} /></button>
        {state === 'error' ? <span className="lp-error" role="alert">{t('lp.contact.error')}</span> : null}
      </div>
    </form>
  );
}

const ROLES = ['owner', 'engineer', 'site_lead', 'accountant', 'client'] as const;

// ---------------------------------------------------------------- the page
function Landing() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { plans, country, currency } = Route.useLoaderData();
  const { viewer } = root.useLoaderData();
  const paid = plans.filter((plan) => plan.code !== 'trial');
  const pro = plans.find((plan) => plan.code === 'pro');
  // Country names come from Intl, which the server and the browser may spell differently: the full
  // list is built in the browser, the server renders only the current country.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const countries = useMemo(() => (mounted ? sortedCountries(locale) : sortedCountries(locale).filter((item) => item.code === country)), [locale, mounted, country]);
  const list = (key: MessageKey) => t(key).split('|');
  const nav = [
    { href: '#constat', label: t('lp.nav.problem') }, { href: '#comment', label: t('lp.nav.how') },
    { href: '#roles', label: t('lp.nav.roles') }, { href: '#tarifs', label: t('lp.nav.pricing') }, { href: '#questions', label: t('lp.nav.faq') },
  ];
  const chooseCountry = async (code: string) => {
    document.cookie = `${COUNTRY_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    await router.invalidate();
  };
  const features = [1, 2, 3, 4, 5, 6, 7, 8] as const;
  return (
    <div className="lx lp">
      <div className="lx-top"><div className="lx-wrap"><PublicHeader signedIn={Boolean(viewer)} nav={nav} /></div></div>

      {/* The promise, with the company's day arriving on the right. */}
      <section className="lp-hero">
        <div className="lx-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <h1>{t('lp.hero.title1')} <em>{t('lp.hero.title2')}</em></h1>
            <p className="lp-lead">{t('lp.hero.lead')}</p>
            <div className="lp-actions">
              <Link to="/demo" className="lx-btn primary" data-umami-event="lp-demo-hero">{t('lp.hero.demo')}<ArrowUpRight size={18} /></Link>
              <Link to="/signup" className="lp-link light" data-umami-event="lp-signup-hero">{t('lp.hero.trial')}</Link>
            </div>
            <p className="lp-note">{t('lp.hero.note')}</p>
          </div>
          <TodayConsole />
        </div>
        <Ribbon />
      </section>

      {/* The work done well stays invisible. */}
      <section className="lp-section" id="constat">
        <div className="lx-wrap lp-split">
          <div>
            <h2>{t('lp.invisible.title1')} <em>{t('lp.invisible.title2')}</em></h2>
            <p className="lp-lead">{t('lp.invisible.lead')}</p>
            <ul className="lp-pains">
              {([['p1', PhoneOff], ['p2', FileText], ['p3', X]] as const).map(([key, Icon]) => (
                <li key={key}><span className="lp-pain-icon"><Icon size={17} /></span><div><h3>{t(`lp.invisible.${key}t` as MessageKey)}</h3><p>{t(`lp.invisible.${key}b` as MessageKey)}</p></div></li>
              ))}
            </ul>
          </div>
          <img className="lp-photo" src="/landing/whatsapp-chaos.webp" alt={t('lp.invisible.alt')} loading="lazy" width={1536} height={1024} />
        </div>
      </section>

      {/* What it costs: the research, then the visitor's own figures. */}
      <section className="lp-section lp-paper2">
        <div className="lx-wrap">
          <h2 className="lp-title-wide">{t('lp.cost.title1')} <em>{t('lp.cost.title2')}</em></h2>
          <p className="lp-lead">{t('lp.cost.lead')}</p>
          <dl className="lp-facts">
            {(['f1', 'f2', 'f3'] as const).map((key) => (
              <div key={key}><dt>{t(`lp.cost.${key}n` as MessageKey)}</dt><dd>{t(`lp.cost.${key}` as MessageKey)}</dd></div>
            ))}
          </dl>
          <p className="lp-source">{t('lp.cost.src1')}</p>
          <div className="lp-calc">
            <div>
              <h3>{t('lp.cost.calcTitle')}</h3>
              <p>{t('lp.cost.calcLead')}</p>
              <p className="lp-fine">{t('lp.cost.fine')}</p>
            </div>
            <Estimate currency={currency} proMinor={pro?.priceMinor ?? 0} />
          </div>
        </div>
      </section>

      {/* What, when, where: one calm screen. */}
      <section className="lp-section lp-ink" id="comment">
        <div className="lx-wrap">
          <h2>{t('lp.clear.title1')} <em>{t('lp.clear.title2')}</em></h2>
          <p className="lp-lead">{t('lp.clear.lead')}</p>
          <div className="lp-three">
            <article>
              <div className="lp-mini lp-mini-report">
                <img src="/landing/hero-site-lead.webp" alt="" loading="lazy" />
                <div><b>{t('lp.clear.report')}</b><span><MapPin size={11} />KC-01 · {t('lp.clear.reportMeta')}</span><span className="lp-val">{t('lp.clear.validated')} <b>62 %</b></span></div>
              </div>
              <h3>{t('lp.clear.whatT')}</h3><p>{t('lp.clear.whatB')}</p>
            </article>
            <article>
              <ul className="lp-mini lp-mini-time">
                <li className="done">{t('lp.clear.t1')}<span>{t('lp.clear.done')}</span></li>
                <li className="done">{t('lp.clear.t2')}<span>{t('lp.clear.done')}</span></li>
                <li className="late">{t('lp.clear.t3')}<span>{t('lp.clear.late')}</span></li>
                <li>{t('lp.clear.t4')}<span>{t('lp.clear.planned')}</span></li>
              </ul>
              <h3>{t('lp.clear.whenT')}</h3><p>{t('lp.clear.whenB')}</p>
            </article>
            <article>
              <ul className="lp-mini lp-mini-where">
                <li><i className="ok" />{t('lp.clear.w1')}<span>{t('lp.clear.okState')}</span></li>
                <li><i className="warn" />{t('lp.clear.w2')}<span>{t('lp.clear.watchState')}</span></li>
                <li><i className="bad" />{t('lp.clear.w3')}<span>{t('lp.clear.badState')}</span></li>
              </ul>
              <h3>{t('lp.clear.whereT')}</h3><p>{t('lp.clear.whereB')}</p>
            </article>
          </div>
        </div>
      </section>

      {/* One level up: field, money, client. */}
      <section className="lp-section">
        <div className="lx-wrap">
          <div className="lp-head">
            <h2>{t('lp.level.title1')} <em>{t('lp.level.title2')}</em></h2>
            <p>{t('lp.level.lead')}</p>
          </div>
          <div className="lp-mosaic">
            <article className="lp-tile lp-tile-field">
              <div className="lp-tile-copy"><h3>{t('lp.level.fieldT')}</h3><p>{t('lp.level.fieldB')}</p></div>
              <OfflinePhone />
            </article>
            <article className="lp-tile lp-tile-photo">
              <img src="/landing/concrete-pour.webp" alt={t('lp.level.financeAlt')} loading="lazy" width={1536} height={1024} />
              <div className="lp-tile-copy"><h3>{t('lp.level.financeT')}</h3><p>{t('lp.level.financeB')}</p>
                <a className="lp-link" href="/api/demo/start?role=accountant" data-umami-event="lp-demo-finance">{t('lp.level.link')}<ArrowUpRight size={16} /></a></div>
            </article>
            <article className="lp-tile lp-tile-photo lp-tile-orange">
              <img src="/landing/milestone-signature.webp" alt={t('lp.level.clientAlt')} loading="lazy" width={1536} height={1024} />
              <div className="lp-tile-copy"><h3>{t('lp.level.clientT')}</h3><p>{t('lp.level.clientB')}</p>
                <a className="lp-link" href="/api/demo/start?role=client" data-umami-event="lp-demo-client">{t('lp.level.link')}<ArrowUpRight size={16} /></a></div>
            </article>
          </div>
        </div>
      </section>

      {/* Each role, its own screens. */}
      <section className="lp-section lp-paper2" id="roles">
        <div className="lx-wrap lp-roles">
          <div>
            <h2>{t('lp.roles.title1')} <em>{t('lp.roles.title2')}</em></h2>
            <p className="lp-lead">{t('lp.roles.lead')}</p>
          </div>
          <ul>
            {ROLES.map((role) => (
              <li key={role}>
                <a href={`/api/demo/start?role=${role}`} data-umami-event={`lp-role-${role}`}>
                  <b>{t(`demo.roles.${role}` as MessageKey)}</b>
                  <span>{t(`lp.roles.${role}` as MessageKey)}</span>
                  <em>{t('lp.roles.open')}<ArrowRight size={15} /></em>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* For those who want to check everything. */}
      <section className="lp-section">
        <div className="lx-wrap">
          <div className="lp-head">
            <h2>{t('lp.features.title1')} <em>{t('lp.features.title2')}</em></h2>
            <p>{t('lp.features.lead')}</p>
          </div>
          <dl className="lp-index">
            {features.map((n) => (
              <div key={n} className={n >= 7 ? 'advanced' : undefined}>
                <dt>{t(`lp.features.f${n}t` as MessageKey)}{n === 8 ? <span className="lp-tag">{t('lp.features.advanced')}</span> : null}</dt>
                <dd>{t(`lp.features.f${n}b` as MessageKey)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* The offer, then the price of the visitor's country. */}
      <section className="lp-section lp-ink" id="tarifs">
        <div className="lx-wrap">
          <h2>{t('lp.offer.title1')} <em>{t('lp.offer.title2')}</em></h2>
          <p className="lp-lead">{t('lp.offer.lead')}</p>
          <ol className="lp-steps">
            {(['s1', 's2', 's3', 's4'] as const).map((key, index) => (
              <li key={key}><span>{index + 1}</span><h3>{t(`lp.offer.${key}t` as MessageKey)}</h3><p>{t(`lp.offer.${key}b` as MessageKey)}</p></li>
            ))}
          </ol>
          <div className="lp-pricing-head">
            <div><h3>{t('lp.offer.pricingTitle')}</h3><p>{t('lp.offer.pricingLead')}</p></div>
            <label className="lp-country">{t('lp.offer.country')}
              <select value={country} onChange={(event) => void chooseCountry(event.target.value)}>
                {countries.map((item) => <option key={item.code} value={item.code} suppressHydrationWarning>{item.name} · {item.currency}</option>)}
              </select>
            </label>
          </div>
          <div className="lp-plans">
            {paid.map((plan) => { const words = planWords(plan, locale); return (
              <article key={plan.code} className={`lp-plan ${words.highlight ? 'pro' : ''}`}>
                <div className="lp-plan-top"><span>{words.tagline}</span>{words.highlight ? <span className="lp-tag solid">{t('lp.offer.recommended')}</span> : null}</div>
                <h3>{words.name}</h3>
                <p className={`lp-price ${plan.priceMinor > 0 ? '' : 'quote'}`}>{plan.priceMinor > 0 ? <>{formatMoney(locale, plan.priceMinor, plan.currencyCode)} <small>{t('lp.offer.perMonth')}</small></> : t('lp.offer.onQuote')}</p>
                <ul>
                  <li>{plan.maxUsers ? t('landing.users', { n: plan.maxUsers }) : t('landing.usersUnlimited')}</li>
                  <li>{plan.maxProjects ? t('landing.projects', { n: plan.maxProjects }) : t('landing.projectsUnlimited')}</li>
                  {words.bullets.map((item) => <li key={item}><Rich text={item} /></li>)}
                </ul>
                {plan.code === 'enterprise' || plan.priceMinor === 0
                  ? <a href="#contact" className="lx-btn outline" data-umami-event={`lp-plan-${plan.code}`}>{t('lp.offer.talk')}<ArrowRight size={17} /></a>
                  : <Link to="/signup" className={`lx-btn ${words.highlight ? 'primary' : 'outline'}`} data-umami-event={`lp-plan-${plan.code}`}>{t('lp.offer.trial')}<ArrowRight size={17} /></Link>}
              </article>
            ); })}
          </div>
          <p className="lp-currency">{paid.some((plan) => plan.code !== 'enterprise' && plan.priceMinor === 0) ? t('lp.offer.quoteHint') : t('lp.offer.currencyNote', { currency })}</p>
          <ul className="lp-risk">{list('lp.offer.risk').map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul>
        </div>
      </section>

      {/* A call back, for those who prefer to talk. */}
      <section className="lp-section" id="contact">
        <div className="lx-wrap lp-contact">
          <div><h2>{t('lp.contact.title')}</h2><p className="lp-lead">{t('lp.contact.lead')}</p></div>
          <ContactForm />
        </div>
      </section>

      {/* Questions. */}
      <section className="lp-section lp-paper2" id="questions">
        <div className="lx-wrap lp-faq">
          <h2>{t('lp.faq.title1')}</h2>
          <div className="lp-answers">
            {(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const).map((key) => (
              <details key={key}><summary>{t(`lp.faq.${key}` as MessageKey)}</summary><p>{t(`lp.faq.${key.replace('q', 'a')}` as MessageKey)}</p></details>
            ))}
          </div>
        </div>
      </section>

      {/* The last call. */}
      <section className="lp-final">
        <div className="lx-wrap lp-final-inner">
          <h2>{t('lp.final.title1')} <em>{t('lp.final.title2')}</em></h2>
          <div>
            <p>{t('lp.final.lead')}</p>
            <Link to="/demo" className="lx-btn lp-btn-ink" data-umami-event="lp-demo-final">{t('lp.hero.demo')}<ArrowUpRight size={18} /></Link>
          </div>
        </div>
      </section>
      <footer className="lx-wrap lp-footer">
        <Logo />
        <span>{t('lp.footer.tagline')}</span>
        <span className="lp-sources">{t('lp.footer.sources')} : <a href="https://www.autodesk.com/blogs/construction/construction-disconnected-fmi-report/" rel="noopener noreferrer">{t('lp.footer.source1')}</a></span>
        <Link to="/login">{t('landing.signIn')}</Link>
      </footer>
    </div>
  );
}
