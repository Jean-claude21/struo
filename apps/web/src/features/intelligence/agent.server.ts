// A turn of Struo Intelligence (spec 034): the model reads and acts through the capabilities of the
// person's role, one step after another (Responses API, function calling), and every step is told
// as it happens — what it does, each capability with its level, the words as they are written, the
// drafts to validate, the sources. Committing gestures (levels 3 and 4) are never run here: they
// become signed drafts the person checks. Nothing is computed by the model: figures come from tools.
import * as core from '@struo/core';
import { z } from 'zod';
import type { Runtime } from '@/server/runtime.server.ts';
import { CAPABILITIES, capabilitiesFor, capabilityByName, contextFor, inputSchema, type Autonomy, type Source } from './capabilities.server.ts';
import { connectionFor, costMicroUsd, OPENAI_API, sign, type ModelConnection } from './model.server.ts';

export type IntelligenceEvent =
  | { type: 'start'; payer: core.AiPayer; model: string }
  | { type: 'status'; text: string }
  | { type: 'calling'; id: string; name: string; level: Autonomy }
  | { type: 'call'; id: string; name: string; ok: boolean; error?: string }
  | { type: 'text'; delta: string }
  | { type: 'draft'; id: string; name: string; level: Autonomy; summary: string; token: string }
  | { type: 'source'; source: Source }
  | { type: 'done'; tools: number; ms: number }
  | { type: 'failed'; code: string };

export interface TurnInput {
  question: string;
  history: { q: string; a: string }[];
  page: { path: string; label?: string; projectId?: string };
}

const MAX_STEPS = 8;
const MAX_OUTPUT = 40_000;

function instructions(actor: core.Actor, settings: { name: string; currencyCode: string; locale: string }, locale: 'fr' | 'en', page: TurnInput['page'], forbidden: string[]) {
  return [
    `You are Struo, the assistant of the construction company « ${settings.name} », working for a member whose role is ${actor.role}.`,
    `Today is ${new Date().toISOString().slice(0, 10)}. Currency ${settings.currencyCode}; amounts from tools are integers in minor units (XOF has no decimals): write them with spaces and the currency, e.g. 1 500 000 F CFA.`,
    `Answer in ${locale === 'en' ? 'English' : 'French'}, short and concrete, with plain sentences or short lists; name sites by their code (KC-01). No markdown headings, no tables.`,
    'Use the tools to read every figure; never guess or compute a total yourself. If a tool refuses (rights, not found), say so simply.',
    'You act with this person\'s rights only. Reversible changes (status, progress, milestone moves, incidents follow-up) you may do when asked, then say what changed.',
    'Gestures that commit (create a site or an invoice, record a payment or a reminder, write to a client, invite someone, cancel an invoice) only become a draft card the person validates: when she asks you to prepare or do one, call the tool right away with the right figures (read them first) — do not ask her permission, the card is her check. Then say in one sentence what the card contains and that it waits for her « Valider ». Never claim it is done.',
    forbidden.length
      ? `This role may NOT: ${forbidden.join(', ')}. When asked for one of these, answer plainly that her role does not allow it and who can (the manager, the accountant or the engineer). Never use another tool as a substitute, never create anything else instead, never pretend a card was prepared.`
      : '',
    'Use only the tools you have; when none fits the request, say so. Never invent an action you did not do.',
    'A figure you were not given is unknown to you, never zero: if a tool says amounts are hidden for this role, say that this role does not show money.',
    'When she asks « what if » about the planning, read the milestones and their dependencies (gantt) and explain the cascade with dates; only move milestones when she asks to.',
    page.label || page.projectId ? `The person asks from the page « ${page.label ?? page.path} »${page.projectId ? ` about the site whose id is ${page.projectId}` : ''}: assume questions are about it unless said otherwise.` : `The person asks from ${page.path}.`,
  ].join('\n');
}

type Item = Record<string, unknown>;

/** Streams one turn. `emit` is called for every event; `signal` stops it (what was read stays). */
export async function runTurn(rt: Runtime, actor: core.Actor, locale: 'fr' | 'en', turn: TurnInput, emit: (event: IntelligenceEvent) => void, signal: AbortSignal) {
  const started = Date.now();
  const aiActor: core.Actor = { ...actor, door: 'ai' };
  let connection: ModelConnection;
  try {
    connection = await connectionFor(rt, actor);
  } catch (error) {
    emit({ type: 'failed', code: error instanceof core.DomainError ? error.code : 'assistant_unavailable' });
    return;
  }
  emit({ type: 'start', payer: connection.payer, model: connection.model });
  const settings = await core.getSettings(rt.db, actor);
  const capabilities = capabilitiesFor(actor.role);
  const forbidden = CAPABILITIES.filter((capability) => !capabilities.includes(capability)).map((capability) => capability.name);
  const tools = capabilities.map((capability) => ({ type: 'function', name: capability.name, description: capability.description, parameters: inputSchema(capability), strict: false }));
  const context = contextFor(rt, aiActor, locale);
  const input: Item[] = [
    ...turn.history.slice(-6).flatMap((exchange) => [
      { role: 'user', content: exchange.q },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: exchange.a }] },
    ]),
    { role: 'user', content: turn.question },
  ];
  let inputTokens = 0; let outputTokens = 0; let used = 0;
  const seen = new Set<string>();

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (signal.aborted) break;
      emit({ type: 'status', text: step === 0 ? 'thinking' : 'reading' });
      const result = await respond(connection, { instructions: instructions(actor, settings, locale, turn.page, forbidden), input, tools }, (delta) => emit({ type: 'text', delta }), signal);
      inputTokens += result.usage.input; outputTokens += result.usage.output;
      const calls = result.output.filter((item) => item.type === 'function_call');
      if (!calls.length) break;
      input.push(...result.output.filter((item) => item.type === 'function_call' || item.type === 'reasoning'));
      for (const call of calls) {
        if (signal.aborted) break;
        const id = String(call.call_id); const name = String(call.name);
        const capability = capabilityByName.get(name);
        let output: unknown;
        if (!capability || !capabilities.includes(capability)) {
          output = { error: 'not_allowed' };
          emit({ type: 'call', id, name, ok: false, error: 'forbidden' });
        } else {
          emit({ type: 'calling', id, name, level: capability.autonomy });
          used += 1;
          try {
            const args = capability.input.parse(JSON.parse(String(call.arguments || '{}')));
            if (capability.autonomy >= 3) {
              const summary = capability.summary ? await capability.summary(context, args) : JSON.stringify(args);
              const token = sign(rt, JSON.stringify({ c: name, i: args, o: actor.orgId, u: actor.userId, e: Date.now() + 24 * 3_600_000 }));
              emit({ type: 'draft', id, name, level: capability.autonomy, summary, token });
              output = { status: 'draft_prepared', note: 'Shown to the person as a card to check and validate. Tell them; do not say it is done.' };
            } else {
              const value = await capability.run(context, args);
              output = value ?? { ok: true };
              for (const source of capability.sources?.(value, args) ?? []) {
                if (!seen.has(source.href)) { seen.add(source.href); emit({ type: 'source', source }); }
              }
            }
            emit({ type: 'call', id, name, ok: true });
          } catch (error) {
            const code = error instanceof core.DomainError ? error.code : error instanceof z.ZodError ? 'invalid_input' : 'failed';
            output = { error: code, ...(error instanceof z.ZodError ? { detail: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') } : {}) };
            emit({ type: 'call', id, name, ok: false, error: code });
          }
        }
        let serialized = JSON.stringify(output);
        if (serialized.length > MAX_OUTPUT) serialized = `${serialized.slice(0, MAX_OUTPUT)}… (truncated: ask a narrower question or filter by site)`;
        input.push({ type: 'function_call_output', call_id: id, output: serialized });
      }
    }
  } catch (error) {
    if (!signal.aborted) emit({ type: 'failed', code: error instanceof core.DomainError ? error.code : 'assistant_failed' });
  } finally {
    await core.recordAiUsage(rt.db, actor, {
      payer: connection.payer, model: connection.model, inputTokens, outputTokens, costMicroUsd: costMicroUsd(connection, inputTokens, outputTokens), tools: used,
    }).catch(() => undefined);
  }
  emit({ type: 'done', tools: used, ms: Date.now() - started });
}

/** One call to the Responses API, streamed: the words as they come, then every output item and the usage. */
async function respond(connection: ModelConnection, body: { instructions: string; input: Item[]; tools: unknown[] }, onText: (delta: string) => void, signal: AbortSignal) {
  const response = await fetch(`${OPENAI_API}/responses`, {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: connection.model, instructions: body.instructions, input: body.input, tools: body.tools, store: false, stream: true }),
  });
  if (response.status === 401) throw new core.DomainError(connection.payer === 'company' ? 'assistant_unavailable' : 'ai_reconnect', 401);
  if (response.status === 429) throw new core.DomainError('ai_rate_limited', 409);
  if (!response.ok || !response.body) throw new Error(`model ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output: Item[] = [];
  const usage = { input: 0, output: 0 };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, index); buffer = buffer.slice(index + 2);
      const data = chunk.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('');
      if (!data || data === '[DONE]') continue;
      let event: { type?: string; delta?: string; response?: { output?: Item[]; usage?: { input_tokens?: number; output_tokens?: number } } };
      try { event = JSON.parse(data); } catch { continue; }
      if (event.type === 'response.output_text.delta' && event.delta) onText(event.delta);
      if (event.type === 'response.completed' || event.type === 'response.incomplete') {
        output = event.response?.output ?? [];
        usage.input = event.response?.usage?.input_tokens ?? 0;
        usage.output = event.response?.usage?.output_tokens ?? 0;
      }
      if (event.type === 'response.failed' || event.type === 'error') throw new Error('model failed');
    }
  }
  return { output, usage };
}

/** Runs a draft the person validated: the signature proves it is exactly what she was shown. */
export async function confirmDraft(rt: Runtime, actor: core.Actor, locale: 'fr' | 'en', token: string, unsignToken: (token: string) => string | null) {
  const raw = unsignToken(token);
  if (!raw) throw new core.DomainError('invalid_input', 422);
  const draft = JSON.parse(raw) as { c: string; i: unknown; o: string; u: string; e: number };
  if (draft.o !== actor.orgId || draft.u !== actor.userId || Date.now() > draft.e) throw new core.DomainError('forbidden', 403);
  const capability = capabilityByName.get(draft.c);
  if (!capability || !capabilitiesFor(actor.role).includes(capability)) throw new core.DomainError('forbidden', 403);
  return capability.run(contextFor(rt, actor, locale), capability.input.parse(draft.i));
}
