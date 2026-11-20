// Public landing (spec 042). The angle comes from the pilot client's own words: clarity on every site
// (what happens, when, where) without being overwhelmed, and looking professional. Built on Hormozi's
// value equation (dream outcome, likelihood shown by a live demo, time to the first report, effort as
// low as WhatsApp, a conditional guarantee) and on landing-page evidence (customer language, one main
// action repeated, proof next to the action). Design: paper, site ink and terracotta (design system),
// monospace labels, flat panels, no accent bar on top of cards. No invented testimonial or customer.
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, CloudOff, FileText, MapPin, PhoneOff, Receipt, Users, Wifi, X } from 'lucide-react';
import { Logo, PublicHeader } from '@/components/PublicHeader.tsx';
import { formatMoney } from '@/components/ui.tsx';
import { getPlans } from '@/features/settings/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/')({
  loader: () => getPlans(),
  component: Landing,
});

const root = getRouteApi('__root__');
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A rise when the block enters the screen, from a visible resting state. */
function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || reduceMotion()) { setSeen(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setSeen(true); observer.disconnect(); } }, { rootMargin: '0px 0px -10% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`lx-reveal ${seen ? 'in' : ''} ${className}`}>{children}</div>;
}

const Eyebrow = ({ children, light }: { children: ReactNode; light?: boolean }) => <p className={`lx-eyebrow ${light ? 'light' : ''}`}><span />{children}</p>;

// ---------------------------------------------------------------- the day's events (what, when, where)
type Tone = 'ok' | 'warn' | 'bad' | 'info';
const SITES = [
  { code: 'KC-01', place: 'Villa R+1', x: 30, y: 38 }, { code: 'KC-02', place: 'Immeuble R+4', x: 18, y: 55 }, { code: 'KC-03', place: 'École', x: 46, y: 22 },
  { code: 'KC-04', place: 'Entrepôt', x: 70, y: 74 }, { code: 'KC-05', place: 'Clinique', x: 60, y: 58 },
];
const EVENTS: { site: number; time: string; tone: Tone; key: string; pct: number }[] = [
  { site: 0, time: '07:42', tone: 'ok', key: 'e8', pct: 62 }, { site: 1, time: '11:20', tone: 'ok', key: 'e1', pct: 71 }, { site: 4, time: '10:52', tone: 'info', key: 'e2', pct: 48 },
  { site: 2, time: '10:31', tone: 'warn', key: 'e3', pct: 35 }, { site: 0, time: '09:47', tone: 'ok', key: 'e4', pct: 64 }, { site: 3, time: '09:05', tone: 'bad', key: 'e5', pct: 22 },
  { site: 1, time: '08:40', tone: 'info', key: 'e6', pct: 70 }, { site: 4, time: '08:12', tone: 'ok', key: 'e7', pct: 47 },
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

/** Hero: the photo, and the report of the moment cycling over it. */
function HeroVisual() {
  const { t } = useI18n();
  const head = useTicker(EVENTS.length, 3400);
  const event = EVENTS[head]!;
  const site = SITES[event.site]!;
  return (
    <figure className="lx-hero-visual">
      <div className="lx-hero-photo">
        <img src="/landing/hero-proof.webp" alt={t('lx.hero.alt')} width={1536} height={1024} fetchPriority="high" />
        <span className="lx-photo-tag"><MapPin size={13} />{site.code} · {site.place}</span>
      </div>
      <figcaption className="lx-report" key={head} aria-live="polite">
        <div className="lx-report-top"><span className="lx-report-icon"><FileText size={14} /></span><span>{site.code} · {t('lx.hero.reportLabel')}</span><time>{event.time}</time></div>
        <strong>{t(`lx.board.${event.key}` as MessageKey)}</strong>
        <div className="lx-report-bottom"><span>{t('lx.hero.validated')}</span><b>{event.pct} %</b></div>
        <div className="lx-meter"><i style={{ width: `${event.pct}%` }} /></div>
      </figcaption>
    </figure>
  );
}

/** The « Today » board: five sites on the company map, and the feed of the day. */
function TodayBoard() {
  const { t } = useI18n();
  const head = useTicker(EVENTS.length, 2800);
  const feed = Array.from({ length: 4 }, (_, index) => EVENTS[(head + index) % EVENTS.length]!);
  const live = feed[0]!;
  return (
    <div className="lx-board" aria-label={t('lx.board.label')}>
      <div className="lx-board-head">
        <b>{t('lx.board.title')}</b>
        <span className="lx-chip ok">{t('lx.board.reports')}</span>
        <span className="lx-chip warn">{t('lx.board.watch')}</span>
      </div>
      <div className="lx-board-body">
        <svg className="lx-map" viewBox="0 0 100 100" role="img" aria-label={t('lx.board.map')}>
          <rect x="0" y="0" width="100" height="100" fill="var(--lx-map)" />
          <path d="M0 86 C 20 80, 40 90, 60 84 S 90 78, 100 82 L100 100 L0 100 Z" fill="var(--lx-sea)" />
          <path d="M8 70 C 30 66, 52 70, 82 64" stroke="var(--lx-road)" strokeWidth="1.6" fill="none" />
          <path d="M30 10 L 34 50 L 58 92" stroke="var(--lx-road)" strokeWidth="1.2" fill="none" />
          <path d="M10 40 C 30 36, 60 42, 92 30" stroke="var(--lx-road)" strokeWidth="1" fill="none" />
          {SITES.map((site, index) => {
            const active = live.site === index;
            const tone = feed.find((event) => event.site === index)?.tone ?? 'ok';
            return (
              <g key={site.code} transform={`translate(${site.x} ${site.y})`}>
                {active ? <circle r="7" className={`lx-pulse ${live.tone}`} /> : null}
                <circle r="3.2" className={`lx-pin ${tone}`} />
                <text y="-5.5" textAnchor="middle" className="lx-pin-label">{site.code}</text>
              </g>
            );
          })}
        </svg>
        <ol className="lx-feed" aria-live="polite">
          {feed.map((event, index) => {
            const site = SITES[event.site]!;
            return (
              <li key={`${head}-${index}`} className={`lx-event ${index === 0 ? 'new' : ''}`}>
                <span className={`lx-dot ${event.tone}`} />
                <div>
                  <b>{t(`lx.board.${event.key}` as MessageKey)}</b>
                  <span className="lx-meta"><time>{event.time}</time><span><MapPin size={11} />{site.code} · {site.place}</span></span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** Field, billing, client: one report serves the whole company. */
function Uses() {
  const { t } = useI18n();
  const tabs = [
    { key: 'field', icon: FileText, image: '/landing/team-morning.webp' },
    { key: 'billing', icon: Receipt, image: '/landing/concrete-pour.webp' },
    { key: 'client', icon: Users, image: '/landing/milestone-signature.webp' },
  ] as const;
  const [active, setActive] = useState<(typeof tabs)[number]['key']>('field');
  const current = tabs.find((tab) => tab.key === active)!;
  return (
    <>
      <div className="lx-tabs" role="tablist" aria-label={t('lx.uses.label')}>
        {tabs.map((tab, index) => (
          <button key={tab.key} type="button" role="tab" id={`tab-${tab.key}`} aria-selected={active === tab.key} aria-controls="lx-use-panel" tabIndex={active === tab.key ? 0 : -1}
            onClick={() => setActive(tab.key)}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (!step) return;
              const next = tabs[(index + step + tabs.length) % tabs.length]!;
              setActive(next.key);
              document.getElementById(`tab-${next.key}`)?.focus();
            }}>
            <tab.icon size={17} />{t(`lx.uses.${tab.key}Tab` as MessageKey)}
          </button>
        ))}
      </div>
      <article className="lx-panel" role="tabpanel" id="lx-use-panel" aria-labelledby={`tab-${active}`} key={active}>
        <div>
          <h3>{t(`lx.uses.${active}Title` as MessageKey)}</h3>
          <p>{t(`lx.uses.${active}Body` as MessageKey)}</p>
          <Link to="/demo" className="lx-inline" data-umami-event={`lp-demo-${active}`}>{t(`lx.uses.${active}Link` as MessageKey)}<ArrowRight size={17} /></Link>
        </div>
        <img src={current.image} alt={t(`lx.uses.${active}Alt` as MessageKey)} loading="lazy" width={1536} height={1024} />
      </article>
    </>
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
    setItems((list) => [...list.slice(-4), { key: keys[list.length % keys.length]!, time: `${String(Math.floor(next / 60) % 24).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`, sent: !offline }]);
  };
  const toggle = () => {
    const now = !offline;
    setOffline(now);
    if (!now) items.forEach((_, index) => window.setTimeout(() => setItems((list) => list.map((item, position) => (position <= index ? { ...item, sent: true } : item))), 600 * (index + 1)));
  };
  return (
    <div className="lx-offline">
      <button type="button" className="lx-toggle" aria-pressed={offline} onClick={toggle} data-umami-event="lp-offline-toggle">
        <span className="lx-knob" />{offline ? t('lx.offline.on') : t('lx.offline.off')}
      </button>
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
      <p className="lx-hint">{t('lx.offline.hint')}</p>
    </div>
  );
}

// ---------------------------------------------------------------- the page
function Landing() {
  const { t, locale } = useI18n();
  const { plans } = Route.useLoaderData();
  const { viewer } = root.useLoaderData();
  const paid = plans.filter((plan) => plan.code !== 'trial');
  const list = (key: MessageKey) => t(key).split('|');
  const nav = [{ href: '#usages', label: t('lx.nav.features') }, { href: '#tarifs', label: t('lx.nav.pricing') }, { href: '#questions', label: t('lx.nav.faq') }];
  return (
    <div className="lx">
      <div className="lx-top"><div className="lx-wrap"><PublicHeader signedIn={Boolean(viewer)} nav={nav} /></div></div>

      {/* 1. The promise, and a report arriving. */}
      <section className="lx-hero">
        <div className="lx-wrap lx-hero-grid">
          <div>
            <Eyebrow>{t('lx.hero.eyebrow')}</Eyebrow>
            <h1>{t('lx.hero.title1')}<br /><em>{t('lx.hero.title2')}</em></h1>
            <p className="lx-lead">{t('lx.hero.lead')}</p>
            <div className="lx-actions">
              <Link to="/demo" className="lx-btn primary" data-umami-event="lp-demo-hero">{t('lx.cta.demo')}<ArrowRight size={18} /></Link>
              <Link to="/signup" className="lx-trial" data-umami-event="lp-signup-hero">{t('lx.cta.trial')}</Link>
            </div>
            <p className="lx-micro"><Check size={15} />{list('lx.hero.micro').join(' · ')}</p>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* 2. The problem, as they live it. */}
      <section className="lx-section lx-wrap">
        <div className="lx-head">
          <div><Eyebrow>{t('lx.pain.eyebrow')}</Eyebrow><h2>{t('lx.pain.title')}</h2></div>
        </div>
        <div className="lx-pain-grid">
          <Reveal className="lx-photo"><img src="/landing/whatsapp-chaos.webp" alt={t('lx.pain.alt')} loading="lazy" width={1536} height={1024} /></Reveal>
          <div className="lx-pains">
            {([['p1', PhoneOff], ['p2', FileText], ['p3', X]] as const).map(([key, Icon]) => (
              <Reveal key={key} className="lx-pain"><span className="lx-pain-icon"><Icon size={18} /></span><div><h3>{t(`lx.pain.${key}t` as MessageKey)}</h3><p>{t(`lx.pain.${key}b` as MessageKey)}</p></div></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Clarity: what, when, where on one screen. */}
      <section className="lx-band">
        <div className="lx-wrap lx-clear">
          <div>
            <Eyebrow>{t('lx.clear.eyebrow')}</Eyebrow>
            <h2>{t('lx.clear.title')}</h2>
            <p className="lx-lead">{t('lx.clear.lead')}</p>
            <dl className="lx-www">
              {(['what', 'when', 'where'] as const).map((key) => (
                <div key={key}><dt>{t(`lx.clear.${key}Tag` as MessageKey)}</dt><dd>{t(`lx.clear.${key}Body` as MessageKey)}</dd></div>
              ))}
            </dl>
          </div>
          <Reveal><TodayBoard /></Reveal>
        </div>
      </section>

      {/* 4. From the field to the office, and what clients see of you. */}
      <section className="lx-section lx-wrap" id="usages">
        <div className="lx-head">
          <div><Eyebrow>{t('lx.uses.eyebrow')}</Eyebrow><h2>{t('lx.uses.title')}</h2></div>
          <p>{t('lx.uses.lead')}</p>
        </div>
        <Uses />
      </section>

      {/* 5. As simple as WhatsApp, even without network. */}
      <section className="lx-ink">
        <div className="lx-wrap lx-easy">
          <div>
            <Eyebrow light>{t('lx.easy.eyebrow')}</Eyebrow>
            <h2>{t('lx.easy.title')}</h2>
            <p className="lx-lead">{t('lx.easy.lead')}</p>
            <ol className="lx-steps">{list('lx.easy.steps').map((item, index) => <li key={item}><b>{index + 1}</b>{item}</li>)}</ol>
          </div>
          <OfflinePhone />
        </div>
      </section>

      {/* 6. The offer. */}
      <section className="lx-pricing" id="tarifs">
        <div className="lx-wrap">
          <div className="lx-head">
            <div><Eyebrow>{t('lx.offer.eyebrow')}</Eyebrow><h2>{t('lx.offer.title')}</h2></div>
            <p>{t('lx.offer.lead')}</p>
          </div>
          <ul className="lx-stack">{list('lx.offer.stack').map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul>
          <div className="lx-plans">
            {paid.map((plan) => (
              <Reveal key={plan.code} className={`lx-plan ${plan.code === 'pro' ? 'pro' : ''}`}>
                <div className="lx-plan-name"><h3>{plan.name}</h3>{plan.code === 'pro' ? <span className="lx-label">{t('lx.offer.recommended')}</span> : null}</div>
                <p className="lx-price">{plan.priceMinor > 0 ? <>{formatMoney(locale, plan.priceMinor, plan.currencyCode)} <small>{t('landing.perMonth')}</small></> : t('landing.onQuote')}</p>
                <ul>
                  <li>{plan.maxUsers ? t('landing.users', { n: plan.maxUsers }) : t('landing.usersUnlimited')}</li>
                  <li>{plan.maxProjects ? t('landing.projects', { n: plan.maxProjects }) : t('landing.projectsUnlimited')}</li>
                  {list(`lx.offer.plan_${plan.code}` as MessageKey).map((item) => <li key={item}>{item}</li>)}
                </ul>
                <Link to={plan.code === 'enterprise' ? '/demo' : '/signup'} className={`lx-btn ${plan.code === 'pro' ? 'primary' : 'outline'}`} data-umami-event={`lp-plan-${plan.code}`}>
                  {plan.code === 'enterprise' ? t('lx.cta.demo') : t('lx.cta.trial')}<ArrowRight size={17} />
                </Link>
              </Reveal>
            ))}
          </div>
          <div className="lx-guarantee">
            <span className="lx-seal">{t('lx.offer.seal')}</span>
            <div><h3>{t('lx.offer.guaranteeTitle')}</h3><p>{t('lx.offer.guaranteeBody')}</p></div>
          </div>
        </div>
      </section>

      {/* 7. Questions, then the last call. */}
      <section className="lx-section lx-wrap lx-faq" id="questions">
        <div><Eyebrow>{t('lx.faq.eyebrow')}</Eyebrow><h2>{t('lx.faq.title')}</h2></div>
        <div className="lx-answers">
          {(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const).map((key) => (
            <details key={key}><summary>{t(`lx.faq.${key}` as MessageKey)}</summary><p>{t(`lx.faq.${key.replace('q', 'a')}` as MessageKey)}</p></details>
          ))}
        </div>
      </section>

      <section className="lx-finish">
        <div className="lx-wrap">
          <div><Eyebrow light>{t('lx.final.eyebrow')}</Eyebrow><h2>{t('lx.final.title')}</h2><p>{t('lx.final.lead')}</p></div>
          <Link to="/demo" className="lx-btn primary" data-umami-event="lp-demo-final">{t('lx.cta.demo')}<ArrowRight size={18} /></Link>
        </div>
      </section>
      <footer className="lx-wrap lx-footer">
        <Logo />
        <span>{t('lx.footer.tagline')}</span>
        <Link to="/login">{t('landing.signIn')}</Link>
      </footer>
    </div>
  );
}
