// Public landing (spec 028), built on Alex Hormozi's offer structure: the dream outcome first, the
// pains it removes, how it works, the full value stack per person, why it fits here, risk removed,
// a simple price, objections answered, one last call. No invented testimonial, figure or guarantee.
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';
import {
  ArrowRight, BadgeCheck, Banknote, Bot, Check, ClipboardCheck, CloudOff, Download, FileWarning, Globe2, HardHat, Lock, MessageCircle,
  PhoneCall, Receipt, ShieldCheck, Smartphone, Undo2, Wallet, Wifi,
} from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { Progress, StatusChip } from '@/components/kit.tsx';
import { formatMoney } from '@/components/ui.tsx';
import { getPlans } from '@/features/settings/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/')({
  loader: () => getPlans(),
  component: Landing,
});

const root = getRouteApi('__root__');

function Landing() {
  const { t, locale } = useI18n();
  const { plans } = Route.useLoaderData();
  const { viewer } = root.useLoaderData();
  const pains = [
    ['p1', Banknote], ['p2', CloudOff], ['p3', PhoneCall], ['p4', FileWarning],
  ] as const;
  const people = ['manager', 'engineer', 'lead', 'accountant', 'client'] as const;
  const why = [['w1', Wifi], ['w2', MessageCircle], ['w3', Smartphone], ['w4', Receipt], ['w5', Globe2], ['w6', Bot]] as const;
  const risk = [['r1', BadgeCheck], ['r2', Download], ['r3', Lock], ['r4', Undo2]] as const;
  return (
    <div className="landing">
      <div className="public" style={{ paddingBottom: 0 }}><PublicHeader signedIn={Boolean(viewer)} /></div>

      {/* 1. Dream outcome */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div className="stack loose">
            <span className="lp-eyebrow">{t('home.eyebrow')}</span>
            <h1>{t('home.heroTitle')}</h1>
            <p className="lp-lead">{t('home.heroSub')}</p>
            <div className="row">
              <Link to="/signup" className="btn large">{t('home.ctaTrial')}<ArrowRight size={18} /></Link>
              <a href="#how" className="btn secondary large">{t('home.ctaHow')}</a>
            </div>
            <span className="faint small">{t('home.micro')}</span>
          </div>
          <div className="lp-hero-visual">
            <img src="/landing/hero-site-lead.webp" alt="" width={800} height={500} />
            <div className="lp-float lp-float-a">
              <span className="sync-pill ok"><Check size={13} />{t('fieldApp.allSent')}</span>
              <b>P001 · Gros œuvre</b>
              <Progress value={55} />
            </div>
            <div className="lp-float lp-float-b">
              <StatusChip shape="done" label={t('field.validated')} />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Pains */}
      <section className="lp-section">
        <div className="lp-wrap">
          <h2 className="lp-h2">{t('home.painTitle')}</h2>
          <div className="lp-grid4">
            {pains.map(([key, Icon]) => (
              <div key={key} className="lp-card">
                <span className="lp-icon bad"><Icon size={22} /></span>
                <h3>{t(`home.pains.${key}t` as MessageKey)}</h3>
                <p>{t(`home.pains.${key}b` as MessageKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. How it works */}
      <section className="lp-section lp-alt" id="how">
        <div className="lp-wrap">
          <h2 className="lp-h2">{t('home.howTitle')}</h2>
          <p className="lp-sub">{t('home.howSub')}</p>
          <div className="lp-steps">
            {[['s1', '/landing/hero-site-lead.webp', HardHat], ['s2', '/landing/manager-office.webp', ClipboardCheck], ['s3', '/landing/client-phone.webp', Wallet]].map(([key, image, Icon], index) => {
              const StepIcon = Icon as typeof HardHat;
              return (
                <div key={key as string} className="lp-step">
                  <div className="lp-step-img"><img src={image as string} alt="" loading="lazy" /><span className="lp-step-n">{index + 1}</span></div>
                  <div className="row tight"><StepIcon size={18} style={{ color: 'var(--brand)' }} /><h3>{t(`home.how.${key}t` as MessageKey)}</h3></div>
                  <p>{t(`home.how.${key}b` as MessageKey)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Value stack */}
      <section className="lp-section">
        <div className="lp-wrap">
          <h2 className="lp-h2">{t('home.stackTitle')}</h2>
          <p className="lp-sub">{t('home.stackSub')}</p>
          <div className="lp-stack">
            {people.map((person) => (
              <div key={person} className="lp-card">
                <h3>{t(`home.stack.${person}` as MessageKey)}</h3>
                <ul className="lp-list">
                  {t(`home.stack.${person}Items` as MessageKey).split('|').map((item) => <li key={item}><Check size={16} />{item}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Why it fits here */}
      <section className="lp-section lp-dark">
        <div className="lp-wrap">
          <h2 className="lp-h2">{t('home.whyTitle')}</h2>
          <div className="lp-why">
            {why.map(([key, Icon]) => <div key={key} className="lp-why-item"><Icon size={22} /><span>{t(`home.why.${key}` as MessageKey)}</span></div>)}
          </div>
        </div>
      </section>

      {/* 6. Risk removed */}
      <section className="lp-section">
        <div className="lp-wrap">
          <h2 className="lp-h2">{t('home.riskTitle')}</h2>
          <div className="lp-grid4">
            {risk.map(([key, Icon]) => (
              <div key={key} className="lp-card">
                <span className="lp-icon ok"><Icon size={22} /></span>
                <h3>{t(`home.risk.${key}t` as MessageKey)}</h3>
                <p>{t(`home.risk.${key}b` as MessageKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Price */}
      <section className="lp-section lp-alt" id="pricing">
        <div className="lp-wrap">
          <h2 className="lp-h2">{t('home.pricingTitle')}</h2>
          <p className="lp-sub">{t('landing.pricingNote')}</p>
          <div className="lp-prices">
            {plans.filter((plan) => plan.code !== 'trial').map((plan) => (
              <div key={plan.code} className={`lp-card lp-price ${plan.code === 'pro' ? 'featured' : ''}`}>
                {plan.code === 'pro' ? <span className="badge brand" style={{ alignSelf: 'flex-start' }}>{t('home.recommended')}</span> : null}
                <h3>{plan.name}</h3>
                <div className="price">
                  {plan.priceMinor > 0 ? <>{formatMoney(locale, plan.priceMinor, plan.currencyCode)} <span className="muted small">{t('landing.perMonth')}</span></> : t('landing.onQuote')}
                </div>
                <ul className="lp-list">
                  <li><Check size={16} />{plan.maxUsers ? t('landing.users', { n: plan.maxUsers }) : t('landing.usersUnlimited')}</li>
                  <li><Check size={16} />{plan.maxProjects ? t('landing.projects', { n: plan.maxProjects }) : t('landing.projectsUnlimited')}</li>
                  <li><Check size={16} />{t('home.why.w1')}</li>
                  <li><Check size={16} />{t('home.why.w3')}</li>
                </ul>
                <Link to="/signup" className={`btn block ${plan.code === 'pro' ? '' : 'secondary'}`}>{t('home.ctaTrial')}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Objections */}
      <section className="lp-section">
        <div className="lp-wrap" style={{ maxWidth: 820 }}>
          <h2 className="lp-h2">{t('home.faqTitle')}</h2>
          <div className="stack">
            {[1, 2, 3, 4, 5].map((n) => (
              <details key={n} className="lp-faq">
                <summary>{t(`home.faq.q${n}` as MessageKey)}</summary>
                <p>{t(`home.faq.a${n}` as MessageKey)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 9. Last call */}
      <section className="lp-final">
        <div className="lp-wrap stack loose" style={{ alignItems: 'center', textAlign: 'center' }}>
          <ShieldCheck size={40} />
          <h2>{t('home.finalTitle')}</h2>
          <p>{t('home.finalSub')}</p>
          <Link to="/signup" className="btn large lp-btn-inverse">{t('home.ctaTrial')}<ArrowRight size={18} /></Link>
          <span className="small" style={{ opacity: .85 }}>{t('home.micro')}</span>
        </div>
      </section>
      <footer className="muted small" style={{ textAlign: 'center', padding: '2rem 1rem' }}>{t('landing.footer', { year: new Date().getFullYear() })}</footer>
    </div>
  );
}
