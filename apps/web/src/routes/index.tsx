// Public landing (spec 061): the founder's « editorial cockpit » mockup, implemented as is
// (struo-landing-editorial-cockpit: same sections, words, photos and look, scoped under .ed).
// What the mockup only pretended is real here: the cockpit pins switch the site, the estimate uses
// the visitor's currency, prices come from the visitor's country (on quote when none is published),
// each role opens its own demo, and the call-back form sends a real request.
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { COUNTRY_COOKIE, sortedCountries } from '@/features/settings/countries.ts';
import { EdFooter, EdHeader } from '@/components/Editorial.tsx';
import { formatMoney } from '@/components/ui.tsx';
import { planWords } from '@/components/PlanWords.tsx';
import { getPlans, sendContactRequest } from '@/features/settings/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';
import { trackEvent, trackSuccess } from '@/lib/audience.ts';

export const Route = createFileRoute('/')({
  loader: () => getPlans(),
  component: Landing,
});

const IMG = '/landing/ed';

// The five sites of the cockpit (demo data): position on the map, state and progress.
const SITES = [
  { left: 18, top: 31, tone: 'ok', progress: 74, watch: false },
  { left: 57, top: 21, tone: 'ok', progress: 61, watch: true },
  { left: 72, top: 59, tone: 'warn', progress: 48, watch: true },
  { left: 37, top: 67, tone: 'ok', progress: 86, watch: false },
  { left: 87, top: 36, tone: 'ok', progress: 53, watch: false },
] as const;

const ROLES = [
  { key: 'owner', image: 'daily-routine' },
  { key: 'engineer', image: 'proof-demo' },
  { key: 'site_lead', image: 'team-launch' },
  { key: 'accountant', image: 'value-cost' },
  { key: 'client', image: 'client-trust' },
] as const;

// Starting value of one working hour per currency: an editable assumption, never a claim.
const HOURLY: Record<string, number> = {
  EUR: 15, USD: 18, GBP: 15, CAD: 25, CHF: 35, MAD: 80, TND: 15, DZD: 600, XOF: 2500, XAF: 2500,
  NGN: 3500, GHS: 60, KES: 600, RWF: 3500, CDF: 8000, GNF: 25000, MGA: 12000,
};
const decimals = (currency: string) => new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;

function Cockpit() {
  const { t } = useI18n();
  const [active, setActive] = useState(2);
  const site = SITES[active]!;
  const k = (name: string) => t(`lp.hero.s${active}${name}` as MessageKey);
  return (
    <div className="ed-cockpit" aria-label={t('lp.hero.cockpitLabel')}>
      <div className="ed-cockpit-top"><span><i /><i /><i /></span><b>{t('lp.hero.today')}</b><em>{t('lp.hero.live')}</em></div>
      <div className="ed-cockpit-main">
        <div className="ed-map" aria-label={t('lp.hero.mapLabel')}>
          <svg viewBox="0 0 600 430" aria-hidden="true">
            <path d="M-30 330 C150 270 210 380 380 290 S530 200 650 230" className="ed-road" />
            <path d="M180 -20 C160 120 230 220 190 450" className="ed-road" />
            <path d="M410 -20 C390 130 470 260 430 450" className="ed-road ed-thin" />
            <path d="M-20 120 C170 160 330 60 640 110" className="ed-road ed-thin" />
          </svg>
          {SITES.map((item, index) => (
            <button key={index} type="button" className={`ed-pin ed-${item.tone}${index === active ? ' ed-is-active' : ''}`} style={{ left: `${item.left}%`, top: `${item.top}%` }}
              aria-label={t(`lp.hero.s${index}n` as MessageKey)} aria-pressed={index === active} onClick={() => setActive(index)} />
          ))}
          <div className="ed-map-count"><small>{t('lp.hero.active')}</small><strong>05</strong></div>
        </div>
        <aside className="ed-site-panel" aria-live="polite">
          <p className="ed-site-status">{site.watch ? t('lp.hero.watch') : t('lp.hero.ok')}</p>
          <h2>{k('n')}</h2>
          <p>{k('m')}</p>
          <div className="ed-progress"><i style={{ width: `${site.progress}%` }} /></div>
          <strong>{site.progress} %</strong>
          <p>{k('t')}</p>
        </aside>
      </div>
      <div className="ed-cockpit-foot"><span><b>3</b> {t('lp.hero.decisions')}</span><span><b>2</b> {t('lp.hero.reports')}</span><span><b>1</b> {t('lp.hero.invoice')}</span></div>
    </div>
  );
}

/** The visitor's own estimate, in their currency. */
function Calculator({ currency, country }: { currency: string; country: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  // Country names come from Intl, which the server and the browser may spell differently: the full
  // list is built in the browser, the server renders only the current country.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const countries = useMemo(() => (mounted ? sortedCountries(locale) : sortedCountries(locale).filter((item) => item.code === country)), [locale, mounted, country]);
  const choose = async (code: string) => {
    trackEvent('lp-country', { country: code });
    document.cookie = `${COUNTRY_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    await router.invalidate();
  };
  const [people, setPeople] = useState(3);
  const [hours, setHours] = useState(5.5);
  const [cost, setCost] = useState(HOURLY[currency] ?? 15);
  const [share, setShare] = useState(25);
  useEffect(() => setCost(HOURLY[currency] ?? 15), [currency]);
  const win = ((people * hours * 52) / 12) * (share / 100);
  const [used, setUsed] = useState(false);
  useEffect(() => { if (!used && (people !== 3 || hours !== 5.5 || share !== 25)) { setUsed(true); trackEvent('lp-calc-used'); } }, [people, hours, share, used]);
  const number = (value: number, digits = 0) => value.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: digits });
  return (
    <form className="ed-calculator" onSubmit={(event) => event.preventDefault()}>
      <label>{t('lp.cost.country')}<select className="ed-country" value={country} onChange={(event) => void choose(event.target.value)}>
        {countries.map((item) => <option key={item.code} value={item.code} suppressHydrationWarning>{item.name} · {item.currency}</option>)}
      </select></label>
      <label>{t('lp.cost.people')} <output>{people}</output><input type="range" min={1} max={30} value={people} onChange={(event) => setPeople(Number(event.target.value))} /></label>
      <label>{t('lp.cost.hours')} <output>{t('lp.cost.hoursUnit', { n: number(hours, 1) })}</output><input type="range" min={1} max={20} step={0.5} value={hours} onChange={(event) => setHours(Number(event.target.value))} /></label>
      <label>{t('lp.cost.hourCost', { currency })} <input type="number" min={0} step="any" inputMode="decimal" value={cost} onChange={(event) => setCost(Math.max(0, Number(event.target.value) || 0))} /></label>
      <label>{t('lp.cost.share')} <output>{share} %</output><input type="range" min={10} max={60} step={5} value={share} onChange={(event) => setShare(Number(event.target.value))} /></label>
      <div className="ed-calc-result" aria-live="polite">
        <span>{t('lp.cost.result')}</span>
        <strong>{t('lp.cost.hoursUnit', { n: number(win) })}</strong>
        <b>{formatMoney(locale, Math.round(win * cost * 10 ** decimals(currency)), currency)}</b>
        <p>{t('lp.cost.fine')}</p>
      </div>
    </form>
  );
}

/** The call-back request (spec 045), in the mockup's form. */
function CallBack() {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    setState('sending');
    try {
      await sendContactRequest({ data: { name: text('name'), company: text('company') || null, reach: text('reach'), activeSites: text('sites') ? Number(text('sites')) : null, message: '', website: text('website') } });
      setState('sent');
      trackSuccess('contact-sent');
    } catch {
      setState('error');
      trackEvent('contact-error');
    }
  };
  if (state === 'sent') return <form><p className="ed-sent" role="status">{t('lp.final.sent')}</p></form>;
  return (
    <form onSubmit={(event) => void submit(event)}>
      <label>{t('lp.final.name')} <span className="ed-req" aria-hidden="true">*</span><input name="name" required aria-required="true" maxLength={120} autoComplete="name" /></label>
      <label>{t('lp.final.company')}<input name="company" maxLength={160} autoComplete="organization" /></label>
      <label>{t('lp.final.reach')} <span className="ed-req" aria-hidden="true">*</span><input name="reach" required aria-required="true" minLength={3} maxLength={160} autoComplete="tel" /></label>
      <label>{t('lp.final.sites')}<input name="sites" type="number" min={0} max={10000} inputMode="numeric" /></label>
      <input name="website" tabIndex={-1} autoComplete="off" className="ed-trap" aria-hidden="true" />
      <p className="ed-req-note"><span aria-hidden="true">*</span> {t('lp.final.required')}</p>
      {state === 'error' ? <p className="ed-error" role="alert">{t('lp.final.error')}</p> : null}
      <button type="submit" disabled={state === 'sending'} data-umami-event="lp-contact">{state === 'sending' ? t('lp.final.sending') : t('lp.final.send')} <span>→</span></button>
    </form>
  );
}

function Landing() {
  const { t, locale } = useI18n();
  const { plans, currency, country, trial } = Route.useLoaderData();
  const [role, setRole] = useState<(typeof ROLES)[number]['key']>('owner');
  const shown = ROLES.find((item) => item.key === role)!;
  useEffect(() => {
    const seen = new Set<string>();
    const watch = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target.id)) continue;
        seen.add(entry.target.id);
        trackEvent(entry.target.id === 'tarifs' ? 'lp-pricing-seen' : 'lp-proof-seen');
      }
    }, { threshold: 0.35 });
    for (const id of ['preuve', 'tarifs']) { const node = document.getElementById(id); if (node) watch.observe(node); }
    return () => watch.disconnect();
  }, []);
  const list = (key: MessageKey) => t(key).split('|');
  const paid = plans.filter((plan) => plan.code !== 'trial');
  const priced = paid.some((plan) => plan.priceMinor > 0 && plan.code !== 'enterprise');
  const tagline = (code: string, fallback: string) => (['starter', 'pro', 'enterprise'].includes(code) ? t(`lp.pricing.${code}` as MessageKey) : fallback);
  return (
    <div className="ed">
      <EdHeader />

      <main>
        <section className="ed-hero">
          <div className="ed-hero-copy">
            <p className="ed-kicker ed-light"><span /> {t('lp.hero.kicker')}</p>
            <h1>{t('lp.hero.title1')}<br /><em>{t('lp.hero.title2')}</em></h1>
            <p className="ed-hero-lead">{t('lp.hero.lead')}</p>
            <div className="ed-hero-actions">
              <a className="ed-button ed-button-orange" href="#rappel" data-umami-event="lp-call-hero">{t('lp.hero.call')} <span>→</span></a>
              <a className="ed-under-link" href="#preuve" data-umami-event="lp-demo-hero">{t('lp.hero.demo')} <span>↗</span></a>
            </div>
            {trial.public ? <a className="ed-trial-link" href="/signup" data-umami-event="lp-trial-hero">{t('lp.trial.link', { n: trial.days })} <span>→</span></a> : null}
            <ul className="ed-reassure">{[t('lp.hero.setup'), ...(trial.public ? [t('lp.trial.free', { n: trial.days })] : []), t('lp.hero.noCommitment')].map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <Cockpit />
        </section>

        <div className="ed-ticker"><div>{list('lp.ticker').map((word, index, all) => (
          <span key={index} style={{ display: 'contents' }}><span>{word}</span>{index < all.length - 1 ? <i>✦</i> : null}</span>
        ))}</div></div>

        <section className="ed-problem" id="probleme">
          <div className="ed-section-index"><p className="ed-kicker ed-dark"><span /> {t('lp.problem.kicker')}</p><b>01 / 05</b></div>
          <div className="ed-problem-grid">
            <h2>{t('lp.problem.title1')}<br /><em>{t('lp.problem.title2')}</em></h2>
            <div className="ed-problem-copy">
              {([1, 2, 3] as const).map((n) => <article key={n}><span>{t(`lp.problem.t${n}` as MessageKey)}</span><p>{t(`lp.problem.b${n}` as MessageKey)}</p></article>)}
            </div>
          </div>
          <div className="ed-problem-photo">
            <img src={`${IMG}/problem-chaos.webp`} alt={t('lp.problem.alt')} loading="lazy" width={1672} height={941} />
            <p>{t('lp.problem.punch1')}<br /><strong>{t('lp.problem.punch2')}</strong></p>
          </div>
        </section>

        <section className="ed-cost" id="calcul">
          <div className="ed-cost-copy">
            <p className="ed-kicker ed-light"><span /> {t('lp.cost.kicker')}</p>
            <h2>{t('lp.cost.title1')}<br /><em>{t('lp.cost.title2')}</em></h2>
            <p>{t('lp.cost.lead1')} <strong>{t('lp.cost.leadStrong')}</strong> {t('lp.cost.lead2')}</p>
            <small>{t('lp.cost.source')}</small>
            <img className="ed-cost-image" src={`${IMG}/value-cost.webp`} alt={t('lp.cost.alt')} loading="lazy" width={1672} height={941} />
          </div>
          <Calculator currency={currency} country={country} />
        </section>

        <section className="ed-day" id="systeme">
          <div className="ed-section-index"><p className="ed-kicker ed-dark"><span /> {t('lp.day.kicker')}</p><b>02 / 05</b></div>
          <div className="ed-day-head"><h2>{t('lp.day.title1')}<br /><em>{t('lp.day.title2')}</em></h2><p>{t('lp.day.lead')}</p></div>
          <div className="ed-day-layout">
            <figure><img src={`${IMG}/daily-routine.webp`} alt={t('lp.day.alt')} loading="lazy" width={1536} height={1024} /><figcaption>{t('lp.day.caption')}</figcaption></figure>
            <ol className="ed-timeline">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <li key={n} className={n === 1 ? 'ed-active' : undefined}><time>{t(`lp.day.t${n}` as MessageKey)}</time><div><h3>{t(`lp.day.h${n}` as MessageKey)}</h3><p>{t(`lp.day.b${n}` as MessageKey)}</p></div></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="ed-offer">
          <div className="ed-section-index ed-light-index"><p className="ed-kicker ed-light"><span /> {t('lp.offer.kicker')}</p><b>03 / 05</b></div>
          <div className="ed-offer-head"><h2>{t('lp.offer.title1')}<br /><em>{t('lp.offer.title2')}</em></h2><p>{t('lp.offer.lead')}</p></div>
          <div className="ed-offer-steps">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <article key={n}><span>{String(n).padStart(2, '0')}</span><h3>{t(`lp.offer.s${n}t` as MessageKey)}</h3><p>{t(`lp.offer.s${n}b` as MessageKey)}</p><b>{t(`lp.offer.s${n}s` as MessageKey)}</b></article>
            ))}
          </div>
          <div className="ed-offer-media">
            <img src={`${IMG}/team-launch.webp`} alt={t('lp.offer.alt1')} loading="lazy" width={1536} height={1024} /><p><b>{t('lp.offer.tag1')}</b> {t('lp.offer.cap1')}</p>
            <img src={`${IMG}/client-trust.webp`} alt={t('lp.offer.alt2')} loading="lazy" width={1536} height={1024} /><p><b>{t('lp.offer.tag2')}</b> {t('lp.offer.cap2')}</p>
          </div>
        </section>

        <section className="ed-features" id="preuve">
          <div className="ed-section-index"><p className="ed-kicker ed-dark"><span /> {t('lp.proof.kicker')}</p><b>04 / 05</b></div>
          <div className="ed-demo-head"><h2>{t('lp.proof.title1')}<br /><em>{t('lp.proof.title2')}</em></h2><p>{t('lp.proof.lead')}</p></div>
          <div className="ed-roles">
            {ROLES.map((item, index) => (
              <button key={item.key} type="button" className={`ed-role${item.key === role ? ' ed-active' : ''}`} aria-pressed={item.key === role} onClick={() => setRole(item.key)}>
                <span>{String(index + 1).padStart(2, '0')}</span><b>{t(`lp.proof.${item.key}` as MessageKey)}</b><small>{t(`lp.proof.${item.key}S` as MessageKey)}</small>
              </button>
            ))}
          </div>
          <div className="ed-role-screen">
            <img src={`${IMG}/${shown.image}.webp`} alt={t(`lp.proof.${role}A` as MessageKey)} loading="lazy" width={1536} height={1024} />
            <div>
              <p>{t(`lp.proof.${role}L` as MessageKey)}</p>
              <h3>{t(`lp.proof.${role}T` as MessageKey)}</h3>
              <a href={`/api/demo/start?role=${role}`} data-umami-event={`lp-role-${role}`}>{t('lp.proof.open')} <span>↗</span></a>
            </div>
          </div>
        </section>

        <section className="ed-pricing" id="tarifs">
          <div className="ed-section-index"><p className="ed-kicker ed-dark"><span /> {t('lp.pricing.kicker')}</p><b>05 / 05</b></div>
          <div className="ed-pricing-head"><h2>{t('lp.pricing.title1')}<br /><em>{t('lp.pricing.title2')}</em></h2><p>{priced ? t('lp.pricing.leadPriced', { currency }) : t('lp.pricing.leadQuote')}</p></div>
          <div className="ed-pricing-grid">
            {paid.map((plan) => {
              const words = planWords(plan, locale);
              const price = plan.priceMinor > 0 && plan.code !== 'enterprise';
              return (
                <article key={plan.code} className={words.highlight ? 'ed-featured' : undefined}>
                  {words.highlight ? <b>{t('lp.offer.recommended').toUpperCase()}</b> : null}
                  <span>{words.name.toUpperCase()}</span>
                  <h3 className={price ? 'ed-priced' : undefined}>{price ? <>{formatMoney(locale, plan.priceMinor, plan.currencyCode)}<small>{t('lp.pricing.perMonth')}</small></> : t('lp.pricing.onQuote')}</h3>
                  <p>{tagline(plan.code, words.tagline)}</p>
                  <ul>
                    <li>{plan.maxUsers ? t('landing.users', { n: plan.maxUsers }) : t('landing.usersUnlimited')}</li>
                    <li>{plan.maxProjects ? t('landing.projects', { n: plan.maxProjects }) : t('landing.projectsUnlimited')}</li>
                    {words.highlight ? <li>{t('lp.pricing.setup')}</li> : null}
                    {plan.code === 'enterprise' ? <li>{t('lp.pricing.dedicated')}</li> : null}
                  </ul>
                  <a href="#rappel" data-umami-event={`lp-plan-${plan.code}`}>{t('lp.pricing.talk')}</a>
                  {trial.public && plan.code !== 'enterprise' ? <a className="ed-plan-trial" href="/signup" data-umami-event={`lp-trial-${plan.code}`}>{t('lp.trial.short', { n: trial.days })}</a> : null}
                </article>
              );
            })}
          </div>
          <div className="ed-risk-strip">{[...(trial.public ? [t('lp.trial.free', { n: trial.days })] : []), ...list('lp.pricing.risk')].map((item) => <span key={item}>{item}</span>)}</div>
        </section>

        <section className="ed-final" id="rappel">
          <img src={`${IMG}/handover-future.webp`} alt={t('lp.final.alt')} loading="lazy" width={1672} height={941} />
          <div className="ed-final-panel">
            <p className="ed-kicker ed-light"><span /> {t('lp.final.kicker')}</p>
            <h2>{t('lp.final.title1')}<br /><em>{t('lp.final.title2')}</em></h2>
            <CallBack />
          </div>
        </section>
      </main>
      <EdFooter />
    </div>
  );
}
