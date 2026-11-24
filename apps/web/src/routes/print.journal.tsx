// The day's journal of a site (spec 048), on paper: reports, who was present, deliveries, incidents and
// checklists of one day. The browser's « print to PDF » makes the file.
import { createFileRoute } from '@tanstack/react-router';
import { getSiteDay } from '@/features/office/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

type Search = { project: string; day: string };

export const Route = createFileRoute('/print/journal')({
  validateSearch: (search: Record<string, unknown>): Search => ({ project: String(search.project ?? ''), day: String(search.day ?? '') }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getSiteDay({ data: { projectId: deps.project, day: deps.day } }),
  component: JournalPrint,
});

export function DayJournal({ data, print }: { data: Awaited<ReturnType<typeof getSiteDay>>; print?: boolean }) {
  const { t, locale } = useI18n();
  const time = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  const long = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'full' }).format(new Date(`${data.day}T12:00:00`));
  const empty = !data.reports.length && !data.presences.length && !data.deliveries.length && !data.incidents.length && !data.checklists.length;
  return (
    <div className={print ? 'print-page stack' : 'stack'}>
      {print ? (
        <header>
          <div className="small">{data.company}</div>
          <h1 style={{ margin: '.2rem 0' }}>{t('journal.title')} · {data.project.code} · {data.project.name}</h1>
          <div>{long}{data.project.location ? ` · ${data.project.location}` : ''}{data.project.manager ? ` · ${t('cards.lead')} ${data.project.manager}` : ''}</div>
        </header>
      ) : null}
      {empty ? <p className="muted">{t('journal.empty')}</p> : null}
      {data.reports.length ? (
        <section><h2>{t('journal.reports')}</h2>
          {data.reports.map((report) => (
            <div key={report.id} style={{ marginBottom: '.8rem' }}>
              <b>{time(report.takenAt)} · {report.author}</b>{report.phase && report.progressPct !== null ? ` · ${report.phase} ${report.progressPct} %` : ''}
              {report.note ? <p style={{ margin: '.2rem 0', whiteSpace: 'pre-wrap' }}>{report.note}</p> : null}
              {report.photos.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{report.photos.map((id) => <img key={id} src={`/api/files/photo/${id}`} alt="" style={{ width: print ? 150 : 110, height: print ? 110 : 80, objectFit: 'cover', borderRadius: 4 }} />)}</div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
      {data.presences.length ? (
        <section><h2>{t('journal.presences', { n: data.presences.length })}</h2>
          <p style={{ margin: 0 }}>{data.presences.map((person) => (person.trade ? `${person.name} (${person.trade})` : person.name)).join(', ')}</p>
        </section>
      ) : null}
      {data.deliveries.length ? (
        <section><h2>{t('journal.deliveries')}</h2>
          <ul style={{ margin: 0 }}>{data.deliveries.map((delivery, index) => <li key={index}>{[delivery.quantity, delivery.unit, delivery.item].filter(Boolean).join(' ')}{delivery.supplier ? ` · ${delivery.supplier}` : ''}{delivery.verdict === 'reserve' ? ` · ${t('journal.reserve')}` : ''}</li>)}</ul>
        </section>
      ) : null}
      {data.incidents.length ? (
        <section><h2>{t('journal.incidents')}</h2>
          <ul style={{ margin: 0 }}>{data.incidents.map((incident, index) => <li key={index}>{t(`field.kinds.${incident.kind}` as MessageKey)} · {incident.description}</li>)}</ul>
        </section>
      ) : null}
      {data.checklists.length ? (
        <section><h2>{t('journal.checklists')}</h2>
          <ul style={{ margin: 0 }}>{data.checklists.map((run, index) => <li key={index}>{run.name} · {run.doneCount}/{run.totalCount}{run.completed ? '' : ` · ${t('journal.incomplete')}`}</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}

function JournalPrint() {
  const data = Route.useLoaderData();
  return <DayJournal data={data} print />;
}
