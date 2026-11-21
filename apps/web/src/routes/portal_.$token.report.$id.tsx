// A client report opened by the client from the e-mail (spec 049), in the company's look.
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
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
      <Link to="/portal/$token" params={{ token }} className="btn ghost small no-print"><ArrowLeft size={15} />{t('clientReport.back')}</Link>
      {data ? <ClientReportView report={data.report} orgId={data.orgId} photoUrl={(id) => `/api/portal/${token}/file/${id}`} />
        : <p className="notice">{t('clientReport.locked')}</p>}
    </div>
  );
}
