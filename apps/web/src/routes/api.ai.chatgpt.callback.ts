import * as core from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { finishPlanSignIn, pickModel, tryOpenAi } from '@/features/intelligence/model.server.ts';
import { secretBox } from '@/server/adapters.server.ts';
import { actorFromRequest } from '@/server/api.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const COOKIE = 'struo_siwc';

/** Back from OpenAI: the code becomes tokens, sealed and kept as the person's plan connection. */
export const Route = createFileRoute('/api/ai/chatgpt/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const rt = runtime();
        const back = (result: string) => new Response(null, { status: 302, headers: {
          location: `${rt.env.APP_BASE_URL}/app/intelligence?plan=${result}`, 'set-cookie': `${COOKIE}=; Path=/api/ai/chatgpt; HttpOnly; Max-Age=0` } });
        try {
          const actor = await actorFromRequest(request, 'web');
          const url = new URL(request.url);
          const code = url.searchParams.get('code'); const state = url.searchParams.get('state');
          const transaction = request.headers.get('cookie')?.match(new RegExp(`${COOKIE}=([^;]+)`, 'u'))?.[1];
          if (!code || !state || !transaction) return back('refused');
          const tokens = await finishPlanSignIn(rt, { code, state, transaction, redirectUri: `${rt.env.APP_BASE_URL}/api/ai/chatgpt/callback` });
          if (!tokens) return back('refused');
          const models = (await tryOpenAi(tokens.access)) ?? [];
          const box = secretBox(rt.env);
          await core.saveMyAiConnection(rt.db, actor, {
            kind: 'plan', provider: 'chatgpt', model: pickModel(models, 'gpt-5-mini'), hint: tokens.email ?? 'ChatGPT',
            secretSealed: box.seal(tokens.access), refreshSealed: tokens.refresh ? box.seal(tokens.refresh) : null, expiresAt: tokens.expiresAt,
          });
          return back('connected');
        } catch (error) {
          return back(error instanceof core.DomainError ? error.code : 'refused');
        }
      },
    },
  },
});
