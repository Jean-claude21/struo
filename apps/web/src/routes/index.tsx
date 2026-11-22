// Public landing (spec 060, after 045). Built on the offer method validated with the founder: say
// who it is for and the outcome (sites under control in 30 days, without evenings on the phone),
// make the pain felt in scenes, price the cost of doing nothing with the visitor's own figures, show
// the day it leads to, stack what we do for them (the 30-day setup), prove by opening the demo, then
// the price of their country with everything that removes the risk. No guarantee, no invented
// customer, no figure we cannot source. The photos are illustrations, shown whole.
import { createFileRoute, getRouteApi, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react';
import { Logo, PublicHeader } from '@/components/PublicHeader.tsx';
import { formatMoney } from '@/components/ui.tsx';
import { COUNTRY_COOKIE, sortedCountries } from '@/features/settings/countries.ts';
import { getPlans, sendContactRequest } from '@/features/settings/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';
import { trackSuccess } from '@/lib/audience.ts';
import { planWords, Rich } from '@/components/PlanWords.tsx';
import { LegalLinks } from '@/components/Legal.tsx';

export const Route = createFileRoute('/')({
  loader: () => getPlans(),
  component: Landing,
});

const root = getRouteApi('__root__');

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
const PHOTO = { width: 1536, height: 1024 } as const;

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
    { href: '#probleme', label: t('lp.nav.problem') }, { href: '#offre', label: t('lp.nav.offer') },
    { href: '#preuve', label: t('lp.nav.proof') }, { href: '#prix', label: t('lp.nav.pricing') }, { href: '#questions', label: t('lp.nav.faq') },
  ];
  const chooseCountry = async (code: string) => {
    document.cookie = `${COUNTRY_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    await router.invalidate();
  };
  const call = <a href="#rappel" className="lx-btn primary" data-umami-event="lp-call-hero">{t('lp.hero.call')}<ArrowRight size={18} /></a>;
  return (
    <div className="lx lp">
      <div className="lx-top"><div className="lx-wrap"><PublicHeader signedIn={Boolean(viewer)} nav={nav} cta={{ href: '#rappel', label: t('lp.cta') }} /></div></div>

      {/* 1. Who it is for, the outcome, the delay, no effort. */}
      <section className="lp-hero">
        <div className="lx-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-kicker">{t('lp.hero.kicker')}</p>
            <h1>{t('lp.hero.title1')} <em>{t('lp.hero.title2')}</em></h1>
            <p className="lp-lead">{t('lp.hero.lead')}</p>
            <div className="lp-actions">
              {call}
              <Link to="/demo" className="lp-link light" data-umami-event="lp-demo-hero">{t('lp.hero.demo')}</Link>
            </div>
            <ul className="lp-reassure">{list('lp.hero.reassure').map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
          </div>
          <figure className="lp-hero-visual">
            <img src="/landing/owner-paid.webp" alt={t('lp.hero.photoAlt')} {...PHOTO} />
            <div className="lp-today" aria-label={t('lp.hero.todayLabel')}>
              <div className="lp-today-head"><span>{t('lp.hero.today')}</span><span className="lp-live">{t('lp.hero.live')}</span></div>
              <ol>
                {([['07:42', 'KC-01', 's1', 'ok'], ['10:15', 'KC-03', 's2', 'warn'], ['12:03', 'KC-02', 's3', 'ok']] as const).map(([time, code, key, tone]) => (
                  <li key={key}>
                    <span className="lp-time"><time>{time}</time> {code} · {t(`lp.hero.${key}t` as MessageKey)}</span>
                    <span className="lp-signal">{t(`lp.hero.${key}` as MessageKey)}</span>
                    <span className={`lp-chip ${tone}`}>{tone === 'ok' ? t('lp.hero.ok') : t('lp.hero.watch')}</span>
                  </li>
                ))}
              </ol>
              <div className="lp-today-foot">{t('lp.hero.foot')}</div>
            </div>
          </figure>
        </div>
      </section>

      {/* 2. The pain, in scenes. */}
      <section className="lp-section" id="probleme">
        <div className="lx-wrap lp-split">
          <div>
            <p className="lp-kicker">{t('lp.pain.kicker')}</p>
            <h2>{t('lp.pain.title1')} <em>{t('lp.pain.title2')}</em></h2>
            <ul className="lp-scenes">
              {(['s1', 's2', 's3'] as const).map((key) => <li key={key}><b>{t(`lp.pain.${key}b` as MessageKey)}</b> {t(`lp.pain.${key}` as MessageKey)}</li>)}
            </ul>
            <p className="lp-punch">{t('lp.pain.punch1')} <em>{t('lp.pain.punch2')}</em></p>
          </div>
          <img className="lp-photo" src="/landing/whatsapp-chaos.webp" alt={t('lp.pain.alt')} loading="lazy" {...PHOTO} />
        </div>
      </section>

      {/* 3. The cost of doing nothing, with the visitor's own figures. */}
      <section className="lp-section lp-paper2">
        <div className="lx-wrap">
          <p className="lp-kicker">{t('lp.cost.kicker')}</p>
          <h2 className="lp-title-wide">{t('lp.cost.title1')} <em>{t('lp.cost.title2')}</em></h2>
          <p className="lp-lead">{t('lp.cost.lead')}</p>
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

      {/* 4. The day it leads to. */}
      <section className="lp-section">
        <div className="lx-wrap lp-day">
          <div className="lp-day-side">
            <p className="lp-kicker">{t('lp.day.kicker')}</p>
            <h2>{t('lp.day.title1')} <em>{t('lp.day.title2')}</em></h2>
            <p className="lp-lead">{t('lp.day.lead')}</p>
            <img src="/landing/manager-office.webp" alt={t('lp.day.alt')} loading="lazy" {...PHOTO} />
          </div>
          <ol className="lp-timeline">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <li key={n} className={n === 5 ? 'end' : undefined}>
                <time>{t(`lp.day.t${n}` as MessageKey)}</time>
                <div>
                  <h3>{t(`lp.day.h${n}` as MessageKey)}</h3>
                  <p>{t(`lp.day.b${n}` as MessageKey)}</p>
                  {n === 2 ? <div className="lp-thumb"><img src="/landing/hero-site-lead.webp" alt="" loading="lazy" {...PHOTO} /><div><b>{t('lp.day.r2t')}</b><span>{t('lp.day.r2m')}</span><span className="lp-val">{t('lp.day.r2v')}</span></div></div> : null}
                  {n === 3 ? <div className="lp-thumb"><img src="/landing/client-phone.webp" alt="" loading="lazy" {...PHOTO} /><div><b>{t('lp.day.r3t')}</b><span>{t('lp.day.r3m')}</span></div></div> : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 5. The offer: what we do for them, and what each step saves them. */}
      <section className="lp-section lp-ink" id="offre">
        <div className="lx-wrap">
          <div className="lp-offer-head">
            <div>
              <span className="lp-offer-name">{t('lp.offer.name')}</span>
              <h2>{t('lp.offer.title1')} <em>{t('lp.offer.title2')}</em></h2>
            </div>
            <p className="lp-lead">{t('lp.offer.lead')}</p>
          </div>
          <div className="lp-stack">
            <div className="lp-stack-head" aria-hidden="true"><span /><span>{t('lp.offer.colDo')}</span><span>{t('lp.offer.colSaves')}</span></div>
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <div key={n} className="lp-stack-row">
                <span>{String(n).padStart(2, '0')}</span>
                <div><h3>{t(`lp.offer.s${n}t` as MessageKey)}</h3><p>{t(`lp.offer.s${n}b` as MessageKey)}</p></div>
                <p className="lp-saves"><small>{t('lp.offer.savesLabel')}</small>{t(`lp.offer.s${n}s` as MessageKey)}</p>
              </div>
            ))}
          </div>
          <div className="lp-offer-photos">
            <figure><img src="/landing/team-morning.webp" alt={t('lp.offer.alt1')} loading="lazy" {...PHOTO} /><figcaption>{t('lp.offer.cap1')}</figcaption></figure>
            <figure><img src="/landing/milestone-signature.webp" alt={t('lp.offer.alt2')} loading="lazy" {...PHOTO} /><figcaption>{t('lp.offer.cap2')}</figcaption></figure>
          </div>
          <div className="lp-then">
            <h3>{t('lp.offer.thenTitle')}</h3>
            <ul>{list('lp.offer.then').map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="lp-offer-cta">
            <a href="#rappel" className="lx-btn primary" data-umami-event="lp-call-offer">{t('lp.cta')}<ArrowRight size={18} /></a>
            <p>{t('lp.offer.ctaText')}</p>
          </div>
        </div>
      </section>

      {/* 6. Proof: open it. */}
      <section className="lp-section" id="preuve">
        <div className="lx-wrap lp-proof">
          <div>
            <p className="lp-kicker">{t('lp.proof.kicker')}</p>
            <h2>{t('lp.proof.title1')} <em>{t('lp.proof.title2')}</em></h2>
            <p className="lp-lead">{t('lp.proof.lead')}</p>
            <img className="lp-photo" src="/landing/hero-proof.webp" alt={t('lp.proof.alt')} loading="lazy" {...PHOTO} />
          </div>
          <ul className="lp-roles-list">
            {ROLES.map((role) => (
              <li key={role}>
                <a href={`/api/demo/start?role=${role}`} data-umami-event={`lp-role-${role}`}>
                  <b>{t(`demo.roles.${role}` as MessageKey)}</b>
                  <span>{t(`lp.proof.${role}` as MessageKey)}</span>
                  <em>{t('lp.proof.open')}<ArrowRight size={15} /></em>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7. The price of the visitor's country, then everything that removes the risk. */}
      <section className="lp-section lp-paper2" id="prix">
        <div className="lx-wrap">
          <div className="lp-pricing-head">
            <div><p className="lp-kicker">{t('lp.offer.pricingKicker')}</p><h2>{t('lp.offer.pricingTitle1')} <em>{t('lp.offer.pricingTitle2')}</em></h2></div>
            <label className="lp-country">{t('lp.offer.country')}
              <select value={country} onChange={(event) => void chooseCountry(event.target.value)}>
                {countries.map((item) => <option key={item.code} value={item.code} suppressHydrationWarning>{item.name} · {item.currency}</option>)}
              </select>
            </label>
          </div>
          <div className="lp-plans">
            {paid.map((plan) => { const words = planWords(plan, locale); const quote = plan.code === 'enterprise' || plan.priceMinor === 0; return (
              <article key={plan.code} className={`lp-plan ${words.highlight ? 'pro' : ''}`}>
                <div className="lp-plan-top"><span>{words.tagline}</span>{words.highlight ? <span className="lp-tag solid">{t('lp.offer.recommended')}</span> : null}</div>
                <h3>{words.name}</h3>
                <p className={`lp-price ${plan.priceMinor > 0 ? '' : 'quote'}`}>{plan.priceMinor > 0 ? <>{formatMoney(locale, plan.priceMinor, plan.currencyCode)} <small>{t('lp.offer.perMonth')}</small></> : t('lp.offer.onQuote')}</p>
                <ul>
                  {words.highlight ? <li className="lp-included">{t('lp.offer.included')}</li> : null}
                  <li>{plan.maxUsers ? t('landing.users', { n: plan.maxUsers }) : t('landing.usersUnlimited')}</li>
                  <li>{plan.maxProjects ? t('landing.projects', { n: plan.maxProjects }) : t('landing.projectsUnlimited')}</li>
                  {words.bullets.map((item) => <li key={item}><Rich text={item} /></li>)}
                </ul>
                {quote
                  ? <a href="#rappel" className="lx-btn outline" data-umami-event={`lp-plan-${plan.code}`}>{t('lp.offer.talk')}<ArrowRight size={17} /></a>
                  : words.highlight
                    ? <a href="#rappel" className="lx-btn primary" data-umami-event={`lp-plan-${plan.code}`}>{t('lp.cta')}<ArrowRight size={17} /></a>
                    : <Link to="/signup" className="lx-btn outline" data-umami-event={`lp-plan-${plan.code}`}>{t('lp.offer.trial')}<ArrowRight size={17} /></Link>}
              </article>
            ); })}
          </div>
          <p className="lp-currency">{paid.some((plan) => plan.code !== 'enterprise' && plan.priceMinor === 0) ? t('lp.offer.quoteHint') : t('lp.offer.currencyNote', { currency })}</p>
          <div className="lp-risk">
            <h3>{t('lp.offer.riskTitle')}</h3>
            <ul>{list('lp.offer.risk').map((item) => { const [title, text] = item.split('::'); return <li key={title}><b>{title}</b><span>{text}</span></li>; })}</ul>
          </div>
        </div>
      </section>

      {/* 8. What stops them from signing. */}
      <section className="lp-section" id="questions">
        <div className="lx-wrap lp-faq">
          <div><p className="lp-kicker">{t('lp.faq.kicker')}</p><h2>{t('lp.faq.title1')} <em>{t('lp.faq.title2')}</em></h2></div>
          <div className="lp-answers">
            {([1, 2, 3, 4, 5, 6, 7, 8] as const).map((n) => (
              <details key={n} open={n === 1}><summary>{t(`lp.faq.q${n}` as MessageKey)}</summary><p>{t(`lp.faq.a${n}` as MessageKey)}</p></details>
            ))}
          </div>
        </div>
      </section>

      {/* 9. The last call: one action. */}
      <section className="lp-section lp-ink lp-final2" id="rappel">
        <div className="lx-wrap lp-final-grid">
          <div>
            <p className="lp-kicker">{t('lp.final.kicker')}</p>
            <h2>{t('lp.final.title1')} <em>{t('lp.final.title2')}</em></h2>
            <p className="lp-lead">{t('lp.final.lead')}</p>
            <img className="lp-photo" src="/landing/handover-keys.webp" alt={t('lp.final.alt')} loading="lazy" {...PHOTO} />
          </div>
          <div className="lp-form-card">
            <h3>{t('lp.final.formTitle')}</h3>
            <ContactForm />
            <p className="lp-alt"><Link to="/demo" className="lp-link" data-umami-event="lp-demo-final">{t('lp.final.demoFirst')}<ArrowUpRight size={16} /></Link></p>
          </div>
        </div>
      </section>

      <footer className="lx-wrap lp-footer">
        <Logo />
        <span className="lp-sign">{t('app.tagline')}</span>
        <span>{t('lp.footer.latin')}</span>
        <span className="lp-sources">{t('lp.footer.sources')} : <a href="https://www.autodesk.com/blogs/construction/construction-disconnected-fmi-report/" rel="noopener noreferrer">{t('lp.footer.source1')}</a></span>
        <Link to="/login">{t('landing.signIn')}</Link>
        <LegalLinks />
      </footer>
    </div>
  );
}
