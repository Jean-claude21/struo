import { createFileRoute } from '@tanstack/react-router';
import { runtime } from '@/server/runtime.server.ts';

// Health check: Coolify switches to a new release only when this answers.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await runtime().db.query('select 1');
          return Response.json({ status: 'ok', version: process.env.APP_VERSION ?? 'dev' });
        } catch {
          return Response.json({ status: 'database_unreachable' }, { status: 503 });
        }
      },
    },
  },
});
