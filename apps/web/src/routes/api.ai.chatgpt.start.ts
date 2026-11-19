import { createFileRoute } from '@tanstack/react-router';
import { planAvailable, startPlanSignIn } from '@/features/intelligence/model.server.ts';
import { actorFromRequest } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const PLAN_COOKIE = 'struo_siwc';

/** Sign in with ChatGPT (spec 034): to OpenAI, with PKCE; the transaction waits in a signed cookie. */
export const Route = createFileRoute('/api/ai/chatgpt/start')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await actorFromRequest(request, 'web');
          const rt = runtime();
          if (!planAvailable(rt)) return Response.redirect(`${rt.env.APP_BASE_URL}/app/intelligence?plan=unavailable`, 302);
          const { url, transaction } = startPlanSignIn(rt, `${rt.env.APP_BASE_URL}/api/ai/chatgpt/callback`);
          const secure = rt.env.APP_BASE_URL.startsWith('https') ? '; Secure' : '';
          return new Response(null, { status: 302, headers: { location: url, 'set-cookie': `${PLAN_COOKIE}=${transaction}; Path=/api/ai/chatgpt; HttpOnly; SameSite=Lax; Max-Age=600${secure}` } });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
