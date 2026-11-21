// The client report on paper (spec 049): the office prints it or saves it as PDF.
import { createFileRoute } from '@tanstack/react-router';
import { ClientReportView } from '@/components/ClientReportView.tsx';
import { previewClientReport } from '@/features/office/server.ts';

type Search = { project: string; from: string; to: string; note?: string };

export const Route = createFileRoute('/print/client-report')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    project: String(search.project ?? ''), from: String(search.from ?? ''), to: String(search.to ?? ''),
    ...(typeof search.note === 'string' ? { note: search.note } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => previewClientReport({ data: { projectId: deps.project, from: deps.from, to: deps.to, note: deps.note ?? null } }),
  component: ClientReportPrint,
});

function ClientReportPrint() {
  const { report, orgId } = Route.useLoaderData();
  return <div className="print-page"><ClientReportView report={report} orgId={orgId} photoUrl={(id) => `/api/files/photo/${id}`} /></div>;
}
