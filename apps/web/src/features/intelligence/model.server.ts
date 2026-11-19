// Which model a turn runs on, and who pays (spec 034): the company's key, the person's own key, or
// her ChatGPT plan through « Sign in with ChatGPT » (OAuth 2.0 + PKCE with auth.openai.com; the
// access token calls the Responses API and the plan pays). All three speak the Responses API.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import * as core from '@struo/core';
import { secretBox } from '@/server/adapters.server.ts';
import type { Runtime } from '@/server/runtime.server.ts';

export const OPENAI_API = 'https://api.openai.com/v1';
export const OPENAI_AUTH = 'https://auth.openai.com';
const AUTHORIZE = `${OPENAI_AUTH}/api/accounts/authorize`;
const TOKEN = `${OPENAI_AUTH}/api/accounts/oauth/token`;
const REVOKE = `${OPENAI_AUTH}/api/accounts/oauth/revoke`;
/** Plan usage scopes (OpenAI « Sign in with ChatGPT », token sharing). */
const PLAN_SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';

export interface ModelConnection {
  payer: core.AiPayer;
  token: string;
  model: string;
  /** The plan rejects some parameters; a key accepts them. */
  plan: boolean;
}

/** Estimated price per million tokens, in micro-dollars (input, output); a plan costs the company nothing. */
const PRICES: Record<string, [number, number]> = {
  'gpt-4.1-mini': [400_000, 1_600_000], 'gpt-4.1': [2_000_000, 8_000_000], 'gpt-4o-mini': [150_000, 600_000], 'gpt-4o': [2_500_000, 10_000_000],
  'gpt-5-mini': [250_000, 2_000_000], 'gpt-5': [1_250_000, 10_000_000],
};
export const costMicroUsd = (connection: ModelConnection, inputTokens: number, outputTokens: number) => {
  if (connection.payer === 'plan') return 0;
  const [input, output] = PRICES[connection.model] ?? [400_000, 1_600_000];
  return Math.round((inputTokens * input + outputTokens * output) / 1_000_000);
};

export const planAvailable = (rt: Runtime) => Boolean(rt.env.OPENAI_SIWC_CLIENT_ID);

/** The connection a person's turn uses, refreshing her plan's token when it is about to expire. */
export async function connectionFor(rt: Runtime, actor: core.Actor): Promise<ModelConnection> {
  const resolved = await core.resolveAiPayer(rt.db, actor, Boolean(rt.env.OPENAI_API_KEY));
  if (resolved.payer === 'company') return { payer: 'company', token: rt.env.OPENAI_API_KEY, model: rt.env.OPENAI_AGENT_MODEL, plan: false };
  const box = secretBox(rt.env);
  const mine = resolved.connection;
  if (mine.kind === 'api_key') return { payer: 'personal', token: box.open(mine.secretSealed), model: mine.model ?? rt.env.OPENAI_AGENT_MODEL, plan: false };
  let token = box.open(mine.secretSealed);
  if (mine.expiresAt && new Date(mine.expiresAt).getTime() - Date.now() < 120_000 && mine.refreshSealed) {
    const fresh = await refreshPlan(rt, box.open(mine.refreshSealed));
    if (!fresh) {
      await core.removeMyAiConnection(rt.db, actor);
      throw new core.DomainError('ai_reconnect', 401);
    }
    await core.saveMyAiConnection(rt.db, actor, { kind: 'plan', provider: mine.provider, model: mine.model, hint: mine.hint, secretSealed: box.seal(fresh.access),
      refreshSealed: box.seal(fresh.refresh ?? box.open(mine.refreshSealed)), expiresAt: fresh.expiresAt });
    token = fresh.access;
  }
  return { payer: 'plan', token, model: mine.model ?? 'gpt-5-mini', plan: true };
}

/** Tries a key (or a token) by listing its models: no token is spent. Returns the models offered. */
export async function tryOpenAi(token: string): Promise<string[] | null> {
  const response = await fetch(`${OPENAI_API}/models`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => ({}))) as { data?: { id?: string; slug?: string; visibility?: string }[] };
  return (body.data ?? []).filter((model) => !model.visibility || model.visibility === 'list').map((model) => model.slug ?? model.id ?? '').filter(Boolean);
}

/** A model the assistant can use among those offered (a small fast one first). */
export const pickModel = (models: string[], fallback: string) =>
  ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini', 'gpt-5', 'gpt-4.1', 'gpt-4o'].find((model) => models.includes(model)) ?? (models.includes(fallback) ? fallback : models[0] ?? fallback);

// ---------------------------------------------------------------- Sign in with ChatGPT (OAuth + PKCE)

const b64url = (buffer: Buffer) => buffer.toString('base64url');

/** Starts the sign-in: the authorize URL, and the transaction kept in a short-lived signed cookie. */
export function startPlanSignIn(rt: Runtime, redirectUri: string) {
  const verifier = b64url(randomBytes(48));
  const state = b64url(randomBytes(24));
  const nonce = b64url(randomBytes(24));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const url = new URL(AUTHORIZE);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: rt.env.OPENAI_SIWC_CLIENT_ID, redirect_uri: redirectUri, scope: PLAN_SCOPES, state, nonce,
    code_challenge: challenge, code_challenge_method: 'S256', resource: OPENAI_API, prompt: 'consent',
  }).toString();
  return { url: url.toString(), transaction: sign(rt, JSON.stringify({ verifier, state, nonce, at: Date.now() })) };
}

/** Finishes the sign-in: checks the state, exchanges the code, returns the tokens and the account. */
export async function finishPlanSignIn(rt: Runtime, input: { code: string; state: string; transaction: string; redirectUri: string }) {
  const raw = unsign(rt, input.transaction);
  if (!raw) return null;
  const transaction = JSON.parse(raw) as { verifier: string; state: string; at: number };
  if (transaction.state !== input.state || Date.now() - transaction.at > 10 * 60_000) return null;
  const tokens = await tokenRequest(rt, { grant_type: 'authorization_code', code: input.code, redirect_uri: input.redirectUri, code_verifier: transaction.verifier });
  if (!tokens) return null;
  const claims = tokens.idToken ? decodeJwt(tokens.idToken) : {};
  return { ...tokens, email: typeof claims.email === 'string' ? claims.email : null };
}

async function refreshPlan(rt: Runtime, refreshToken: string) {
  return tokenRequest(rt, { grant_type: 'refresh_token', refresh_token: refreshToken });
}

export async function revokePlan(rt: Runtime, refreshToken: string) {
  await fetch(REVOKE, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token', client_id: rt.env.OPENAI_SIWC_CLIENT_ID }) }).catch(() => undefined);
}

async function tokenRequest(rt: Runtime, params: Record<string, string>) {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (rt.env.OPENAI_SIWC_CLIENT_SECRET) {
    headers.authorization = `Basic ${Buffer.from(`${rt.env.OPENAI_SIWC_CLIENT_ID}:${rt.env.OPENAI_SIWC_CLIENT_SECRET}`).toString('base64')}`;
  }
  const response = await fetch(TOKEN, { method: 'POST', headers, body: new URLSearchParams({ ...params, client_id: rt.env.OPENAI_SIWC_CLIENT_ID }), signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string };
  if (!body.access_token) return null;
  return { access: body.access_token, refresh: body.refresh_token ?? null, idToken: body.id_token ?? null,
    expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000).toISOString() };
}

function decodeJwt(token: string): Record<string, unknown> {
  try { return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>; } catch { return {}; }
}

// ---------------------------------------------------------------- signatures (drafts, transactions)

const signingKey = (rt: Runtime) => createHash('sha256').update(`struo-intelligence:${rt.env.SECRETS_KEY || rt.env.BETTER_AUTH_SECRET}`).digest();

export function sign(rt: Runtime, payload: string): string {
  const body = b64url(Buffer.from(payload, 'utf8'));
  return `${body}.${b64url(createHmac('sha256', signingKey(rt)).update(body).digest())}`;
}

export function unsign(rt: Runtime, token: string): string | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', signingKey(rt)).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Buffer.from(body, 'base64url').toString('utf8');
}
