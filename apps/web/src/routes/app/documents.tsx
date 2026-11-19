import { can } from '@struo/core/permissions';
import { createFileRoute, Link } from '@tanstack/react-router';
import { DocumentDialog } from '@/components/forms.tsx';
import { DocumentRows } from '@/components/tables.tsx';
import { Badge } from '@/components/ui.tsx';
import { getDocuments } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/documents')({
  loader: () => getDocuments(),
  component: Documents,
});

function Documents() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const canWrite = can(data.role, 'documents.write');
  return (
    <div className="stack">
      <div className="topbar">
        <h1>{t('documents.title')}</h1>
        {canWrite && data.projects.length ? <DocumentDialog projects={data.projects} docTypes={data.docTypes} /> : null}
      </div>
      <section className="card table-wrap">
        <h2>{t('documents.byProject')}</h2>
        <table>
          <thead>
            <tr>
              <th>{t('app.project')}</th>
              <th>{t('documents.required')}</th>
              <th>{t('documents.compliance')}</th>
            </tr>
          </thead>
          <tbody>
            {data.compliance.map((row) => (
              <tr key={row.projectId}>
                <td>
                  <Link to="/app/projects/$projectId" params={{ projectId: row.projectId }}>
                    <strong>{row.code}</strong> {row.name}
                  </Link>
                </td>
                <td>
                  {row.valid} / {row.required}
                </td>
                <td>{row.pct === null ? '—' : <Badge tone={row.pct >= 75 ? 'ok' : row.pct >= 50 ? 'warn' : 'bad'}>{row.pct} %</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <DocumentRows documents={data.documents} canWrite={canWrite} showProject />
      </section>
    </div>
  );
}
