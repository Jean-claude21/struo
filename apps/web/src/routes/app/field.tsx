import { can } from '@struo/core/permissions';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ReportCard } from '@/components/forms.tsx';
import { Badge, DateText, Empty, ErrorText, useAction } from '@/components/ui.tsx';
import { getField, resolveIncident } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/field')({
  validateSearch: (search: Record<string, unknown>): { status?: string } => ({
    status: search.status === 'submitted' || search.status === 'validated' || search.status === 'rejected' ? search.status : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getField({ data: deps }),
  component: FieldOffice,
});

function FieldOffice() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const { status } = Route.useSearch();
  const { run, error } = useAction();
  const canReview = can(data.role, 'field.review');
  return (
    <div className="stack">
      <div className="topbar">
        <h1>{t('field.title')}</h1>
        <div className="row">
          <Link to="/app/field" search={{}} className={`btn small ${status ? 'secondary' : ''}`}>
            {t('app.all')}
          </Link>
          <Link to="/app/field" search={{ status: 'submitted' }} className={`btn small ${status === 'submitted' ? '' : 'secondary'}`}>
            {t('field.toReview')}
          </Link>
          <a href="/field" className="btn secondary small">
            {t('nav.openField')}
          </a>
        </div>
      </div>
      <div className="grid-2">
        <section className="stack">
          <h2>{t('field.reports')}</h2>
          {data.reports.length ? data.reports.map((report) => <ReportCard key={report.id} report={report} canReview={canReview} />) : <Empty text={t('field.noReports')} />}
        </section>
        <section className="card">
          <h2>{t('field.incidents')}</h2>
          {data.incidents.length ? (
            data.incidents.map((incident) => (
              <div key={incident.id} className="alert-row">
                <Badge tone={incident.status === 'open' ? incident.priority : 'ok'}>
                  {incident.status === 'open' ? t(`field.priorities.${incident.priority as 'info'}`) : t('field.resolve')}
                </Badge>
                <div className="grow">
                  <strong>{t(`field.kinds.${incident.kind as 'other'}`)}</strong> · {incident.projectName}
                  <div>{incident.description}</div>
                  <div className="muted small">
                    <DateText value={incident.createdAt} time /> · {incident.authorName}
                  </div>
                </div>
                {incident.status === 'open' && canReview ? (
                  <button type="button" className="btn secondary small" onClick={() => run(() => resolveIncident({ data: { id: incident.id } }))}>
                    {t('field.resolve')}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <Empty />
          )}
          <ErrorText error={error} />
        </section>
      </div>
    </div>
  );
}
