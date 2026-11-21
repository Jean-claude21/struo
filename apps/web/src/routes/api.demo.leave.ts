import { recordPlatformEvent } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { runtime } from '@/server/runtime.server.ts';

/** Leaves the demo (spec 042): signs out of the demo account, then opens the sign-up page. */
export const Route = createFileRoute('/api/demo/leave')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const rt = runtime();
        await recordPlatformEvent(rt.owner, { kind: 'demo_leave' });
        const headers = new Headers({ location: new URL('/signup?from=demo', rt.env.APP_BASE_URL).toString() });
        const out = await rt.auth.api.signOut({ headers: request.headers, asResponse: true }).catch(() => null);
        for (const cookie of out?.headers.getSetCookie() ?? []) headers.append('set-cookie', cookie);
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
