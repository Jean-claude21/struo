import { can } from '@struo/core/permissions';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CalendarRange, CircleCheck, Diamond, List, Plus, TriangleAlert, X } from 'lucide-react';
import { MilestoneDialog } from '@/components/forms.tsx';
import { MilestoneRows } from '@/components/tables.tsx';
import { Drawer, KpiTile, PageHeader, Panel, Seg, StatusChip, useToast } from '@/components/kit.tsx';
import { DateText, todayIso } from '@/components/ui.tsx';
import { Calendar } from '@/components/views/Calendar.tsx';
import { Gantt, shiftIso, type GanttDep, type GanttItem } from '@/components/views/Gantt.tsx';
import { LayerBar, useLayers } from '@/components/views/Layers.tsx';
import { MenuItem, MenuSep } from '@/components/kit.tsx';
import { getPlanning, moveMilestone, restoreMilestoneDates, setMilestoneDependencies, updateMilestone, updatePhaseDates, updateProject } from '@/features/office/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/planning')({
  validateSearch: (search: Record<string, unknown>): { new?: string } => (typeof search.new === 'string' ? { new: search.new } : {}),
  loader: () => getPlanning(),
  component: Planning,
});

type Data = Awaited<ReturnType<typeof getPlanning>>;
type Site = Data['gantt'][number];
type Ms = Site['milestones'][number] & { site: Site };
const SITE_COLORS = ['#e8590c', '#1c6dd0', '#2f9e44', '#7048c8', '#c2255c', '#0c8599', '#b26a00'];

function Planning() {
  const { t, errorText } = useI18n();
  const data = Route.useLoaderData();
  const router = useRouter();
  const toast = useToast();
  const canWrite = can(data.role, 'planning.write');
  const canMoveSites = can(data.role, 'projects.write');
  const [mode, setMode] = useState<'gantt' | 'calendar' | 'list'>('gantt');
  const [openMs, setOpenMs] = useState<Ms | null>(null);
  const [showPhases, setShowPhases] = useState(true);
  const [open, setOpen] = useState<string[]>([]);
  useEffect(() => { try { setOpen(JSON.parse(localStorage.getItem('struo.planning.open') ?? '[]') as string[]); } catch { /* none */ } }, []);
  const toggleSite = (id: string) => setOpen((current) => {
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    try { localStorage.setItem('struo.planning.open', JSON.stringify(next)); } catch { /* not remembered */ }
    return next;
  });
  const search = Route.useSearch();
  const [adding, setAdding] = useState<{ date?: string } | null>(search.new === '1' ? {} : null);
  const layers = useLayers('planning.sites');
  const colorOf = (site: Site) => SITE_COLORS[data.gantt.indexOf(site) % SITE_COLORS.length]!;
  const siteLayers = data.gantt.map((site) => ({ key: site.id, label: `${site.code} · ${site.name}`, color: colorOf(site), count: site.milestones.length }));
  const visibleSites = data.gantt.filter((site) => layers.isOn(site.id));
  const allMs: Ms[] = data.gantt.flatMap((site) => site.milestones.map((milestone) => ({ ...milestone, site })));
  const byId = new Map(allMs.map((milestone) => [milestone.id, milestone]));
  const siteById = new Map(data.gantt.map((site) => [site.id, site]));
  const phaseById = new Map(data.gantt.flatMap((site) => site.phases.map((phase) => [phase.id, { ...phase, site }] as const)));
  const waitsFor = (id: string) => data.dependencies.filter((dep) => dep.milestoneId === id);
  const blocks = (id: string) => data.dependencies.filter((dep) => dep.dependsOnId === id);
  const msStatus = (milestone: Ms): 'reached' | 'late' | 'pending' => (milestone.status === 'done' ? 'reached' : milestone.status === 'late' ? 'late' : 'pending');

  const run = async (work: () => Promise<unknown>, text: string, undo?: () => Promise<unknown>) => {
    try {
      await work();
      await router.invalidate();
      toast({ text, action: undo ? { label: t('ui.undo'), run: async () => { await undo(); await router.invalidate(); } } : undefined });
    } catch {
      toast({ text: t('errors.generic'), kind: 'err' });
    }
  };

  const items: GanttItem[] = [];
  const deps: GanttDep[] = [];
  for (const site of visibleSites) {
    const label = <Link to="/app/projects/$projectId" params={{ projectId: site.id }}><b>{site.code}</b> {site.name}</Link>;
    if (site.startDate && site.endDate) {
      items.push({
        type: 'bar', id: site.id, label, start: site.startDate, end: site.endDate, progress: site.progressPct, color: colorOf(site),
        suspended: site.status === 'suspended', title: `${site.code} · ${site.name} · ${site.progressPct} %`, editable: canMoveSites,
        fold: { open: open.includes(site.id), onToggle: () => toggleSite(site.id), markers: site.milestones.map((milestone) => ({
          id: milestone.id, date: milestone.actualOn ?? milestone.plannedOn, status: msStatus({ ...milestone, site }), caption: milestone.name,
          onOpen: () => setOpenMs({ ...milestone, site }) })) },
        onOpen: () => void router.navigate({ to: '/app/projects/$projectId', params: { projectId: site.id } }),
      });
    } else {
      items.push({ type: 'group', id: site.id, label, extra: <span className="faint xsmall">{t('planning.noDates')}</span> });
    }
    if (!open.includes(site.id)) continue;
    if (showPhases) {
      for (const phase of site.phases) {
        if (!phase.startDate || !phase.endDate) continue;
        items.push({
          type: 'bar', id: phase.id, label: <span className="gx-sub">{phase.name}</span>, start: phase.startDate, end: phase.endDate, progress: phase.progress,
          color: colorOf(site), thin: true, late: phase.endDate < todayIso() && phase.progress < 100,
          title: `${site.code} · ${phase.name} · ${phase.progress} %${phase.endDate < todayIso() && phase.progress < 100 ? ` · ${t('plan.phaseLate')}` : ''}`, editable: canMoveSites,
        });
      }
    }
    site.milestones.forEach((milestone) => {
      const full = { ...milestone, site };
      items.push({
        type: 'ms', id: milestone.id, label: milestone.name, date: milestone.actualOn ?? milestone.plannedOn, status: msStatus(full), delay: milestone.delayDays,
        editable: canWrite && milestone.status !== 'done', caption: `${milestone.name} · ${t(`planning.statuses.${milestone.status as 'pending'}`)}`,
        onOpen: () => setOpenMs(full),
      });
    });
  }

  for (const dep of data.dependencies) deps.push({ from: dep.dependsOnId, to: dep.milestoneId });
  const markReached = (milestone: Ms) => void run(() => updateMilestone({ data: { id: milestone.id, patch: { actualOn: todayIso() } } }), t('plan.reached'),
    () => updateMilestone({ data: { id: milestone.id, patch: { actualOn: null } } }));
  const msMenu = (milestone: Ms, close: () => void) => (
    <>
      <MenuItem icon={Diamond} onSelect={() => { close(); setOpenMs(milestone); }}>{t('plan.openMilestone')}</MenuItem>
      <MenuItem icon={ArrowLeft} onSelect={() => { close(); setOpenMs(milestone); }}>{t('plan.addDependency')}</MenuItem>
      {canWrite && milestone.status !== 'done' ? <MenuItem icon={CircleCheck} onSelect={() => { close(); markReached(milestone); }}>{t('plan.markReached')}</MenuItem> : null}
      <MenuSep />
      <MenuItem icon={ArrowRight} onSelect={() => { close(); void router.navigate({ to: '/app/projects/$projectId', params: { projectId: milestone.site.id } }); }}>{t('plan.openSite')}</MenuItem>
      <MenuItem icon={TriangleAlert} onSelect={() => { close(); layers.only(milestone.site.id, data.gantt.map((site) => site.id)); }}>{t('plan.onlyThisSite')}</MenuItem>
    </>
  );
  const ganttMenu = (id: string, close: () => void) => {
    const milestone = byId.get(id);
    if (milestone) return msMenu(milestone, close);
    const site = siteById.get(id) ?? phaseById.get(id)?.site;
    if (!site) return null;
    return (
      <>
        <MenuItem icon={ArrowRight} onSelect={() => { close(); void router.navigate({ to: '/app/projects/$projectId', params: { projectId: site.id } }); }}>{t('plan.openSite')}</MenuItem>
        {canWrite ? <MenuItem icon={Plus} onSelect={() => { close(); setAdding({}); }}>{t('planning.add')}</MenuItem> : null}
        <MenuItem icon={TriangleAlert} onSelect={() => { close(); layers.only(site.id, data.gantt.map((item) => item.id)); }}>{t('plan.onlyThisSite')}</MenuItem>
      </>
    );
  };
  const layerBar = <LayerBar layers={siteLayers} state={layers} title={t('shell.sites')} />;

  const moveSite = (id: string, days: number, endOnly: boolean) => {
    const phase = phaseById.get(id);
    if (phase?.startDate && phase.endDate) {
      const patch = { startDate: endOnly ? phase.startDate : shiftIso(phase.startDate, days), endDate: shiftIso(phase.endDate, days) };
      if (patch.endDate < patch.startDate) return;
      void run(() => updatePhaseDates({ data: { id, ...patch } }), t('plan.phaseMoved', { name: phase.name }),
        () => updatePhaseDates({ data: { id, startDate: phase.startDate, endDate: phase.endDate } }));
      return;
    }
    const site = siteById.get(id);
    if (!site?.startDate || !site.endDate) return;
    const patch = endOnly ? { endDate: shiftIso(site.endDate, days) } : { startDate: shiftIso(site.startDate, days), endDate: shiftIso(site.endDate, days) };
    const back = endOnly ? { endDate: site.endDate } : { startDate: site.startDate, endDate: site.endDate };
    if (endOnly && patch.endDate! < site.startDate) return;
    void run(() => updateProject({ data: { id, patch } }), t(endOnly ? 'plan.movedEnd' : 'plan.moved', { name: site.code, days }),
      () => updateProject({ data: { id, patch: back } }));
  };
  const moveMs = (id: string, days: number) => {
    const milestone = byId.get(id);
    if (!milestone) return;
    if (milestone.status === 'done') { toast({ text: t('plan.reachedLocked'), kind: 'info' }); return; }
    reschedule(milestone, shiftIso(milestone.plannedOn, days));
  };
  /** Moves a milestone; what waits for it is pushed by the server, and « undo » puts everything back. */
  const reschedule = async (milestone: Ms, date: string) => {
    try {
      const { shifted } = await moveMilestone({ data: { id: milestone.id, plannedOn: date } });
      await router.invalidate();
      const back = [{ id: milestone.id, plannedOn: milestone.plannedOn }, ...shifted.map((item) => ({ id: item.id, plannedOn: item.from }))];
      const days = Math.round((new Date(date).getTime() - new Date(milestone.plannedOn).getTime()) / 86400000);
      toast({
        text: shifted.length ? t('plan.cascade', { name: milestone.name, n: shifted.length }) : t('plan.moved', { name: milestone.name, days }),
        action: { label: t('ui.undo'), run: async () => { await restoreMilestoneDates({ data: { items: back } }); await router.invalidate(); } },
      });
    } catch (caught) {
      toast({ text: errorText(caught), kind: 'err' });
    }
  };

  const late = allMs.filter((milestone) => milestone.status === 'late');
  const reached = allMs.filter((milestone) => milestone.status === 'done').length;
  const onTime = allMs.filter((milestone) => milestone.status === 'done' && milestone.delayDays === 0).length;

  return (
    <div className="stack loose">
      <PageHeader title={t('planning.title')} text={t('plan.subtitle')}>
        {mode === 'gantt' ? (
          <span className="row tight">
            <button type="button" className="btn ghost small" onClick={() => { const all = visibleSites.map((site) => site.id); setOpen(all); try { localStorage.setItem('struo.planning.open', JSON.stringify(all)); } catch { /* */ } }}>{t('plan.expandAll')}</button>
            <button type="button" className="btn ghost small" onClick={() => { setOpen([]); try { localStorage.setItem('struo.planning.open', '[]'); } catch { /* */ } }}>{t('plan.collapseAll')}</button>
          </span>
        ) : null}
        {canWrite && data.projects.length ? (
          <MilestoneDialog projects={data.projects} date={adding?.date} open={adding !== null} onOpenChange={(next) => setAdding(next ? (adding ?? {}) : null)} />
        ) : null}
      </PageHeader>
      <div className="grid">
        <KpiTile icon={Diamond} label={t('views.milestones')} value={`${reached} / ${allMs.length}`} sub={`${allMs.length ? Math.round((reached / allMs.length) * 100) : 0} %`} />
        <KpiTile icon={TriangleAlert} label={t('planning.late')} value={late.length} tone={late.length ? 'bad' : undefined}
          sub={late.length ? `${t('plan.gap')} max +${Math.max(...late.map((milestone) => milestone.delayDays))} j` : t('plan.onTime')} subTone={late.length ? 'bad' : 'ok'} />
        <KpiTile icon={CircleCheck} label={t('plan.onTime')} value={`${reached ? Math.round((onTime / reached) * 100) : 0} %`} sub={`${onTime} / ${reached}`} />
      </div>
      <div className="row">
        <Seg label={t('planning.title')} value={mode} onChange={setMode} items={[
          { value: 'gantt', label: t('plan.ganttTab'), icon: CalendarRange },
          { value: 'calendar', label: t('plan.calendarTab'), icon: CalendarDays },
          { value: 'list', label: `${t('plan.listTab')} · ${late.length}`, icon: List },
        ]} />
        <span className="sp" />
        {mode === 'gantt' ? <span className="faint small hide-m">{t('plan.dependsOn')}</span> : null}
        {mode === 'gantt' ? (
          <label className="row tight small"><input type="checkbox" checked={showPhases} onChange={(event) => setShowPhases(event.target.checked)} />{t('plan.phases')}</label>
        ) : null}
      </div>
      {mode === 'gantt' ? (
        <Gantt items={items} deps={deps} leftLabel={t('plan.rows')} emptyText={t('views.noDatesText')}
          onMoveBar={canMoveSites ? (id, days) => moveSite(id, days, false) : undefined}
          onResizeBar={canMoveSites ? (id, days) => moveSite(id, days, true) : undefined}
          onMoveMilestone={canWrite ? moveMs : undefined} itemMenu={ganttMenu} header={layerBar} initialZoom="month" />
      ) : mode === 'calendar' ? (
        <Calendar
          header={<div style={{ marginBottom: '.5rem' }}>{layerBar}</div>}
          onAdd={canWrite ? (date) => setAdding({ date }) : undefined} addLabel={t('planning.add')}
          itemMenu={(item, close) => { const milestone = byId.get(item.id); return milestone ? msMenu(milestone, close) : null; }}
          items={allMs.filter((milestone) => layers.isOn(milestone.site.id)).map((milestone) => ({
            id: milestone.id, date: milestone.actualOn ?? milestone.plannedOn, label: `${milestone.site.code} · ${milestone.name}`,
            color: colorOf(milestone.site), icon: <span className={`gx-ms-mini ${msStatus(milestone)}`} aria-label={t(`planning.statuses.${milestone.status as 'pending'}`)} />,
            movable: canWrite && milestone.status !== 'done', onOpen: () => setOpenMs(milestone), done: milestone.status === 'done',
          }))}
          onMove={(id, date) => {
            const milestone = byId.get(id);
            if (milestone) void reschedule(milestone, date);
          }}
        />
      ) : (
        <Panel title={t('planning.late')} sub={t('plan.lateCount', { n: data.late.length })}>
          <MilestoneRows milestones={data.late} canWrite={canWrite} showProject />
        </Panel>
      )}

      <Drawer open={Boolean(openMs)} onClose={() => setOpenMs(null)} title={openMs ? openMs.name : ''}
        footer={openMs && canWrite && openMs.status !== 'done' ? (
          <button type="button" className="btn" onClick={() => {
            const milestone = openMs; setOpenMs(null);
            markReached(milestone);
          }}><CircleCheck size={16} />{t('plan.markReached')}</button>
        ) : undefined}>
        {openMs ? (
          <div className="stack">
            <div className="row">
              <StatusChip shape={openMs.status === 'done' ? 'done' : openMs.status === 'late' ? 'late' : 'todo'} label={t(`planning.statuses.${openMs.status as 'pending'}`)} />
              <span className="badge">{t(`planning.categories.${openMs.category}` as MessageKey)}</span>
            </div>
            <Link to="/app/projects/$projectId" params={{ projectId: openMs.site.id }} className="small">{openMs.site.code} · {openMs.site.name}</Link>
            <div className="grid-2" style={{ gap: '.75rem' }}>
              <KpiTile label={t('planning.plannedOn')} value={<DateText value={openMs.plannedOn} />} />
              <KpiTile label={openMs.actualOn ? t('planning.actualOn') : t('plan.gap')} value={openMs.actualOn ? <DateText value={openMs.actualOn} /> : openMs.delayDays ? `+${openMs.delayDays} j` : t('plan.onTime')} tone={openMs.status === 'late' ? 'bad' : undefined} />
            </div>
            <DependencyEditor milestone={openMs} all={allMs} waits={waitsFor(openMs.id)} blocks={blocks(openMs.id)} canWrite={canWrite}
              onOpen={(id) => { const next = byId.get(id); if (next) setOpenMs(next); }}
              onSave={async (dependsOn) => {
                try {
                  await setMilestoneDependencies({ data: { id: openMs.id, dependsOn } });
                  await router.invalidate();
                  toast({ text: t('plan.depsSaved') });
                } catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
              }} />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

/** What a milestone waits for (editable) and what waits for it (read only, click to open). */
function DependencyEditor({ milestone, all, waits, blocks, canWrite, onSave, onOpen }: {
  milestone: Ms; all: Ms[]; waits: { dependsOnId: string; lagDays: number }[]; blocks: { milestoneId: string }[]; canWrite: boolean;
  onSave: (dependsOn: { id: string; lagDays: number }[]) => Promise<void>; onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const byId = new Map(all.map((item) => [item.id, item]));
  const current = waits.map((dep) => ({ id: dep.dependsOnId, lagDays: dep.lagDays }));
  const [pick, setPick] = useState('');
  const [lag, setLag] = useState('0');
  const candidates = all.filter((item) => item.id !== milestone.id && !current.some((dep) => dep.id === item.id));
  const name = (item: Ms) => `${item.site.code} · ${item.name}`;
  const row = (id: string, extra: ReactNode, icon: ReactNode) => {
    const item = byId.get(id);
    if (!item) return null;
    return (
      <div key={id} className="alert-row">
        {icon}
        <button type="button" className="link grow trunc" style={{ textAlign: 'left' }} onClick={() => onOpen(id)}>
          {item.name} <span className="faint xsmall">{item.site.id === milestone.site.id ? '' : `· ${item.site.code} (${t('plan.otherSite')})`}</span>
        </button>
        <span className="faint xsmall"><DateText value={item.actualOn ?? item.plannedOn} /></span>
        {extra}
      </div>
    );
  };
  return (
    <div className="stack" style={{ gap: '.6rem' }}>
      <b className="small">{t('plan.waitsFor')}</b>
      {current.length ? current.map((dep) => row(dep.id, (
        <>
          {dep.lagDays ? <span className="badge">+{dep.lagDays} j</span> : null}
          {canWrite ? (
            <button type="button" className="icon-btn sm" aria-label={t('app.remove')} onClick={() => void onSave(current.filter((other) => other.id !== dep.id))}><X size={13} /></button>
          ) : null}
        </>
      ), <ArrowLeft size={14} style={{ color: 'var(--ink-faint)' }} />)) : <p className="muted small" style={{ margin: 0 }}>{t('plan.noDeps')}</p>}
      {canWrite && milestone.status !== 'done' ? (
        <form className="row tight nowrap" onSubmit={(event) => {
          event.preventDefault();
          if (!pick) return;
          void onSave([...current, { id: pick, lagDays: Math.max(0, Math.min(365, Number(lag) || 0)) }]).then(() => { setPick(''); setLag('0'); });
        }}>
          <select value={pick} onChange={(event) => setPick(event.target.value)} aria-label={t('plan.addDependency')} style={{ minWidth: 0, flex: 1 }}>
            <option value="">{t('plan.pickMilestone')}</option>
            {candidates.map((item) => <option key={item.id} value={item.id}>{name(item)}</option>)}
          </select>
          <input value={lag} onChange={(event) => setLag(event.target.value)} inputMode="numeric" style={{ width: 56 }} aria-label={t('plan.lag')} />
          <span className="faint xsmall">{t('plan.lag')}</span>
          <button type="submit" className="icon-btn" aria-label={t('plan.addDependency')} disabled={!pick}><Plus size={16} /></button>
        </form>
      ) : null}
      <b className="small">{t('plan.blocks')}</b>
      {blocks.length ? blocks.map((dep) => row(dep.milestoneId, null, <ArrowRight size={14} style={{ color: 'var(--ink-faint)' }} />))
        : <p className="muted small" style={{ margin: 0 }}>{t('plan.noBlocks')}</p>}
      {canWrite ? <p className="faint xsmall" style={{ margin: 0 }}>{t('plan.cascadeHint')}</p> : null}
    </div>
  );
}
