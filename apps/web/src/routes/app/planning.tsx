import { can } from '@struo/core/permissions';
import { createFileRoute, Link } from '@tanstack/react-router';
import { MilestoneDialog } from '@/components/forms.tsx';
import { MilestoneRows } from '@/components/tables.tsx';
import { Empty } from '@/components/ui.tsx';
import { getPlanning } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/planning')({
  loader: () => getPlanning(),
  component: Planning,
});

const DAY = 86_400_000;
const time = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();

function Planning() {
  const { t, locale } = useI18n();
  const data = Route.useLoaderData();
  const canWrite = can(data.role, 'planning.write');
  // The window: from the earliest start (or milestone) to the latest end, with today inside.
  const dates = data.gantt.flatMap((project) => [project.startDate, project.endDate, ...project.milestones.map((m) => m.plannedOn)]).filter((d): d is string => Boolean(d));
  const today = Date.now();
  const min = Math.min(today - 14 * DAY, ...dates.map(time));
  const max = Math.max(today + 30 * DAY, ...dates.map(time));
  const span = max - min || 1;
  const pos = (ms: number) => `${((ms - min) / span) * 100}%`;
  const months: { label: string; at: number }[] = [];
  for (let d = new Date(min); d.getTime() <= max; d.setUTCMonth(d.getUTCMonth() + 1, 1)) {
    months.push({ label: new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(d), at: d.getTime() });
  }
  return (
    <div className="stack">
      <div className="topbar">
        <h1>{t('planning.title')}</h1>
        {canWrite && data.projects.length ? <MilestoneDialog projects={data.projects} /> : null}
      </div>
      <section className="card table-wrap">
        <h2>{t('planning.gantt')}</h2>
        {data.gantt.length ? (
          <div className="gantt" style={{ minWidth: 720 }}>
            <div className="gantt-row">
              <div />
              <div className="gantt-track small muted">
                {months.map((month) => (
                  <span key={month.at} style={{ position: 'absolute', left: pos(month.at), top: 6 }}>
                    {month.label}
                  </span>
                ))}
              </div>
            </div>
            {data.gantt.map((project) => {
              const start = project.startDate ? time(project.startDate) : null;
              const end = project.endDate ? time(project.endDate) : null;
              return (
                <div key={project.id} className="gantt-row">
                  <div>
                    <Link to="/app/projects/$projectId" params={{ projectId: project.id }}>
                      <strong>{project.code}</strong> {project.name}
                    </Link>
                    {!start || !end ? <div className="muted small">{t('planning.noDates')}</div> : null}
                  </div>
                  <div className="gantt-track">
                    <div className="gantt-today" style={{ left: pos(today) }} title={t('planning.today')} />
                    {start && end ? (
                      <div className="gantt-bar" style={{ left: pos(start), width: `${((end - start) / span) * 100}%` }}>
                        <span style={{ width: `${project.progressPct}%` }} />
                      </div>
                    ) : null}
                    {project.milestones.map((milestone) => (
                      <div
                        key={milestone.id}
                        className={`gantt-ms ${milestone.status}`}
                        style={{ left: pos(time(milestone.plannedOn)) }}
                        title={`${milestone.name} — ${t(`planning.statuses.${milestone.status as 'pending'}`)}${milestone.delayDays ? ` (${t('planning.delay', { n: milestone.delayDays })})` : ''}`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty />
        )}
      </section>
      <section className="card">
        <h2>{t('planning.late')}</h2>
        <MilestoneRows milestones={data.late} canWrite={canWrite} showProject />
      </section>
    </div>
  );
}
