import { createFileRoute } from '@tanstack/react-router';
import { runtime } from '@/server/runtime.server.ts';

// The database's own check, asked by a person, never by a probe: it wakes the database.
export const Route = createFileRoute('/api/health/db')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await runtime().db.query('select 1');
          return Response.json({ status: 'ok', database: 'ok' });
        } catch {
          return Response.json({ status: 'database_unreachable' }, { status: 503 });
        }
      },
    },
  },
});
