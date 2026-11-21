// Spec 056: an invoice opened by the client from their space, in the company's look, to print or
// save as PDF (only on a confirmed device, only when the space shows the money).
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Download } from 'lucide-react';
import { InvoiceSheet } from '@/components/InvoiceSheet.tsx';
import { getPortalInvoice } from '@/features/portal/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/portal_/$token/invoice/$id')({
  loader: ({ params }) => getPortalInvoice({ data: { token: params.token, id: params.id } }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }, { name: 'referrer', content: 'no-referrer' }] }),
  component: PortalInvoice,
});

function PortalInvoice() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const { token } = Route.useParams();
  return (
    <div className="print-page stack">
      <div className="row no-print" style={{ justifyContent: 'space-between' }}>
        <Link to="/portal/$token" params={{ token }} className="btn ghost small"><ArrowLeft size={15} />{t('clientReport.back')}</Link>
        {data.invoice ? <button type="button" className="btn secondary small" onClick={() => window.print()}><Download size={15} />{t('clientReport.pdf')}</button> : null}
      </div>
      {data.invoice ? <InvoiceSheet doc={data.invoice} look={data.invoice.settings} logoUrl={data.logo} />
        : <p className="notice">{data.locked ? t('clientReport.locked') : t('clientReport.missing')}</p>}
    </div>
  );
}
