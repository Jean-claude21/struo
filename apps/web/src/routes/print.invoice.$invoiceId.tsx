import { createFileRoute } from '@tanstack/react-router';
import { InvoiceSheet } from '@/components/InvoiceSheet.tsx';
import { getInvoicePrint } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/print/invoice/$invoiceId')({
  loader: ({ params }) => getInvoicePrint({ data: { id: params.invoiceId } }),
  component: InvoicePrint,
});

/** Printable invoice (specs 035, 036): the browser's « print to PDF » produces the file sent to the client. */
function InvoicePrint() {
  const { t } = useI18n();
  const invoice = Route.useLoaderData();
  const logo = invoice.settings.logoKey ? `/api/files/logo/${invoice.org_id}?v=${encodeURIComponent(invoice.settings.logoKey.slice(-12))}` : null;
  return (
    <div className="print-page stack">
      <div className="no-print row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={() => window.print()}>{t('app.print')}</button>
      </div>
      <InvoiceSheet doc={invoice} look={invoice.settings} logoUrl={logo} />
    </div>
  );
}
