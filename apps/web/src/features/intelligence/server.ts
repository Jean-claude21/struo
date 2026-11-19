import * as core from '@struo/core';
import { createServerFn } from '@tanstack/react-start';
import { secretBox } from '@/server/adapters.server.ts';
import { guarded, requireActor } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';
import { catalog } from './capabilities.server.ts';
import { pickModel, planAvailable, revokePlan, tryOpenAi } from './model.server.ts';

const act = <T>(work: (actor: core.Actor) => Promise<T>, permission?: core.Permission) =>
  guarded(async () => work(await requireActor(permission)));

/** The page « Intelligence & MCP » (spec 034): connections, policy, usage, capabilities, journal. */
export const getIntelligencePage = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { db, env } = runtime();
    const [policy, mine, usage, journal, keys, copilots] = await Promise.all([
      core.getAiPolicy(db, actor), core.myAiConnection(db, actor), core.aiUsageThisMonth(db, actor), core.aiJournal(db, actor),
      core.can(actor.role, 'apikeys.manage') ? core.listApiKeys(db, actor) : Promise.resolve([]),
      core.listMcpConnections(db, actor),
    ]);
    return {
      role: actor.role, policy, mine, usage, journal, keys, copilots, catalog: catalog(),
      companyConfigured: Boolean(env.OPENAI_API_KEY), companyModel: env.OPENAI_AGENT_MODEL, planAvailable: planAvailable(runtime()),
      mcpUrl: `${env.APP_BASE_URL}/mcp`, baseUrl: env.APP_BASE_URL,
    };
  }),
);

/** Whether the drawer can answer, and on whose connection (for its header). */
export const getAssistantStatus = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { db, env } = runtime();
    const [policy, mine] = await Promise.all([core.getAiPolicy(db, actor), core.myAiConnection(db, actor)]);
    const personal = mine && policy.policy !== 'company';
    return {
      ready: Boolean(personal || (policy.policy !== 'required' && env.OPENAI_API_KEY)),
      payer: personal ? (mine.kind === 'plan' ? 'plan' : 'personal') : 'company',
      hint: personal ? mine.hint : null, policy: policy.policy,
    };
  }),
);

/** Keeps the person's own key once the provider accepted it (it lists its models; nothing is spent). */
export const saveMyApiKey = createServerFn({ method: 'POST' })
  .validator((input: { key: string }) => ({ key: String(input.key ?? '').trim() }))
  .handler(({ data }) =>
    act(async (actor) => {
      const rt = runtime();
      if (!/^sk-[\w-]{20,}$/u.test(data.key)) throw new core.DomainError('ai_key_invalid', 422);
      const models = await tryOpenAi(data.key);
      if (!models) throw new core.DomainError('ai_key_invalid', 422);
      await core.saveMyAiConnection(rt.db, actor, {
        kind: 'api_key', provider: 'openai', model: pickModel(models, rt.env.OPENAI_AGENT_MODEL), hint: `sk-…${data.key.slice(-4)}`,
        secretSealed: secretBox(rt.env).seal(data.key),
      });
      return { ok: true };
    }),
  );

export const removeMyConnection = createServerFn({ method: 'POST' }).handler(() =>
  act(async (actor) => {
    const rt = runtime();
    const mine = await core.myAiConnectionSecret(rt.db, actor);
    if (mine?.kind === 'plan' && mine.refreshSealed) await revokePlan(rt, secretBox(rt.env).open(mine.refreshSealed));
    await core.removeMyAiConnection(rt.db, actor);
    return { ok: true };
  }),
);

export const setAiPolicy = createServerFn({ method: 'POST' })
  .validator((input: { policy: core.AiPolicy; budgetCents: number | null }) => input)
  .handler(({ data }) => act((actor) => core.setAiPolicy(runtime().db, actor, data), 'org.manage'));
