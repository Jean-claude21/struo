// A client report opened by the client from the e-mail (spec 049), in the company's look.
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Download } from 'lucide-react';
import { ClientReportView } from '@/components/ClientReportView.tsx';
import { getPortalReport } from '@/features/portal/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/portal_/$token/report/$id')({
  loader: ({ params }) => getPortalReport({ data: { token: params.token, id: params.id } }),
  component: PortalReport,
});

function PortalReport() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const { token } = Route.useParams();
  return (
    <div className="public" style={{ maxWidth: 860 }}>
      <div className="row no-print" style={{ justifyContent: 'space-between', marginBottom: '.6rem' }}>
        <Link to="/portal/$token" params={{ token }} className="btn ghost small"><ArrowLeft size={15} />{t('clientReport.back')}</Link>
        {data.report ? <button type="button" className="btn secondary small" onClick={() => window.print()}><Download size={15} />{t('clientReport.pdf')}</button> : null}
      </div>
      {data.report && data.orgId ? <ClientReportView report={data.report} orgId={data.orgId} photoUrl={(id) => `/api/portal/${token}/file/${id}`} />
        : <p className="notice">{'locked' in data ? t('clientReport.locked') : t('clientReport.missing')}</p>}
    </div>
  );
}
