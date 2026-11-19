import { can } from '@struo/core/permissions';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { CalendarDays, CalendarRange, CircleCheck, Diamond, List, TriangleAlert } from 'lucide-react';
import { MilestoneDialog } from '@/components/forms.tsx';
import { MilestoneRows } from '@/components/tables.tsx';
import { Drawer, KpiTile, PageHeader, Panel, Seg, StatusChip, useToast } from '@/components/kit.tsx';
import { DateText, todayIso } from '@/components/ui.tsx';
import { Calendar } from '@/components/views/Calendar.tsx';
import { Gantt, shiftIso, type GanttDep, type GanttItem } from '@/components/views/Gantt.tsx';
import { getPlanning, updateMilestone, updateProject } from '@/features/office/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/planning')({
  loader: () => getPlanning(),
  component: Planning,
});

type Data = Awaited<ReturnType<typeof getPlanning>>;
type Site = Data['gantt'][number];
type Ms = Site['milestones'][number] & { site: Site };
const SITE_COLORS = ['#e8590c', '#1c6dd0', '#2f9e44', '#7048c8', '#c2255c', '#0c8599', '#b26a00'];

function Planning() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const router = useRouter();
  const toast = useToast();
  const canWrite = can(data.role, 'planning.write');
  const canMoveSites = can(data.role, 'projects.write');
  const [mode, setMode] = useState<'gantt' | 'calendar' | 'list'>('gantt');
  const [openMs, setOpenMs] = useState<Ms | null>(null);
  const colorOf = (site: Site) => SITE_COLORS[data.gantt.indexOf(site) % SITE_COLORS.length]!;
  const allMs: Ms[] = data.gantt.flatMap((site) => site.milestones.map((milestone) => ({ ...milestone, site })));
  const byId = new Map(allMs.map((milestone) => [milestone.id, milestone]));
  const siteById = new Map(data.gantt.map((site) => [site.id, site]));
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
  for (const site of data.gantt) {
    const label = <Link to="/app/projects/$projectId" params={{ projectId: site.id }}><b>{site.code}</b> {site.name}</Link>;
    if (site.startDate && site.endDate) {
      items.push({
        type: 'bar', id: site.id, label, start: site.startDate, end: site.endDate, progress: site.progressPct, color: colorOf(site),
        suspended: site.status === 'suspended', title: `${site.code} · ${site.name} · ${site.progressPct} %`, editable: canMoveSites,
        onOpen: () => void router.navigate({ to: '/app/projects/$projectId', params: { projectId: site.id } }),
      });
    } else {
      items.push({ type: 'group', id: site.id, label, extra: <span className="faint xsmall">{t('planning.noDates')}</span> });
    }
    site.milestones.forEach((milestone, index) => {
      const full = { ...milestone, site };
      items.push({
        type: 'ms', id: milestone.id, label: milestone.name, date: milestone.actualOn ?? milestone.plannedOn, status: msStatus(full), delay: milestone.delayDays,
        editable: canWrite && milestone.status !== 'done', caption: `${milestone.name} · ${t(`planning.statuses.${milestone.status as 'pending'}`)}`,
        onOpen: () => setOpenMs(full),
      });
      const next = site.milestones[index + 1];
      if (next) deps.push({ from: milestone.id, to: next.id });
    });
  }

  const moveSite = (id: string, days: number, endOnly: boolean) => {
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
    const to = shiftIso(milestone.plannedOn, days);
    void run(() => updateMilestone({ data: { id, patch: { plannedOn: to } } }), t('plan.moved', { name: milestone.name, days }),
      () => updateMilestone({ data: { id, patch: { plannedOn: milestone.plannedOn } } }));
  };

  const late = allMs.filter((milestone) => milestone.status === 'late');
  const reached = allMs.filter((milestone) => milestone.status === 'done').length;
  const onTime = allMs.filter((milestone) => milestone.status === 'done' && milestone.delayDays === 0).length;

  return (
    <div className="stack loose">
      <PageHeader title={t('planning.title')} text={t('plan.subtitle')}>
        {canWrite && data.projects.length ? <MilestoneDialog projects={data.projects} /> : null}
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
      </div>
      {mode === 'gantt' ? (
        <Gantt items={items} deps={deps} leftLabel={t('plan.rows')} emptyText={t('views.noDatesText')}
          onMoveBar={canMoveSites ? (id, days) => moveSite(id, days, false) : undefined}
          onResizeBar={canMoveSites ? (id, days) => moveSite(id, days, true) : undefined}
          onMoveMilestone={canWrite ? moveMs : undefined} />
      ) : mode === 'calendar' ? (
        <Calendar
          items={allMs.map((milestone) => ({
            id: milestone.id, date: milestone.actualOn ?? milestone.plannedOn, label: `${milestone.site.code} · ${milestone.name}`,
            color: milestone.status === 'late' ? 'var(--bad)' : milestone.status === 'done' ? 'var(--ok)' : colorOf(milestone.site),
            movable: canWrite && milestone.status !== 'done', onOpen: () => setOpenMs(milestone),
          }))}
          onMove={(id, date) => {
            const milestone = byId.get(id);
            if (!milestone) return;
            void run(() => updateMilestone({ data: { id, patch: { plannedOn: date } } }), t('plan.moved', { name: milestone.name, days: Math.round((new Date(date).getTime() - new Date(milestone.plannedOn).getTime()) / 86400000) }),
              () => updateMilestone({ data: { id, patch: { plannedOn: milestone.plannedOn } } }));
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
            void run(() => updateMilestone({ data: { id: milestone.id, patch: { actualOn: todayIso() } } }), t('plan.reached'),
              () => updateMilestone({ data: { id: milestone.id, patch: { actualOn: null } } }));
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
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
