// The demo bar (spec 042): says the company is fictional and private to the visitor, lets them see
// Struo through every role's eyes, and leads to creating their own space.
import { ArrowRight, Eye } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';

const ROLES = [['owner', 'demo.roles.owner'], ['engineer', 'demo.roles.engineer'], ['site_lead', 'demo.roles.site_lead'], ['accountant', 'demo.roles.accountant'], ['client', 'demo.roles.client']] as const;

export function DemoBar({ role, expiresAt }: { role: string; expiresAt: string | null }) {
  const { t, locale } = useI18n();
  const until = expiresAt ? new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit', weekday: 'short' }).format(new Date(expiresAt)) : null;
  return (
    <div className="demo-bar" role="region" aria-label={t('demo.barLabel')}>
      <span className="demo-pill">{t('demo.pill')}</span>
      <span className="demo-text">{until ? t('demo.barText', { until }) : t('demo.barTextShared')}</span>
      <span className="demo-roles" role="group" aria-label={t('demo.seeAs')}>
        <Eye size={14} aria-hidden />
        {ROLES.map(([value, label]) => (
          <a key={value} href={`/api/demo/start?role=${value}`} className={value === role ? 'on' : ''} aria-current={value === role ? 'page' : undefined}>{t(label)}</a>
        ))}
      </span>
      <a className="demo-cta" href="/api/demo/leave" data-umami-event="demo-signup">{t('demo.create')}<ArrowRight size={14} /></a>
    </div>
  );
}
