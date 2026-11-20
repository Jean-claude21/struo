// Design system (spec 020): the tokens and components of Struo, live, in both themes — and the empty,
// loading and error states every page uses. The reference when building a screen.
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { FolderKanban, Lock, Plus, ServerCrash, Star, Wallet } from 'lucide-react';
import { AreaChart, BarChart, Donut, Gauge, Legend, Sparkline } from '@/components/charts.tsx';
import { Avatar, AvatarStack, EmptyState, KpiTile, PageHeader, Panel, Progress, Seg, SkeletonRows, StatusChip, useToast, type Shape } from '@/components/kit.tsx';
import { useI18n } from '@/i18n/index.tsx';
import { applyTheme, readTheme, type Theme } from '@/lib/theme.ts';

export const Route = createFileRoute('/app/system')({ component: System });

const TOKENS = [
  ['brand', '--brand'], ['brand-soft', '--brand-soft'], ['ink', '--ink'], ['ink-2', '--ink-2'], ['ink-soft', '--ink-soft'], ['ink-faint', '--ink-faint'],
  ['bg', '--bg'], ['surface', '--surface'], ['surface-2', '--surface-2'], ['line', '--line'], ['ok', '--ok'], ['warn', '--warn'], ['bad', '--bad'], ['info', '--info'],
] as const;
const SHAPES: Shape[] = ['todo', 'progress', 'review', 'done', 'blocked', 'late'];

function System() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [theme, setTheme] = useState<Theme>(() => (typeof window === 'undefined' ? 'system' : readTheme()));
  return (
    <div className="stack">
      <PageHeader title={t('ds.title')} text={t('ds.subtitle')}>
        <Seg label={t('ui.theme')} value={theme} onChange={(next) => { applyTheme(next); setTheme(next); }}
          items={[{ value: 'light', label: t('ui.themeLight') }, { value: 'dark', label: t('ui.themeDark') }, { value: 'system', label: t('ui.themeSystem') }]} />
      </PageHeader>

      <section className="ds-sec"><h2>{t('ds.colors')} <span>{t('ds.colorsSub')}</span></h2>
        <div className="ds-grid">{TOKENS.map(([name, token]) => (
          <div key={token} className="ds-tok"><div className="sw" style={{ ['--c' as string]: `var(${token})` }} /><div className="nm"><span>{name}</span><code>{token}</code></div></div>
        ))}</div>
      </section>

      <section className="ds-sec"><h2>{t('ds.status')} <span>{t('ds.statusSub')}</span></h2>
        <div className="ds-row">{SHAPES.map((shape) => <span key={shape} className="badge"><StatusChip shape={shape} label={t(`statusShape.${shape}`)} /></span>)}</div>
        <div className="ds-row">{['ok', 'warn', 'bad', 'info', 'brand', 'violet'].map((tone) => <span key={tone} className={`badge ${tone}`}>{tone}</span>)}</div>
      </section>

      <section className="ds-sec"><h2>{t('ds.type')}</h2>
        <Panel><div className="stack">
          <h1 style={{ margin: 0 }}>Villa R+1 Amegah</h1><h2 style={{ margin: 0 }}>Situation de travaux n°3</h2><h3 style={{ margin: 0 }}>Gros œuvre</h3>
          <p style={{ margin: 0 }}>Ferraillage du plancher posé, coulage prévu vendredi.</p><p className="muted small" style={{ margin: 0 }}>Komi Adadé · il y a 2 h</p>
          <span className="num" style={{ fontSize: '1.6rem', fontWeight: 700 }}>48 000 000 FCFA</span>
        </div></Panel>
      </section>

      <section className="ds-sec"><h2>{t('ds.buttons')} <span>{t('ds.buttonsSub')}</span></h2>
        {[['', 'Primary'], ['secondary', 'Secondary'], ['neutral', 'Neutral'], ['ghost', 'Ghost'], ['danger', 'Danger']].map(([kind, label]) => (
          <div key={label} className="ds-row"><span className="lab">{label}</span>
            <button type="button" className={`btn ${kind}`}>{t('shell.newInvoice')}</button>
            <button type="button" className={`btn ${kind} small`}><Plus size={14} />{t('shell.create')}</button>
            <button type="button" className={`btn ${kind}`} disabled>{t('app.save')}</button>
          </div>
        ))}
        <div className="ds-row"><span className="lab">Pair</span><div className="pair" style={{ width: 360 }}><button type="button" className="btn secondary">{t('app.cancel')}</button><button type="button" className="btn">{t('app.save')}</button></div></div>
        <div className="ds-row"><span className="lab">Icon</span>{[Plus, Star, Wallet].map((Icon, index) => <button key={index} type="button" className="icon-btn" aria-label="icon"><Icon size={16} /></button>)}
          <Seg label="seg" value="a" onChange={() => undefined} items={[{ value: 'a', label: t('views.table') }, { value: 'b', label: t('views.board') }]} /></div>
      </section>

      <section className="ds-sec"><h2>{t('ds.inputs')}</h2>
        <div className="form-grid card">
          <label className="field">{t('clientInvite.contactName')}<input defaultValue="Kodjo Amegah" /></label>
          <label className="field">{t('app.status')}<select><option>{t('status.active')}</option></select></label>
          <label className="field">{t('app.date')}<input type="date" defaultValue="2026-11-19" /></label>
          <label className="check"><input type="checkbox" defaultChecked />{t('documents.shared')}</label>
        </div>
      </section>

      <section className="ds-sec"><h2>{t('ds.data')}</h2>
        <div className="grid">
          <KpiTile icon={Wallet} label={t('dashboard.receivable')} value="44 073 000 FCFA" tone="brand" sub={t('fin.overdueCount', { n: 7 })} subTone="bad" />
          <KpiTile label={t('fin.collectionRate')} value="53 %" sub={<Sparkline values={[12, 18, 15, 26, 31, 42]} />} />
        </div>
        <div className="ds-row"><span className="lab">Avatar</span><Avatar name="Afi Mensah" /><Avatar name="Jean Dzifa" size="md" /><Avatar name="Komi Adadé" size="lg" /><AvatarStack names={['Afi Mensah', 'Jean Dzifa', 'Komi Adadé', 'Akossiwa Apo', 'Yao']} max={3} /></div>
        <div className="ds-row"><span className="lab">Progress</span><span style={{ width: 240 }}><Progress value={55} /></span><span style={{ width: 240 }}><Progress value={100} /></span><span style={{ width: 240 }}><Progress value={23} tone="bad" /></span></div>
      </section>

      <section className="ds-sec"><h2>{t('ds.charts')}</h2>
        <div className="grid-2">
          <Panel title={t('today.cashTitle')}><AreaChart labels={['juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.']} main={[10, 16, 30, 31, 36, 42].map((v) => v * 1e6)} compare={[6, 14, 28, 50, 68, 75].map((v) => v * 1e6)} locale={locale} label="cash" />
            <Legend items={[{ label: t('today.collected'), color: 'var(--brand)' }, { label: t('today.invoiced'), color: 'var(--ink-faint)', dashed: true }]} /></Panel>
          <Panel title="Segments"><BarChart categories={['Rés.', 'Com.', 'Inst.', 'Rén.']} series={[{ values: [18, 12, 9, 27], color: 'var(--brand)' }, { values: [30, 22, 25, 14], color: 'var(--surface-3)' }]} locale={locale} label="segments" highlight={3} /></Panel>
          <Panel title={t('projects.progress')}><div className="row"><Donut segments={[{ value: 55, color: 'var(--brand)' }, { value: 45, color: 'transparent' }]} center={<b>55 %</b>} label="55 %" /><Gauge value={78} label="78" /></div></Panel>
        </div>
      </section>

      <section className="ds-sec"><h2>{t('ds.feedback')}</h2>
        <div className="stack">
          <div className="notice info">{t('plan.dependsOn')}</div><div className="notice ok">{t('clientPortal.signedOk')}</div>
          <div className="notice">{t('docs.reminders')}</div><div className="notice bad">{t('ds.sampleError')}</div>
          <div className="row"><button type="button" className="btn secondary" onClick={() => toast({ text: t('ds.sampleToast'), action: { label: t('ui.undo'), run: () => undefined } })}>{t('ds.toastDemo')}</button>
            <button type="button" className="btn secondary" onClick={() => toast({ text: t('ds.sampleError'), kind: 'err' })}>{t('ds.toastErrorDemo')}</button></div>
        </div>
      </section>

      <section className="ds-sec"><h2>{t('ds.statesTitle')} <span>{t('ds.statesSub')}</span></h2>
        <div className="grid-3">
          <Panel title={t('ds.emptyStates')}><EmptyState icon={FolderKanban} title={t('ds.sampleEmptyTitle')} text={t('ds.sampleEmptyText')} action={<button type="button" className="btn small"><Plus size={14} />{t('shell.newSite')}</button>} /></Panel>
          <Panel title={t('ds.loadingStates')}><SkeletonRows rows={5} /></Panel>
          <Panel title={t('ds.errorStates')}>
            <EmptyState icon={ServerCrash} title={t('ds.sampleErrorTitle')} text={t('ds.sampleErrorText')} action={<button type="button" className="btn secondary small">{t('ui.retry')}</button>} />
            <EmptyState icon={Lock} title={t('ds.sampleDeniedTitle')} text={t('ds.sampleDeniedText')} />
          </Panel>
        </div>
      </section>
    </div>
  );
}
