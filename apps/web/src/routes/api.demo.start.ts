import { createFileRoute } from '@tanstack/react-router';
import { DomainError } from '@struo/core';
import { ORG_COOKIE } from '@/server/context.server.ts';
import { accountFor, claimSandbox, DEMO_ROLES, sandboxOfUser, type DemoRole } from '@/server/demo.server.ts';
import { reportError } from '@/server/monitor.server.ts';
import { runtime } from '@/server/runtime.server.ts';

/** Where each role lands in the demo. */
const LANDING: Record<Exclude<DemoRole, 'client'>, string> = { owner: '/app', engineer: '/app/field', site_lead: '/field', accountant: '/app/finance' };

/**
 * Opens the demo as a role (spec 042): the visitor's own copy (the one they are already in, or a new
 * one), signed in as that role's account, without any form. « client » opens the client space.
 */
export const Route = createFileRoute('/api/demo/start')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const rt = runtime();
        const url = new URL(request.url);
        const role = (DEMO_ROLES as readonly string[]).includes(url.searchParams.get('role') ?? '') ? (url.searchParams.get('role') as DemoRole) : 'owner';
        const back = (error: string) => Response.redirect(new URL(`/demo?error=${error}`, rt.env.APP_BASE_URL), 302);
        try {
          const session = await rt.auth.api.getSession({ headers: request.headers });
          // The proxy appends the real address at the end of the chain; what a visitor sends is ignored.
          const visitor = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || request.headers.get('x-real-ip') || 'local';
          const sandbox = (session ? await sandboxOfUser(rt, session.user.id) : null) ?? (await claimSandbox(rt, visitor));
          if (role === 'client') {
            if (!sandbox.portal_token) return back('unavailable');
            return Response.redirect(new URL(`/portal/${sandbox.portal_token}?demo=1`, rt.env.APP_BASE_URL), 302);
          }
          const account = accountFor(sandbox, role);
          const signIn = await rt.auth.api.signInEmail({
            body: { email: account.email, password: rt.secrets.open(sandbox.password_enc) },
            headers: request.headers,
            asResponse: true,
          });
          if (!signIn.ok) return back('unavailable');
          const headers = new Headers({ location: new URL(LANDING[role], rt.env.APP_BASE_URL).toString() });
          for (const cookie of signIn.headers.getSetCookie()) headers.append('set-cookie', cookie);
          headers.append('set-cookie', `${ORG_COOKIE}=${sandbox.org_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${rt.env.APP_BASE_URL.startsWith('https://') ? '; Secure' : ''}`);
          return new Response(null, { status: 302, headers });
        } catch (error) {
          if (error instanceof DomainError) return back(error.code === 'demo_limit' ? 'limit' : 'unavailable');
          reportError(error, { where: 'demo:start' });
          return back('unavailable');
        }
      },
    },
  },
});
