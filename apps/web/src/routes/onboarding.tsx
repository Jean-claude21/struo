// Setting up a company (screens A1-A3): three steps — the company (country sets currency and VAT),
// the trade (site types, phases, required documents, pre-filled for construction and editable), then
// the team and the sites (invite, import the Excel file, or create the first site).
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ArrowRight, Building2, FileSpreadsheet, FolderPlus, Plus, UserPlus, X } from 'lucide-react';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { ErrorText, Field, formData, useAction } from '@/components/ui.tsx';
import { addConfigurationItem, createCompany, getConfiguration, removeConfigurationItem } from '@/features/settings/server.ts';
import { getShell, selectCompany } from '@/features/shell/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/onboarding')({
  loader: async () => {
    const { viewer } = await getShell();
    if (!viewer) throw redirect({ to: '/login', search: { next: '/onboarding' } });
    return { viewer };
  },
  component: Onboarding,
});

// Country → currency, VAT (%) and retention (%) usually applied; all editable.
const COUNTRIES: Record<string, { currency: string; vat: number; label: string }> = Object.fromEntries(Object.entries({
  DZ: { currency: 'DZD', vat: 19, label: 'Algérie' }, DE: { currency: 'EUR', vat: 19, label: 'Allemagne' }, BE: { currency: 'EUR', vat: 21, label: 'Belgique' },
  BJ: { currency: 'XOF', vat: 18, label: 'Bénin' }, BF: { currency: 'XOF', vat: 18, label: 'Burkina Faso' }, CM: { currency: 'XAF', vat: 19.25, label: 'Cameroun' },
  CA: { currency: 'CAD', vat: 5, label: 'Canada' }, CD: { currency: 'CDF', vat: 16, label: 'Congo (RDC)' }, CG: { currency: 'XAF', vat: 18, label: 'Congo' },
  CI: { currency: 'XOF', vat: 18, label: 'Côte d’Ivoire' }, ES: { currency: 'EUR', vat: 21, label: 'Espagne' }, US: { currency: 'USD', vat: 0, label: 'États-Unis' },
  FR: { currency: 'EUR', vat: 20, label: 'France' }, GA: { currency: 'XAF', vat: 18, label: 'Gabon' }, GH: { currency: 'GHS', vat: 15, label: 'Ghana' },
  GN: { currency: 'GNF', vat: 18, label: 'Guinée' }, IT: { currency: 'EUR', vat: 22, label: 'Italie' }, KE: { currency: 'KES', vat: 16, label: 'Kenya' },
  LU: { currency: 'EUR', vat: 17, label: 'Luxembourg' }, MG: { currency: 'MGA', vat: 20, label: 'Madagascar' }, ML: { currency: 'XOF', vat: 18, label: 'Mali' },
  MA: { currency: 'MAD', vat: 20, label: 'Maroc' }, NE: { currency: 'XOF', vat: 19, label: 'Niger' }, NG: { currency: 'NGN', vat: 7.5, label: 'Nigeria' },
  PT: { currency: 'EUR', vat: 23, label: 'Portugal' }, GB: { currency: 'GBP', vat: 20, label: 'Royaume-Uni' }, RW: { currency: 'RWF', vat: 18, label: 'Rwanda' },
  SN: { currency: 'XOF', vat: 18, label: 'Sénégal' }, CH: { currency: 'CHF', vat: 8.1, label: 'Suisse' }, TD: { currency: 'XAF', vat: 18, label: 'Tchad' },
  TG: { currency: 'XOF', vat: 18, label: 'Togo' }, TN: { currency: 'TND', vat: 19, label: 'Tunisie' },
}).sort(([, a], [, b]) => a.label.localeCompare(b.label, 'fr')));
/** The browser's country when we know it, else France (the list is international). */
const guessCountry = () => {
  const region = typeof navigator !== 'undefined' ? navigator.language.split('-')[1]?.toUpperCase() : undefined;
  return region && COUNTRIES[region] ? region : 'FR';
};

type Config = Awaited<ReturnType<typeof getConfiguration>>;

function Onboarding() {
  const { t, locale } = useI18n();
  const { viewer } = Route.useLoaderData();
  const { run, error, busy } = useAction();
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState(guessCountry);
  const preset = COUNTRIES[country] ?? COUNTRIES.FR!;
  const steps = [t('onb.stepCompany'), t('onb.stepTrade'), t('onb.stepTeam')];
  return (
    <div className="public" style={{ maxWidth: 820 }}>
      <PublicHeader signedIn />
      <div className="stepper" style={{ margin: '0 auto 1.5rem', maxWidth: 520 }}>
        {steps.map((label, index) => <span key={label} className={`st ${index + 1 === step ? 'on' : index + 1 < step ? 'done' : ''}`}><i />{label}</span>)}
      </div>
      {step === 1 ? (
        <div className="card stack loose">
          <div><h1 style={{ margin: 0 }}>{t('onboarding.title')}</h1><p className="muted" style={{ margin: '.3rem 0 0' }}>{t('onboarding.subtitle')}</p></div>
          <form className="stack" onSubmit={async (event) => {
            event.preventDefault();
            const v = formData(event.currentTarget);
            const done = await run(() => createCompany({ data: {
              name: v.name, countryCode: country, currencyCode: v.currencyCode?.toUpperCase(),
              vatBps: Math.round(Number(v.vat?.replace(',', '.')) * 100), retentionBps: Math.round(Number(v.retention?.replace(',', '.')) * 100), locale: v.locale,
            } }), { reload: false });
            if (done) setStep(2);
          }}>
            <Field label={t('onboarding.companyName')}><input name="name" required minLength={2} autoFocus /></Field>
            <div className="form-grid">
              <Field label={t('onb.country')}>
                <select value={country} onChange={(event) => setCountry(event.target.value)}>
                  {Object.entries(COUNTRIES).map(([code, item]) => <option key={code} value={code}>{item.label}</option>)}
                </select>
              </Field>
              <Field label={t('onboarding.currency')}><input key={`c-${country}`} name="currencyCode" defaultValue={preset.currency} maxLength={3} required pattern="[A-Za-z]{3}" /></Field>
              <Field label={t('onboarding.vat')}><input key={`v-${country}`} name="vat" defaultValue={String(preset.vat)} inputMode="decimal" required /></Field>
              <Field label={t('onboarding.retention')}><input name="retention" defaultValue="5" inputMode="decimal" required /></Field>
              <Field label={t('onboarding.locale')}>
                <select name="locale" defaultValue={locale}><option value="fr">Français</option><option value="en">English</option></select>
              </Field>
            </div>
            <p className="notice info small">{t('onboarding.defaultsNote')}</p>
            <ErrorText error={error} />
            <button className="btn large" disabled={busy}>{t('onb.continue')}<ArrowRight size={18} /></button>
          </form>
        </div>
      ) : null}
      {step === 2 ? <TradeStep onNext={() => setStep(3)} /> : null}
      {step === 3 ? (
        <div className="card stack loose">
          <div><h1 style={{ margin: 0 }}>{t('onb.teamTitle')}</h1><p className="muted" style={{ margin: '.3rem 0 0' }}>{t('onb.teamSub')}</p></div>
          <div className="grid-3">
            {([['/app/projects?new=1', FolderPlus, 'onb.firstSite', 'onb.firstSiteText'], ['/app/projects', FileSpreadsheet, 'onb.import', 'onb.importText'], ['/app/team?invite=1', UserPlus, 'onb.invite', 'onb.inviteText']] as const).map(([href, Icon, title, text]) => (
              <a key={href} href={href} className="tile" style={{ alignItems: 'flex-start', textAlign: 'left', textDecoration: 'none', minHeight: 140 }}>
                <Icon size={26} /><b>{t(title)}</b><span className="small muted" style={{ fontWeight: 400 }}>{t(text)}</span>
              </a>
            ))}
          </div>
          <a href="/app" className="btn large">{t('onb.toDashboard')}<ArrowRight size={18} /></a>
        </div>
      ) : null}
      {step === 1 && viewer.companies.length > 0 ? (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2>{t('onboarding.yourCompanies')}</h2>
          {viewer.companies.map((company) => (
            <div key={company.id} className="alert-row">
              <Building2 size={18} style={{ color: 'var(--ink-faint)' }} />
              <span className="grow">{company.name} <span className="muted small">— {t(`roles.${company.role}`)}</span></span>
              <button type="button" className="btn secondary small" onClick={async () => { await selectCompany({ data: { orgId: company.id } }); window.location.href = '/app'; }}>{t('onboarding.switchTo')}</button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TradeStep({ onNext }: { onNext: () => void }) {
  const { t, errorText } = useI18n();
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => getConfiguration().then(setConfig).catch((caught) => setError(errorText(caught)));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async (kind: 'projectType' | 'phase' | 'docType', name: string) => {
    if (!name.trim()) return;
    try { await addConfigurationItem({ data: { kind, name: name.trim(), ...(kind === 'docType' ? { required: true, hasExpiry: false } : {}) } }); await load(); }
    catch (caught) { setError(errorText(caught)); }
  };
  const remove = async (kind: 'projectType' | 'phase' | 'docType', id: string) => {
    try { await removeConfigurationItem({ data: { kind, id } }); await load(); } catch (caught) { setError(errorText(caught)); }
  };
  const groups: { kind: 'projectType' | 'phase' | 'docType'; title: string; items: { id: string; name: string }[] }[] = config ? [
    { kind: 'projectType', title: t('onb.types'), items: config.projectTypes },
    { kind: 'phase', title: t('onb.phases'), items: config.phases },
    { kind: 'docType', title: t('onb.documents'), items: config.docTypes },
  ] : [];
  return (
    <div className="card stack loose">
      <div><h1 style={{ margin: 0 }}>{t('onb.tradeTitle')}</h1><p className="muted" style={{ margin: '.3rem 0 0' }}>{t('onb.tradeSub')}</p></div>
      {groups.map((group) => (
        <div key={group.kind} className="stack" style={{ gap: '.5rem' }}>
          <b>{group.title}</b>
          <div className="chips">
            {group.items.map((item) => (
              <span key={item.id} className="chip" style={{ cursor: 'default' }}>{item.name}
                <button type="button" className="icon-btn sm" aria-label={t('app.remove')} onClick={() => void remove(group.kind, item.id)}><X size={13} /></button></span>
            ))}
            <form className="row tight nowrap" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem('name') as HTMLInputElement; void add(group.kind, input.value); input.value = ''; }}>
              <input name="name" placeholder={t('onb.add')} style={{ width: 160, minHeight: 40 }} maxLength={80} />
              <button type="submit" className="icon-btn" aria-label={t('onb.add')}><Plus size={16} /></button>
            </form>
          </div>
        </div>
      ))}
      {!config && !error ? <p className="muted">{t('ui.loading')}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <button type="button" className="btn large" onClick={onNext}>{t('onb.continue')}<ArrowRight size={18} /></button>
    </div>
  );
}
