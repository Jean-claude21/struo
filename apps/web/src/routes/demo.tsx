// Try without an account (spec 042): the visitor picks whose eyes to look through, and their own copy
// of a fictional company opens, signed in, for 24 hours. Nothing to type, nothing sent anywhere.
import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { useState, type MouseEvent } from 'react';
import { ArrowRight, Calculator, HardHat, Loader2, ShieldCheck } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/demo')({
  validateSearch: (search: Record<string, unknown>): { error?: string } => (typeof search.error === 'string' ? { error: search.error } : {}),
  component: Demo,
});
const root = getRouteApi('__root__');

const MAIN = [
  { role: 'owner', image: '/landing/owner-paid.webp' },
  { role: 'site_lead', image: '/landing/team-morning.webp' },
  { role: 'client', image: '/landing/diaspora-client.webp' },
] as const;

function Demo() {
  const { t } = useI18n();
  const { error } = Route.useSearch();
  const { viewer } = root.useLoaderData();
  const [opening, setOpening] = useState<string | null>(null);
  const open = (role: string) => (event: MouseEvent) => { event.preventDefault(); setOpening(role); window.location.href = `/api/demo/start?role=${role}`; };
  return (
    <div className="lx">
      <div className="lx-top"><div className="lx-wrap"><PublicHeader signedIn={Boolean(viewer)} /></div></div>
      <section className="lx-section lx-demo">
        <div className="lx-wrap">
          <h1 className="lx-narrow">{t('demo.page.title')}</h1>
          <p className="lx-lead lx-narrow">{t('demo.page.lead')}</p>
          {error ? <p className="notice lx-narrow" role="alert">{t(error === 'limit' ? 'demo.page.errLimit' : 'demo.page.errUnavailable')}</p> : null}
          <div className="lx-roles">
            {MAIN.map((item) => (
              <a key={item.role} href={`/api/demo/start?role=${item.role}`} onClick={open(item.role)} className="lx-role" data-umami-event={`demo-${item.role}`}>
                <img src={item.image} alt="" loading="lazy" />
                <div className="lx-role-body">
                  <span className="lx-tag">{t(`demo.roles.${item.role}` as MessageKey)}</span>
                  <h3>{t(`demo.page.${item.role}Title` as MessageKey)}</h3>
                  <p>{t(`demo.page.${item.role}Body` as MessageKey)}</p>
                  <span className="lx-role-go">{opening === item.role ? <><Loader2 size={16} className="spin" />{t('demo.page.preparing')}</> : <>{t('demo.page.open')}<ArrowRight size={16} /></>}</span>
                </div>
              </a>
            ))}
          </div>
          <div className="lx-roles-more">
            <span>{t('demo.page.alsoAs')}</span>
            <a href="/api/demo/start?role=engineer" onClick={open('engineer')}><HardHat size={15} />{t('demo.roles.engineer')}</a>
            <a href="/api/demo/start?role=accountant" onClick={open('accountant')}><Calculator size={15} />{t('demo.roles.accountant')}</a>
          </div>
          <p className="lx-demo-note"><ShieldCheck size={16} />{t('demo.page.note')}</p>
        </div>
      </section>
    </div>
  );
}
