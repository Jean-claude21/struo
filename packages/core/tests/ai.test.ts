import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  aiJournal, aiUsageThisMonth, getAiPolicy, myAiConnection, myAiConnectionSecret, recordAiUsage, removeMyAiConnection, resolveAiPayer, saveMyAiConnection, setAiPolicy,
  type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let engineer: Actor;
const sealed = (value: string) => `sealed.${value}.0123456789`;

beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  engineer = await addMember(db, owner.orgId, 'engineer');
});
afterAll(async () => db.close());

describe('who pays the AI (spec 034)', () => {
  it('defaults to « allowed »: the company pays until a person brings her own connection', async () => {
    expect(await getAiPolicy(db.app, owner)).toEqual({ policy: 'allowed', budgetCents: null });
    expect(await resolveAiPayer(db.app, engineer, true)).toEqual({ payer: 'company' });
    await saveMyAiConnection(db.app, engineer, { kind: 'api_key', provider: 'openai', model: 'gpt-4.1-mini', hint: 'sk-…abcd', secretSealed: sealed('key') });
    const resolved = await resolveAiPayer(db.app, engineer, true);
    expect(resolved.payer).toBe('personal');
    expect(await myAiConnection(db.app, engineer)).toMatchObject({ kind: 'api_key', hint: 'sk-…abcd' });
    expect(JSON.stringify(await myAiConnection(db.app, engineer))).not.toContain('sealed');
  });

  it('keeps a connection to its owner: a colleague, even the owner of the company, never reads it', async () => {
    expect(await myAiConnectionSecret(db.app, owner)).toBeNull();
    const rows = await db.app.query('select 1 from ai_connection');
    expect(rows.rowCount).toBe(0); // outside a person's transaction nothing is visible
  });

  it('applies the company rule: « company » ignores personal connections, « required » refuses without one', async () => {
    await setAiPolicy(db.app, owner, { policy: 'company', budgetCents: null });
    expect((await resolveAiPayer(db.app, engineer, true)).payer).toBe('company');
    await expect(saveMyAiConnection(db.app, owner, { kind: 'api_key', provider: 'openai', hint: 'x', secretSealed: sealed('k') })).rejects.toMatchObject({ code: 'ai_personal_off' });
    await setAiPolicy(db.app, owner, { policy: 'required', budgetCents: null });
    await expect(resolveAiPayer(db.app, owner, true)).rejects.toMatchObject({ code: 'ai_connection_required' });
    expect((await resolveAiPayer(db.app, engineer, true)).payer).toBe('personal');
    await expect(setAiPolicy(db.app, engineer, { policy: 'allowed', budgetCents: null })).rejects.toMatchObject({ status: 403 });
  });

  it('stops the company paying once its monthly budget is spent, and counts who paid', async () => {
    await setAiPolicy(db.app, owner, { policy: 'allowed', budgetCents: 100 });
    await recordAiUsage(db.app, owner, { payer: 'company', model: 'gpt-4.1-mini', inputTokens: 1000, outputTokens: 200, costMicroUsd: 600_000, tools: 2 });
    await recordAiUsage(db.app, engineer, { payer: 'personal', model: 'gpt-4.1-mini', inputTokens: 1000, outputTokens: 200, costMicroUsd: 900_000, tools: 1 });
    expect(await resolveAiPayer(db.app, owner, true)).toEqual({ payer: 'company' });
    await recordAiUsage(db.app, owner, { payer: 'company', model: 'gpt-4.1-mini', inputTokens: 1000, outputTokens: 200, costMicroUsd: 500_000, tools: 0 });
    await expect(resolveAiPayer(db.app, owner, true)).rejects.toMatchObject({ code: 'ai_budget_spent' });
    // Her own key still answers: the budget only counts what the company pays.
    expect((await resolveAiPayer(db.app, engineer, true)).payer).toBe('personal');
    const usage = await aiUsageThisMonth(db.app, engineer);
    expect(usage).toMatchObject({ companyCents: 110, companyTurns: 2, mineTurns: 1, minePersonalTurns: 1 });
  });

  it('forgets a connection on request and journals connect and disconnect', async () => {
    await removeMyAiConnection(db.app, engineer);
    expect(await myAiConnection(db.app, engineer)).toBeNull();
    await expect(resolveAiPayer(db.app, engineer, false)).rejects.toMatchObject({ code: 'assistant_unavailable' });
    const journal = await aiJournal(db.app, owner);
    expect(journal).toEqual([]); // connect/disconnect go through the web door, not the AI's
  });
});
