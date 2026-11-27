import { createFileRoute } from '@tanstack/react-router';

// Health check: Coolify switches to a new release only when this answers. It never touches the
// database: Docker asks every 30 s, and a query each time would keep Neon awake for good
// (LEARNINGS-BASES-SERVERLESS.md). The database is checked on /api/health/db, by hand.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => Response.json({ status: 'ok', version: process.env.APP_VERSION ?? 'dev' }),
    },
  },
});
