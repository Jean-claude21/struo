import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { confirmDraft } from '@/features/intelligence/agent.server.ts';
import { unsign } from '@/features/intelligence/model.server.ts';
import { localeFromHeaders } from '@/i18n/index.tsx';
import { actorFromRequest } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

/** The person validates a draft the assistant prepared (spec 034): it runs as her, through the web door. */
export const Route = createFileRoute('/api/intelligence/confirm')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'web');
          const { token } = z.object({ token: z.string().min(10).max(20_000) }).parse(await request.json());
          const locale = localeFromHeaders(request.headers.get('cookie'), request.headers.get('accept-language'));
          const result = await confirmDraft(runtime(), actor, locale, token, (value) => unsign(runtime(), value));
          return Response.json({ ok: true, result: result ?? null });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
