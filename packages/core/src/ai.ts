import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db } from './db.ts';
import { DomainError } from './errors.ts';

/**
 * Who pays the model (spec 034): the company for everyone, a person's own connection when she has
 * one, or hers only. A person's connection is her API key, or her plan signed in with the provider.
 * Secrets arrive sealed by the application; they never leave this module unsealed and only a hint
 * (the last four characters, or the account's e-mail) is ever shown.
 */
export const AI_POLICIES = ['company', 'allowed', 'required'] as const;
export type AiPolicy = (typeof AI_POLICIES)[number];
export type AiPayer = 'company' | 'personal' | 'plan';

export interface AiConnection {
  kind: 'api_key' | 'plan';
  provider: string;
  model: string | null;
  hint: string;
  expiresAt: string | null;
  updatedAt: string;
}

export interface AiConnectionSecret extends AiConnection {
  secretSealed: string;
  refreshSealed: string | null;
}

export async function getAiPolicy(db: Db, actor: Actor): Promise<{ policy: AiPolicy; budgetCents: number | null }> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ policy: AiPolicy; budget: number | null }>(
      'select ai_policy as policy, ai_budget_cents as budget from org_settings where org_id = $1', [actor.orgId]);
    return { policy: rows[0]?.policy ?? 'allowed', budgetCents: rows[0]?.budget ?? null };
  });
}

export async function setAiPolicy(db: Db, actor: Actor, input: unknown): Promise<void> {
  ensure(actor, 'org.manage');
  const data = parse(z.object({ policy: z.enum(AI_POLICIES), budgetCents: z.number().int().min(0).max(100_000_000).nullable() }), input);
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('select ai_policy, ai_budget_cents from org_settings where org_id = $1', [actor.orgId])).rows[0];
    await tx.query('update org_settings set ai_policy = $2, ai_budget_cents = $3 where org_id = $1', [actor.orgId, data.policy, data.budgetCents]);
    await journal(tx, actor, 'ai.policy', actor.orgId, before, data);
  });
}

/** The person's own connection in this company, with its sealed secrets (for the server only). */
export async function myAiConnectionSecret(db: Db, actor: Actor): Promise<AiConnectionSecret | null> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<AiConnectionSecret>(
      `select kind, provider, model, hint, expires_at as "expiresAt", updated_at as "updatedAt",
              secret_sealed as "secretSealed", refresh_sealed as "refreshSealed"
         from ai_connection where org_id = $1 and user_id = $2`,
      [actor.orgId, actor.userId],
    );
    return rows[0] ?? null;
  });
}

/** The person's connection as the screen may show it: never a secret. */
export async function myAiConnection(db: Db, actor: Actor): Promise<AiConnection | null> {
  const secret = await myAiConnectionSecret(db, actor);
  if (!secret) return null;
  const { secretSealed: _secret, refreshSealed: _refresh, ...shown } = secret;
  return shown;
}

const connectionInput = z.object({
  kind: z.enum(['api_key', 'plan']),
  provider: z.string().trim().min(2).max(40),
  model: z.string().trim().max(80).nullable().optional(),
  secretSealed: z.string().min(10),
  refreshSealed: z.string().min(10).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  hint: z.string().trim().min(1).max(200),
});

/** Keeps (or replaces) the person's connection. The caller has tried it and sealed its secrets. */
export async function saveMyAiConnection(db: Db, actor: Actor, input: unknown): Promise<void> {
  const data = parse(connectionInput, input);
  const { policy } = await getAiPolicy(db, actor);
  if (policy === 'company') throw new DomainError('ai_personal_off', 403);
  await asActor(db, actor, async (tx) => {
    await tx.query(
      `insert into ai_connection (org_id, user_id, kind, provider, model, secret_sealed, refresh_sealed, expires_at, hint)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (org_id, user_id) do update set kind = excluded.kind, provider = excluded.provider, model = excluded.model,
         secret_sealed = excluded.secret_sealed, refresh_sealed = excluded.refresh_sealed, expires_at = excluded.expires_at,
         hint = excluded.hint, updated_at = now()`,
      [actor.orgId, actor.userId, data.kind, data.provider, data.model ?? null, data.secretSealed, data.refreshSealed ?? null, data.expiresAt ?? null, data.hint],
    );
    await journal(tx, actor, 'ai.connect', actor.userId, null, { kind: data.kind, provider: data.provider, hint: data.hint });
  });
}

export async function removeMyAiConnection(db: Db, actor: Actor): Promise<void> {
  await asActor(db, actor, async (tx) => {
    const { rowCount } = await tx.query('delete from ai_connection where org_id = $1 and user_id = $2', [actor.orgId, actor.userId]);
    if (rowCount) await journal(tx, actor, 'ai.disconnect', actor.userId, null, null);
  });
}

export async function recordAiUsage(db: Db, actor: Actor, input: { payer: AiPayer; model: string; inputTokens: number; outputTokens: number; costMicroUsd: number; tools: number }) {
  await asActor(db, actor, async (tx) => {
    await tx.query(
      `insert into ai_usage (org_id, user_id, payer, model, input_tokens, output_tokens, cost_microusd, tools) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [actor.orgId, actor.userId, input.payer, input.model.slice(0, 80), Math.max(0, Math.round(input.inputTokens)), Math.max(0, Math.round(input.outputTokens)),
        Math.max(0, Math.round(input.costMicroUsd)), input.tools],
    );
  });
}

/** This month: what the company paid (against its budget), and the person's own turns. */
export async function aiUsageThisMonth(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ companyMicro: string; companyTurns: string; mineTurns: string; mineMicro: string; minePersonal: string }>(
      `select coalesce(sum(cost_microusd) filter (where payer = 'company'), 0) as "companyMicro",
              count(*) filter (where payer = 'company') as "companyTurns",
              count(*) filter (where user_id = $2) as "mineTurns",
              coalesce(sum(cost_microusd) filter (where user_id = $2), 0) as "mineMicro",
              count(*) filter (where user_id = $2 and payer <> 'company') as "minePersonal"
         from ai_usage where org_id = $1 and at >= date_trunc('month', now())`,
      [actor.orgId, actor.userId],
    );
    const row = rows[0]!;
    return {
      companyCents: Math.round(Number(row.companyMicro) / 10_000), companyTurns: Number(row.companyTurns),
      mineTurns: Number(row.mineTurns), mineCents: Math.round(Number(row.mineMicro) / 10_000), minePersonalTurns: Number(row.minePersonal),
    };
  });
}

/**
 * Which connection a turn runs on: the person's own when the policy lets her (or requires it), else
 * the company's. Refuses when nothing may answer, or when the company's monthly budget is spent.
 */
export async function resolveAiPayer(db: Db, actor: Actor, companyConfigured: boolean): Promise<
  { payer: 'company' } | { payer: 'personal' | 'plan'; connection: AiConnectionSecret }
> {
  const [{ policy, budgetCents }, mine] = await Promise.all([getAiPolicy(db, actor), myAiConnectionSecret(db, actor)]);
  if (mine && policy !== 'company') return { payer: mine.kind === 'plan' ? 'plan' : 'personal', connection: mine };
  if (policy === 'required') throw new DomainError('ai_connection_required', 403);
  if (!companyConfigured) throw new DomainError('assistant_unavailable', 409);
  if (budgetCents !== null) {
    const usage = await aiUsageThisMonth(db, actor);
    if (usage.companyCents >= budgetCents) throw new DomainError('ai_budget_spent', 403);
  }
  return { payer: 'company' };
}

/** What the assistant and the copilots did (doors `ai` and `mcp`), latest first. */
export async function aiJournal(db: Db, actor: Actor, limit = 80) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ id: string; at: string; command: string; door: string; actorName: string | null; target: string }>(
      `select j.id::text, j.at, j.command, j.door, u.name as "actorName", j.target
         from journal j left join "user" u on u.id = j.actor
        where j.org_id = $1 and j.door in ('ai', 'mcp') order by j.id desc limit $2`,
      [actor.orgId, Math.min(limit, 300)],
    );
    return rows.map((row) => ({ ...row, at: new Date(row.at).toISOString() }));
  });
}
