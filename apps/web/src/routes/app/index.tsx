import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';
import { AlertList } from '@/components/AlertList.tsx';
import { Mascot } from '@/components/Mascot.tsx';
import { Badge, DateText, Empty, formatMoney, Kpi, Progress } from '@/components/ui.tsx';
import { getDashboard } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/')({
  loader: () => getDashboard(),
  component: Dashboard,
});

const layout = getRouteApi('/app');

function Dashboard() {
  const { t, locale } = useI18n();
  const data = Route.useLoaderData();
  const { viewer } = layout.useLoaderData();
  const currency = data.settings.currencyCode;
  const money = (minor: number) => formatMoney(locale, minor, currency);
  const ops = data.operations;
  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>
            {t('dashboard.hello', { name: '' }).trim()} <span className="accent">{viewer.name.split(' ')[0]}</span>
          </h1>
          {data.subscription.plan.code === 'trial' ? (
            <p className={data.subscription.trialExpired ? 'error' : 'muted'}>
              {data.subscription.trialExpired
                ? t('dashboard.trialExpired')
                : t('dashboard.trialEnds', { date: new Intl.DateTimeFormat(locale).format(new Date(data.subscription.trialEndsAt)) })}
            </p>
          ) : null}
        </div>
        <Mascot size={90} />
      </div>

      {data.finance ? (
        <div className="grid">
          <Kpi label={t('dashboard.portfolio')} value={money(data.finance.budgetMinor)} />
          <Kpi label={t('dashboard.invoiced')} value={money(data.finance.invoicedMinor)} />
          <Kpi label={t('dashboard.collected')} value={`${money(data.finance.collectedMinor)} · ${data.finance.collectedPct} %`} />
          <Kpi label={t('dashboard.receivable')} value={money(data.finance.receivableMinor)} />
          <Kpi label={t('dashboard.overdue')} value={money(data.finance.overdueMinor)} bad={data.finance.overdueMinor > 0} />
          <Kpi label={t('dashboard.retention')} value={money(data.finance.retentionMinor)} />
          <Kpi label={t('dashboard.cash')} value={money(data.finance.cashMinor)} bad={data.finance.cashMinor < 0} />
          <Kpi label={t('dashboard.margin')} value={data.finance.marginPct === null ? '—' : `${data.finance.marginPct} %`} />
        </div>
      ) : null}

      <div className="grid-2">
        <section className="card">
          <h2>{t('dashboard.alerts')}</h2>
          <AlertList alerts={data.alerts} limit={12} />
        </section>
        <section className="card">
          <h2>{t('dashboard.projectsHealth')}</h2>
          {data.projects.length ? (
            <div className="table-wrap">
              <table>
                <tbody>
                  {data.projects.slice(0, 10).map((project) => (
                    <tr key={project.id}>
                      <td>
                        <Link to="/app/projects/$projectId" params={{ projectId: project.id }}>
                          <strong>{project.code}</strong> {project.name}
                        </Link>
                      </td>
                      <td style={{ minWidth: 120 }}>
                        <Progress value={project.progressPct} />
                      </td>
                      <td>
                        <Badge tone={project.health}>{t(`status.${project.health}`)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text={t('projects.noProjects')} />
          )}
        </section>
      </div>

      <div className="grid">
        <Kpi label={t('dashboard.activeProjects')} value={ops.activeProjects} />
        <Kpi label={t('dashboard.averageProgress')} value={`${ops.averageProgress} %`} />
        <Kpi label={t('dashboard.milestones')} value={`${ops.milestonesDone} / ${ops.milestonesTotal}`} />
        <Kpi label={t('dashboard.averageDelay')} value={ops.averageDelay} bad={ops.averageDelay > 7} />
        <Kpi label={t('dashboard.compliance')} value={ops.compliancePct === null ? '—' : `${ops.compliancePct} %`} bad={(ops.compliancePct ?? 100) < 75} />
        <Kpi label={t('dashboard.reportsWeek')} value={ops.reportsWeek} />
        <Kpi label={t('dashboard.photosWeek')} value={ops.photosWeek} />
        <Kpi label={t('dashboard.openIncidents')} value={ops.openIncidents} bad={ops.openIncidents > 0} />
      </div>

      <section className="card">
        <h2>{t('dashboard.activity')}</h2>
        {data.activity.length ? (
          <div className="table-wrap">
            <table>
              <tbody>
                {data.activity.map((entry) => (
                  <tr key={entry.id}>
                    <td className="muted small">
                      <DateText value={entry.at} time />
                    </td>
                    <td>{entry.actorName}</td>
                    <td>
                      <code>{entry.command}</code>
                    </td>
                    <td>
                      <Badge>{entry.door}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </section>
    </div>
  );
}
