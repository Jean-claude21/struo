import { accountingExport, type AccountingExport } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

// Accounting export (spec 018): invoices, payments or expenses of a period, as CSV.
export const Route = createFileRoute('/api/export/accounting/$kind')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await actorFromRequest(request, 'api', 'finance.read');
          const url = new URL(request.url);
          const file = await accountingExport(runtime().db, actor, params.kind as AccountingExport, {
            from: url.searchParams.get('from') ?? undefined,
            to: url.searchParams.get('to') ?? undefined,
          });
          return new Response(file.content, {
            headers: {
              'content-type': 'text/csv; charset=utf-8',
              'content-disposition': `attachment; filename="${file.filename}"`,
              'cache-control': 'no-store',
            },
          });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
