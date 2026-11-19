import { createFileRoute } from '@tanstack/react-router';
import { runtime } from '@/server/runtime.server.ts';

// Accounts (Better Auth): sign-up, sign-in, sessions.
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => runtime().auth.handler(request),
      POST: ({ request }) => runtime().auth.handler(request),
    },
  },
});
