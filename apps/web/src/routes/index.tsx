// Public landing (spec 042). The angle comes from the pilot client's own words: clarity on every site
// (what happens, when, where) without being overwhelmed, and looking professional. Built on Hormozi's
// value equation (dream outcome, likelihood shown by a live demo, time to the first report, effort as
// low as WhatsApp, a conditional guarantee) and on landing-page evidence (customer language, one main
// action repeated, proof next to the action). No invented testimonial, figure or customer.
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronDown, CloudOff, FileText, MapPin, PhoneOff, Receipt, ShieldCheck, Smartphone, Wifi, X } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { formatMoney } from '@/components/ui.tsx';
import { getPlans } from '@/features/settings/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/')({
  loader: () => getPlans(),
  component: Landing,
});

const root = getRouteApi('__root__');
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Adds « in » to an element when it enters the screen: a rise from a visible resting state. */
function Reveal({ children, className = '', as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || reduceMotion()) { setSeen(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setSeen(true); observer.disconnect(); } }, { rootMargin: '0px 0px -12% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <Tag ref={ref} className={`lx-reveal ${seen ? 'in' : ''} ${className}`}>{children}</Tag>;
}

// ---------------------------------------------------------------- the « Today » board (hero)
type Tone = 'ok' | 'warn' | 'bad' | 'info';
const SITES = [
  { code: 'KC-01', place: 'Avédji', x: 30, y: 38 }, { code: 'KC-02', place: 'Adidogomé', x: 18, y: 55 }, { code: 'KC-03', place: 'Agoè', x: 46, y: 22 },
  { code: 'KC-04', place: 'Port', x: 70, y: 74 }, { code: 'KC-05', place: 'Bè-Kpota', x: 60, y: 58 },
];
const EVENTS: { site: number; time: string; tone: Tone; key: string }[] = [
  { site: 1, time: '11:20', tone: 'ok', key: 'e1' }, { site: 4, time: '10:52', tone: 'info', key: 'e2' }, { site: 2, time: '10:31', tone: 'warn', key: 'e3' },
  { site: 0, time: '09:47', tone: 'ok', key: 'e4' }, { site: 3, time: '09:05', tone: 'bad', key: 'e5' }, { site: 1, time: '08:40', tone: 'info', key: 'e6' },
  { site: 4, time: '08:12', tone: 'ok', key: 'e7' }, { site: 0, time: '07:42', tone: 'ok', key: 'e8' },
];

function TodayBoard() {
  const { t } = useI18n();
  const [head, setHead] = useState(0);
  useEffect(() => {
    if (reduceMotion()) return;
    const timer = window.setInterval(() => setHead((value) => (value + 1) % EVENTS.length), 2800);
    return () => window.clearInterval(timer);
  }, []);
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
            const tone = EVENTS.find((event) => event.site === index && feed.includes(event))?.tone ?? 'ok';
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
                  <span className="lx-meta"><span>{event.time}</span><span><MapPin size={11} />{site.code} · {site.place}</span></span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- offline simulator
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
      <div className={`lx-phone ${offline ? 'off' : ''}`}>
        <div className="lx-screen">
          <div className="lx-status"><span>09:05</span><span className="lx-signal">{offline ? <CloudOff size={13} /> : <Wifi size={13} />}</span></div>
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
  return (
    <div className="lx">
      <div className="public lx-header"><PublicHeader signedIn={Boolean(viewer)} /></div>

      {/* 1. The promise, in the client's words, and the product doing it. */}
      <header className="lx-hero">
        <div className="lx-wrap lx-hero-grid">
          <div className="lx-hero-copy">
            <span className="lx-eyebrow">{t('lx.hero.eyebrow')}</span>
            <h1>{t('lx.hero.title1')} <span className="lx-hl">{t('lx.hero.title2')}</span></h1>
            <p className="lx-lead">{t('lx.hero.lead')}</p>
            <div className="lx-ctas">
              <Link to="/demo" className="lx-btn primary" data-umami-event="lp-demo-hero">{t('lx.cta.demo')}<ArrowRight size={18} /></Link>
              <Link to="/signup" className="lx-btn ghost" data-umami-event="lp-signup-hero">{t('lx.cta.trial')}</Link>
            </div>
            <ul className="lx-micro">{list('lx.hero.micro').map((item) => <li key={item}><Check size={14} />{item}</li>)}</ul>
          </div>
          <TodayBoard />
        </div>
      </header>

      {/* 2. The problem, as they live it. */}
      <section className="lx-section">
        <div className="lx-wrap lx-split">
          <Reveal className="lx-photo"><img src="/landing/whatsapp-chaos.webp" alt={t('lx.pain.alt')} loading="lazy" width={1536} height={1024} /></Reveal>
          <div>
            <span className="lx-eyebrow">{t('lx.pain.eyebrow')}</span>
            <h2>{t('lx.pain.title')}</h2>
            <div className="lx-pains">
              {([['p1', PhoneOff], ['p2', FileText], ['p3', X]] as const).map(([key, Icon]) => (
                <Reveal key={key} className="lx-pain"><Icon size={20} /><div><h3>{t(`lx.pain.${key}t` as MessageKey)}</h3><p>{t(`lx.pain.${key}b` as MessageKey)}</p></div></Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Clarity: what, when, where, on one screen. */}
      <section className="lx-section lx-dark">
        <div className="lx-wrap">
          <span className="lx-eyebrow">{t('lx.clear.eyebrow')}</span>
          <h2 className="lx-narrow">{t('lx.clear.title')}</h2>
          <p className="lx-lead lx-narrow">{t('lx.clear.lead')}</p>
          <div className="lx-three">
            <Reveal className="lx-card">
              <span className="lx-tag">{t('lx.clear.whatTag')}</span>
              <h3>{t('lx.clear.whatTitle')}</h3>
              <div className="lx-report"><img src="/landing/hero-proof.webp" alt="" loading="lazy" /><div><b>{t('lx.clear.reportTitle')}</b><small>{t('lx.clear.reportMeta')}</small><span className="lx-bar"><i style={{ width: '62%' }} /></span></div></div>
              <p>{t('lx.clear.whatBody')}</p>
            </Reveal>
            <Reveal className="lx-card">
              <span className="lx-tag">{t('lx.clear.whenTag')}</span>
              <h3>{t('lx.clear.whenTitle')}</h3>
              <ol className="lx-timeline">
                {list('lx.clear.timeline').map((item, index) => <li key={item} className={index === 2 ? 'late' : index < 2 ? 'done' : ''}><span />{item}</li>)}
              </ol>
              <p>{t('lx.clear.whenBody')}</p>
            </Reveal>
            <Reveal className="lx-card">
              <span className="lx-tag">{t('lx.clear.whereTag')}</span>
              <h3>{t('lx.clear.whereTitle')}</h3>
              <div className="lx-where">{SITES.slice(0, 4).map((site, index) => <span key={site.code} className={`lx-where-row ${['ok', 'ok', 'warn', 'bad'][index]}`}><MapPin size={13} /><b>{site.code}</b>{site.place}<em>{t(`lx.clear.state${index}` as MessageKey)}</em></span>)}</div>
              <p>{t('lx.clear.whereBody')}</p>
            </Reveal>
          </div>
          <div className="lx-ctas center"><Link to="/demo" className="lx-btn primary" data-umami-event="lp-demo-clear">{t('lx.cta.demoSee')}<ArrowRight size={18} /></Link></div>
        </div>
      </section>

      {/* 4. Professionalism: what your clients see of you. */}
      <section className="lx-section">
        <div className="lx-wrap lx-split reverse">
          <div>
            <span className="lx-eyebrow">{t('lx.pro.eyebrow')}</span>
            <h2>{t('lx.pro.title')}</h2>
            <p className="lx-lead">{t('lx.pro.lead')}</p>
            <div className="lx-checks">
              {([['i1', FileText], ['i2', Receipt], ['i3', Smartphone], ['i4', ShieldCheck]] as const).map(([key, Icon]) => (
                <Reveal key={key} as="div" className="lx-check"><Icon size={18} /><div><b>{t(`lx.pro.${key}t` as MessageKey)}</b><span>{t(`lx.pro.${key}b` as MessageKey)}</span></div></Reveal>
              ))}
            </div>
          </div>
          <Reveal className="lx-photo stacked">
            <img src="/landing/milestone-signature.webp" alt={t('lx.pro.alt')} loading="lazy" width={1536} height={1024} />
            <div className="lx-portal">
              <b>{t('lx.pro.portalTitle')}</b>
              <div className="lx-thumbs"><img src="/landing/hero-proof.webp" alt="" /><img src="/landing/concrete-pour.webp" alt="" /><img src="/landing/team-morning.webp" alt="" /></div>
              <span className="lx-portal-row"><span>{t('lx.pro.portalProgress')}</span><b>62 %</b></span>
              <span className="lx-bar"><i style={{ width: '62%' }} /></span>
              <span className="lx-portal-sign">{t('lx.pro.portalSign')}</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 5. Effort: as simple as WhatsApp, even without network. */}
      <section className="lx-section lx-team">
        <div className="lx-team-bg" aria-hidden />
        <div className="lx-wrap lx-split">
          <div>
            <span className="lx-eyebrow">{t('lx.easy.eyebrow')}</span>
            <h2>{t('lx.easy.title')}</h2>
            <p className="lx-lead">{t('lx.easy.lead')}</p>
            <ol className="lx-steps">{list('lx.easy.steps').map((item, index) => <li key={item}><b>{index + 1}</b>{item}</li>)}</ol>
          </div>
          <OfflinePhone />
        </div>
      </section>

      {/* 6. The offer. */}
      <section className="lx-section" id="offre">
        <div className="lx-wrap">
          <span className="lx-eyebrow">{t('lx.offer.eyebrow')}</span>
          <h2 className="lx-narrow">{t('lx.offer.title')}</h2>
          <p className="lx-lead lx-narrow">{t('lx.offer.lead')}</p>
          <div className="lx-stack">
            {list('lx.offer.stack').map((item, index) => <Reveal key={item} className="lx-stack-item"><span>{index + 1}</span>{item}</Reveal>)}
          </div>
          <div className="lx-plans">
            {paid.map((plan) => (
              <Reveal key={plan.code} className={`lx-plan ${plan.code === 'pro' ? 'best' : ''}`}>
                {plan.code === 'pro' ? <span className="lx-ribbon">{t('lx.offer.recommended')}</span> : null}
                <h3>{plan.name}</h3>
                <div className="lx-price">{plan.priceMinor > 0 ? <>{formatMoney(locale, plan.priceMinor, plan.currencyCode)}<small>{t('landing.perMonth')}</small></> : t('landing.onQuote')}</div>
                <ul>
                  <li>{plan.maxUsers ? t('landing.users', { n: plan.maxUsers }) : t('landing.usersUnlimited')}</li>
                  <li>{plan.maxProjects ? t('landing.projects', { n: plan.maxProjects }) : t('landing.projectsUnlimited')}</li>
                  {list(`lx.offer.plan_${plan.code}` as MessageKey).map((item) => <li key={item}>{item}</li>)}
                </ul>
                <Link to="/signup" className={`lx-btn ${plan.code === 'pro' ? 'primary' : 'ghost dark'}`} data-umami-event={`lp-plan-${plan.code}`}>{t('lx.cta.trial')}</Link>
              </Reveal>
            ))}
          </div>
          <Reveal className="lx-guarantee">
            <div className="lx-seal">{t('lx.offer.seal')}</div>
            <div><h3>{t('lx.offer.guaranteeTitle')}</h3><p>{t('lx.offer.guaranteeBody')}</p></div>
          </Reveal>
        </div>
      </section>

      {/* 7. Objections, then one last call. */}
      <section className="lx-section lx-faq-section">
        <div className="lx-wrap lx-faq">
          <h2>{t('lx.faq.title')}</h2>
          {(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const).map((key) => (
            <details key={key}><summary>{t(`lx.faq.${key}` as MessageKey)}<ChevronDown size={18} /></summary><p>{t(`lx.faq.${key.replace('q', 'a')}` as MessageKey)}</p></details>
          ))}
        </div>
      </section>

      <section className="lx-final">
        <div className="lx-final-bg" aria-hidden />
        <div className="lx-wrap">
          <h2>{t('lx.final.title')}</h2>
          <p className="lx-lead">{t('lx.final.lead')}</p>
          <div className="lx-ctas">
            <Link to="/demo" className="lx-btn primary" data-umami-event="lp-demo-final">{t('lx.cta.demo')}<ArrowRight size={18} /></Link>
            <Link to="/signup" className="lx-btn ghost light" data-umami-event="lp-signup-final">{t('lx.cta.trial')}</Link>
          </div>
        </div>
      </section>
      <footer className="lx-footer">{t('landing.footer', { year: new Date().getFullYear() })}</footer>
    </div>
  );
}
