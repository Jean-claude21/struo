// Public landing (spec 080): « Build your company as well as you build », written with the Kete
// Product Framework (docs/product/strategy-sheet.md): identity line + plain description, the four
// losses of control, the cost (the visitor's own estimate), from disorder to control, four pillars
// each shown by a real screen of Struo (demo company), the five roles and their demo, the field
// without network, the 30-day setup, honest proof (the tool itself, no invented result), prices of
// the visitor's country, objections, call-back. Styles under `.ed2` (classes h-), header/footer `.ed`.
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

/** The five roles, each with a real screen of the demo company. */
const ROLES = [
  { key: 'owner', image: 'cap-owner-today' },
  { key: 'engineer', image: 'cap-engineer-field' },
  { key: 'site_lead', image: 'cap-field-home' },
  { key: 'accountant', image: 'cap-owner-finance' },
  { key: 'client', image: 'cap-client-home' },
] as const;

// Starting value of one working hour per currency: an editable assumption, never a claim.
const HOURLY: Record<string, number> = {
  EUR: 15, USD: 18, GBP: 15, CAD: 25, CHF: 35, MAD: 80, TND: 15, DZD: 600, XOF: 2500, XAF: 2500,
  NGN: 3500, GHS: 60, KES: 600, RWF: 3500, CDF: 8000, GNF: 25000, MGA: 12000,
};
const decimals = (currency: string) => new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;

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

/** The call-back request (spec 045): only the name and a way to reach are required. */
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
  if (state === 'sent') return <div className="h-final-form"><h3>{t('lp.final.formTitle')}</h3><p className="h-sent" role="status">{t('lp.final.sent')}</p></div>;
  return (
    <form className="h-final-form" onSubmit={(event) => void submit(event)}>
      <h3>{t('lp.final.formTitle')}</h3>
      <label><span>{t('lp.final.name')} <i aria-hidden="true">*</i></span><input name="name" required aria-required="true" maxLength={120} autoComplete="name" /></label>
      <label><span>{t('lp.final.company')}</span><input name="company" maxLength={160} autoComplete="organization" /></label>
      <label><span>{t('lp.final.reach')} <i aria-hidden="true">*</i></span><input name="reach" required aria-required="true" minLength={3} maxLength={160} autoComplete="tel" /></label>
      <label><span>{t('lp.final.sites')}</span><input name="sites" type="number" min={0} max={10000} inputMode="numeric" /></label>
      <input name="website" tabIndex={-1} autoComplete="off" className="ed-trap" aria-hidden="true" />
      <p className="h-req"><i aria-hidden="true">*</i> {t('lp.final.required')}</p>
      {state === 'error' ? <p className="ed-error" role="alert">{t('lp.final.error')}</p> : null}
      <button type="submit" disabled={state === 'sending'} data-umami-event="lp-contact">{state === 'sending' ? t('lp.final.sending') : `${t('lp.final.send')} →`}</button>
      <a className="h-small" href="#equipe">{t('lp.final.demoFirst')}</a>
    </form>
  );
}

function Browser({ src, alt, label }: { src: string; alt: string; label: string }) {
  return (
    <figure className="h-browser">
      <div className="h-browser-bar"><i /><i /><i /><span>{label}</span></div>
      <img src={`${IMG}/${src}.webp`} alt={alt} loading="lazy" />
    </figure>
  );
}

function Phone({ src, alt, big = false }: { src: string; alt: string; big?: boolean }) {
  return <figure className={`h-phone${big ? ' h-big' : ''}`}><img src={`${IMG}/${src}.webp`} alt={alt} loading="lazy" /></figure>;
}

function Landing() {
  const { t, locale } = useI18n();
  const { plans, currency, country, trial } = Route.useLoaderData();
  const [role, setRole] = useState<(typeof ROLES)[number]['key']>('owner');
  const shown = ROLES.find((item) => item.key === role)!;
  const list = (key: MessageKey) => t(key).split('|');
  const paid = plans.filter((plan) => plan.code !== 'trial');
  const priced = paid.some((plan) => plan.priceMinor > 0 && plan.code !== 'enterprise');
  const tagline = (code: string, fallback: string) => (['starter', 'pro', 'enterprise'].includes(code) ? t(`lp.pricing.${code}` as MessageKey) : fallback);
  useEffect(() => {
    const seen = new Set<string>();
    const watch = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target.id)) continue;
        seen.add(entry.target.id);
        trackEvent(entry.target.id === 'tarifs' ? 'lp-pricing-seen' : 'lp-proof-seen');
      }
    }, { threshold: 0.35 });
    for (const id of ['equipe', 'tarifs']) { const node = document.getElementById(id); if (node) watch.observe(node); }
    return () => watch.disconnect();
  }, []);
  const index = (n: number) => <b>{String(n).padStart(2, '0')} / 08</b>;
  return (
    <div className="ed ed2">
      <EdHeader />
      <main>
        {/* 01 · Accroche */}
        <section className="h-hero">
          <div className="h-hero-copy">
            <p className="h-kicker h-light"><span /> {t('lp.hero.kicker')}</p>
            <h1>{t('lp.hero.title1')} <em>{t('lp.hero.title2')}</em></h1>
            <p className="h-hero-lead">{t('lp.hero.lead')}</p>
            <div className="h-hero-actions">
              <a className="h-button h-button-orange" href="#rappel" data-umami-event="lp-call-hero">{t('lp.hero.call')} <span>→</span></a>
              <a className="h-under-link" href="#equipe" data-umami-event="lp-demo-hero">{t('lp.hero.demo')} <span>↗</span></a>
            </div>
            {trial.public ? <a className="h-trial-link" href="/signup" data-umami-event="lp-trial-hero">{t('lp.trial.link', { n: trial.days })} →</a> : null}
            <ul className="h-reassure">{list('lp.hero.reassure').map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="h-hero-visual">
            <figure className="h-browser"><div className="h-browser-bar"><i /><i /><i /><span>{t('lp.hero.screen')}</span></div><img src={`${IMG}/cap-owner-today.webp`} alt={t('lp.hero.officeAlt')} /></figure>
            <figure className="h-phone"><img src={`${IMG}/cap-field-home.webp`} alt={t('lp.hero.fieldAlt')} /></figure>
          </div>
        </section>

        <div className="h-ticker"><div>{list('lp.ticker').map((word, i, all) => <span key={word} style={{ display: 'contents' }}><span>{word}</span>{i < all.length - 1 ? <i>✦</i> : null}</span>)}</div></div>

        {/* 02 · Problème */}
        <section className="h-problem" id="probleme">
          <div className="h-section-index"><p className="h-kicker h-dark"><span /> {t('lp.problem.kicker')}</p>{index(1)}</div>
          <div className="h-split">
            <div>
              <h2>{t('lp.problem.title1')} <em>{t('lp.problem.title2')}</em></h2>
              <div className="h-pains">
                {([1, 2, 3, 4] as const).map((n) => <article key={n}><b>{String(n).padStart(2, '0')}</b><h3>{t(`lp.problem.p${n}t` as MessageKey)}</h3><p>{t(`lp.problem.p${n}b` as MessageKey)}</p></article>)}
              </div>
            </div>
            <figure className="h-photo"><img src={`${IMG}/problem-chaos.webp`} alt={t('lp.problem.alt')} loading="lazy" /><figcaption>{t('lp.problem.caption')}</figcaption></figure>
          </div>
        </section>

        {/* 03 · Enjeux */}
        <section className="h-cost" id="calcul">
          <div className="h-cost-copy">
            <p className="h-kicker h-light"><span /> {t('lp.cost.kicker')}</p>
            <h2>{t('lp.cost.title1')} <em>{t('lp.cost.title2')}</em></h2>
            <p>{t('lp.cost.lead1')} <strong>{t('lp.cost.leadStrong')}</strong> {t('lp.cost.lead2')}</p>
            <small>{t('lp.cost.source')}</small>
          </div>
          <Calculator currency={currency} country={country} />
        </section>

        {/* 04 · Transformation */}
        <section className="h-transform">
          <div className="h-section-index"><p className="h-kicker h-dark"><span /> {t('lp.transform.kicker')}</p>{index(2)}</div>
          <h2>{t('lp.transform.title1')} <em>{t('lp.transform.title2')}</em></h2>
          <div className="h-before-after">
            <article className="h-before">
              <p className="h-tag">{t('lp.transform.before')}</p>
              <ul>{([1, 2, 3, 4] as const).map((n) => <li key={n}>{t(`lp.transform.b${n}` as MessageKey)}</li>)}</ul>
              <img src={`${IMG}/problem-chaos.webp`} alt="" loading="lazy" />
            </article>
            <article className="h-after">
              <p className="h-tag">{t('lp.transform.after')}</p>
              <ul>{([1, 2, 3, 4] as const).map((n) => <li key={n}>{t(`lp.transform.a${n}` as MessageKey)}</li>)}</ul>
              <img src={`${IMG}/cap-owner-today.webp`} alt={t('lp.transform.afterAlt')} loading="lazy" />
            </article>
          </div>
        </section>

        {/* 05–06 · Solution, piliers */}
        <section className="h-pillars" id="piliers">
          <div className="h-section-index h-light-index"><p className="h-kicker h-light"><span /> {t('lp.pillars.kicker')}</p>{index(3)}</div>
          <div className="h-head"><h2>{t('lp.pillars.title1')} <em>{t('lp.pillars.title2')}</em></h2><p>{t('lp.pillars.lead')}</p></div>
          <div className="h-pillar">
            <div><span>{t('lp.pillars.f')}</span><h3>{t('lp.pillars.ft')}</h3><p>{t('lp.pillars.fb')}</p></div>
            <Browser src="cap-owner-finance" alt={t('lp.pillars.ft')} label={t('lp.pillars.fs')} />
          </div>
          <div className="h-pillar h-reverse">
            <div><span>{t('lp.pillars.o')}</span><h3>{t('lp.pillars.ot')}</h3><p>{t('lp.pillars.ob')}</p></div>
            <Browser src="cap-engineer-planning" alt={t('lp.pillars.ot')} label={t('lp.pillars.os')} />
          </div>
          <div className="h-pillar">
            <div><span>{t('lp.pillars.a')}</span><h3>{t('lp.pillars.at')}</h3><p>{t('lp.pillars.ab')}</p></div>
            <Browser src="cap-owner-indicators" alt={t('lp.pillars.at')} label={t('lp.pillars.as')} />
          </div>
          <div className="h-pillar h-reverse">
            <div><span>{t('lp.pillars.c')}</span><h3>{t('lp.pillars.ct')}</h3><p>{t('lp.pillars.cb')}</p></div>
            <Phone src="cap-client-home" alt={t('lp.pillars.ct')} big />
          </div>
        </section>

        {/* 08 · Démonstration */}
        <section className="h-team" id="equipe">
          <div className="h-section-index"><p className="h-kicker h-dark"><span /> {t('lp.team.kicker')}</p>{index(4)}</div>
          <div className="h-head"><h2>{t('lp.team.title1')} <em>{t('lp.team.title2')}</em></h2><p>{t('lp.team.lead')}</p></div>
          <div className="h-roles" role="tablist">
            {ROLES.map((item, i) => (
              <button key={item.key} type="button" role="tab" aria-selected={item.key === role} className={`h-role${item.key === role ? ' h-active' : ''}`} onClick={() => setRole(item.key)}>
                <span>{String(i + 1).padStart(2, '0')}</span><b>{t(`lp.team.${item.key}` as MessageKey)}</b><small>{t(`lp.team.${item.key}S` as MessageKey)}</small>
              </button>
            ))}
          </div>
          <div className="h-role-screen">
            <div className="h-role-visual"><img src={`${IMG}/${shown.image}.webp`} alt={t(`lp.team.${role}` as MessageKey)} loading="lazy" /></div>
            <div className="h-role-text">
              <p>{t(`lp.team.${role}` as MessageKey)}</p>
              <h3>{t(`lp.team.${role}T` as MessageKey)}</h3>
              <a href={`/api/demo/start?role=${role}`} data-umami-event={`lp-role-${role}`}>{t('lp.team.open')} <span>↗</span></a>
            </div>
          </div>
        </section>

        {/* 07 · Différenciation */}
        <section className="h-field">
          <div className="h-field-copy">
            <p className="h-kicker h-light"><span /> {t('lp.field.kicker')}</p>
            <h2>{t('lp.field.title1')} <em>{t('lp.field.title2')}</em></h2>
            <p>{t('lp.field.lead')}</p>
            <ul className="h-diff">{([1, 2, 3, 4, 5] as const).map((n) => <li key={n}><b>{t(`lp.field.d${n}b` as MessageKey)}</b> {t(`lp.field.d${n}` as MessageKey)}</li>)}</ul>
          </div>
          <Phone src="cap-field-home" alt={t('lp.field.alt')} big />
        </section>

        {/* Offre : la mise en ordre en 30 jours */}
        <section className="h-offer" id="offre">
          <div className="h-section-index h-light-index"><p className="h-kicker h-light"><span /> {t('lp.offer.kicker')}</p>{index(5)}</div>
          <div className="h-head"><h2>{t('lp.offer.title1')} <em>{t('lp.offer.title2')}</em></h2><p>{t('lp.offer.lead')}</p></div>
          <div className="h-steps">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <article key={n}><span>{String(n).padStart(2, '0')}</span><h3>{t(`lp.offer.s${n}t` as MessageKey)}</h3><p>{t(`lp.offer.s${n}b` as MessageKey)}</p><b>{t(`lp.offer.s${n}s` as MessageKey)}</b></article>
            ))}
          </div>
        </section>

        {/* 09 · Preuves */}
        <section className="h-proof" id="preuve">
          <div className="h-section-index"><p className="h-kicker h-dark"><span /> {t('lp.proof.kicker')}</p>{index(6)}</div>
          <div className="h-split">
            <div>
              <h2>{t('lp.proof.title1')} <em>{t('lp.proof.title2')}</em></h2>
              <p className="h-lead">{t('lp.proof.lead')}</p>
              <a className="h-under-link h-dark-link" href="#equipe">{t('lp.proof.open')} <span>↗</span></a>
            </div>
            <Browser src="cap-engineer-field" alt={t('lp.proof.alt')} label={t('lp.proof.screen')} />
          </div>
        </section>

        {/* 10 · Tarifs */}
        <section className="h-pricing" id="tarifs">
          <div className="h-section-index"><p className="h-kicker h-dark"><span /> {t('lp.pricing.kicker')}</p>{index(7)}</div>
          <div className="h-head"><h2>{t('lp.pricing.title1')} <em>{t('lp.pricing.title2')}</em></h2><p>{priced ? t('lp.pricing.leadPriced', { currency }) : t('lp.pricing.leadQuote')}</p></div>
          <div className="h-plans">
            {paid.map((plan) => {
              const words = planWords(plan, locale);
              const price = plan.priceMinor > 0 && plan.code !== 'enterprise';
              return (
                <article key={plan.code} className={words.highlight ? 'h-featured' : undefined}>
                  {words.highlight ? <b>{t('lp.offer.recommended').toUpperCase()}</b> : null}
                  <span>{words.name.toUpperCase()}</span>
                  <h3>{price ? <>{formatMoney(locale, plan.priceMinor, plan.currencyCode)} <small>{t('lp.pricing.perMonth')}</small></> : t('lp.pricing.onQuote')}</h3>
                  <p>{tagline(plan.code, words.tagline)}</p>
                  <ul>
                    {words.highlight ? <li>{t('lp.pricing.setup')}</li> : null}
                    <li>{plan.maxUsers ? t('landing.users', { n: plan.maxUsers }) : t('landing.usersUnlimited')}</li>
                    <li>{plan.maxProjects ? t('landing.projects', { n: plan.maxProjects }) : t('landing.projectsUnlimited')}</li>
                    {plan.code === 'enterprise' ? <li>{t('lp.pricing.dedicated')}</li> : null}
                  </ul>
                  <a href="#rappel" data-umami-event={`lp-plan-${plan.code}`}>{t('lp.pricing.talk')}</a>
                  {trial.public && plan.code !== 'enterprise' ? <a className="h-small" href="/signup" data-umami-event={`lp-trial-${plan.code}`}>{t('lp.trial.short', { n: trial.days })}</a> : null}
                </article>
              );
            })}
          </div>
          <div className="h-risk">{[...(trial.public ? [t('lp.trial.free', { n: trial.days })] : []), ...list('lp.pricing.risk')].map((item) => <span key={item}>{item}</span>)}</div>
        </section>

        {/* 11 · Objections */}
        <section className="h-faq" id="questions">
          <div className="h-section-index"><p className="h-kicker h-dark"><span /> {t('lp.faq.kicker')}</p>{index(8)}</div>
          <div className="h-split">
            <h2>{t('lp.faq.title1')} <em>{t('lp.faq.title2')}</em></h2>
            <div className="h-answers">
              {([1, 2, 3, 4, 5, 6] as const).map((n) => <details key={n} open={n === 1}><summary>{t(`lp.faq.q${n}` as MessageKey)}</summary><p>{t(`lp.faq.a${n}` as MessageKey)}</p></details>)}
            </div>
          </div>
        </section>

        {/* 12 · Conversion */}
        <section className="h-final" id="rappel">
          <div className="h-final-copy">
            <p className="h-kicker h-light"><span /> {t('lp.final.kicker')}</p>
            <h2>{t('lp.final.title1')} <em>{t('lp.final.title2')}</em></h2>
            <p>{t('lp.final.lead')}</p>
            <img src={`${IMG}/handover-future.webp`} alt={t('lp.final.alt')} loading="lazy" />
          </div>
          <CallBack />
        </section>
      </main>
      <EdFooter />
    </div>
  );
}
