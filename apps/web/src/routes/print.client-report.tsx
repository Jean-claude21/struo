// The client report on paper (specs 049–050): the office prints it or saves it as PDF.
import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ClientReportView } from '@/components/ClientReportView.tsx';
import { getClientReport } from '@/features/office/server.ts';

export const Route = createFileRoute('/print/client-report')({
  validateSearch: (search: Record<string, unknown>): { id: string } => ({ id: String(search.id ?? '') }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getClientReport({ data: { id: deps.id } }),
  component: ClientReportPrint,
});

function ClientReportPrint() {
  const draft = Route.useLoaderData();
  useEffect(() => { const handle = window.setTimeout(() => window.print(), 600); return () => window.clearTimeout(handle); }, []);
  return <div className="print-page"><ClientReportView report={draft.report} orgId={draft.orgId} photoUrl={(id) => `/api/files/photo/${id}`} /></div>;
}
