import { asActor } from './access.ts';
import type { Actor, Db } from './db.ts';
import { DomainError } from './errors.ts';

export const SUBSCRIPTION_MONTHS = [1, 3, 6, 12] as const;

/**
 * Starts paying a plan for some months (spec 017). The amount comes from the plan table, never
 * from the browser. Owners and admins only.
 */
export async function startSubscriptionPayment(
  db: Db,
  actor: Actor,
  input: { planCode: string; months: number; provider: string },
): Promise<{ id: string; amountMinor: number; currencyCode: string; planName: string }> {
  if (actor.role !== 'owner' && actor.role !== 'admin') throw new DomainError('forbidden', 403);
  if (!(SUBSCRIPTION_MONTHS as readonly number[]).includes(input.months)) {
    throw new DomainError('invalid_input', 422, { field: 'months', detail: '' });
  }
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ price: number; currency: string; name: string }>(
      'select price_minor as price, currency_code as currency, name from plan where code = $1 and public and price_minor > 0',
      [input.planCode],
    );
    const plan = rows[0];
    if (!plan) throw new DomainError('plan_not_payable', 422);
    const amount = plan.price * input.months;
    const inserted = await tx.query<{ id: string }>(
      `insert into subscription_payment (org_id, plan_code, months, amount_minor, currency_code, provider, created_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [actor.orgId, input.planCode, input.months, amount, plan.currency, input.provider, actor.userId],
    );
    const id = inserted.rows[0]!.id;
    await tx.query(
      `insert into journal (org_id, command, target, after, actor, door) values ($1, 'subscription.start', $2, $3, $4, $5)`,
      [actor.orgId, id, JSON.stringify({ ...input, amount }), actor.userId, actor.door],
    );
    return { id, amountMinor: amount, currencyCode: plan.currency, planName: plan.name };
  });
}

/** The provider's checkout attached to a pending payment (owner connection: the platform's record). */
export async function attachSubscriptionCheckout(owner: Db, id: string, providerRef: string, checkoutUrl: string): Promise<void> {
  await owner.query(
    `update subscription_payment set provider_ref = $2, checkout_url = $3 where id = $1 and status = 'pending'`,
    [id, providerRef, checkoutUrl],
  );
}

export async function findSubscriptionPayment(owner: Db, by: { id?: string; provider?: string; providerRef?: string }) {
  const { rows } = await owner.query<{
    id: string; orgId: string; amountMinor: number; currencyCode: string; status: string; provider: string; planCode: string; months: number;
  }>(
    `select id, org_id as "orgId", amount_minor as "amountMinor", currency_code as "currencyCode", status, provider,
            plan_code as "planCode", months
       from subscription_payment
      where ($1::uuid is not null and id = $1) or ($2::text is not null and provider = $2 and provider_ref = $3)`,
    [by.id ?? null, by.provider ?? null, by.providerRef ?? null],
  );
  return rows[0] ?? null;
}

/**
 * Applies a verified outcome once: a succeeded payment switches the company to its plan and extends
 * « paid until » by its months (from today, or from the current end when still running).
 */
export async function settleSubscriptionPayment(
  owner: Db,
  outcome: { id: string; status: 'succeeded' | 'failed' | 'cancelled'; amountMinor: number; currencyCode: string },
): Promise<'applied' | 'ignored'> {
  const client = await owner.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<{
      org_id: string; plan_code: string; months: number; amount_minor: number; currency_code: string; status: string;
    }>('select * from subscription_payment where id = $1 for update', [outcome.id]);
    const payment = rows[0];
    if (!payment || payment.status !== 'pending') {
      await client.query('rollback');
      return 'ignored';
    }
    if (outcome.status === 'succeeded') {
      if (outcome.amountMinor !== payment.amount_minor || outcome.currencyCode !== payment.currency_code) {
        throw new DomainError('payment_mismatch', 422);
      }
      await client.query(`update subscription_payment set status = 'succeeded', paid_at = now() where id = $1`, [outcome.id]);
      await client.query(
        `update org_settings set plan_code = $2,
                paid_until = greatest(coalesce(paid_until, now()), now()) + make_interval(months => $3)
          where org_id = $1`,
        [payment.org_id, payment.plan_code, payment.months],
      );
    } else {
      await client.query('update subscription_payment set status = $2 where id = $1', [outcome.id, outcome.status]);
    }
    await client.query(
      `insert into journal (org_id, command, target, after, actor, door)
       values ($1, 'subscription.settle', $2, $3, 'platform', 'system')`,
      [payment.org_id, outcome.id, JSON.stringify(outcome)],
    );
    await client.query('commit');
    return 'applied';
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listSubscriptionPayments(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select s.id, p.name as "planName", s.months, s.amount_minor as "amountMinor", s.currency_code as "currencyCode",
              s.status, s.created_at as "createdAt", s.paid_at as "paidAt"
         from subscription_payment s join plan p on p.code = s.plan_code
        where s.org_id = $1 order by s.created_at desc limit 24`,
      [actor.orgId],
    );
    return rows as {
      id: string; planName: string; months: number; amountMinor: number; currencyCode: string; status: string; createdAt: string; paidAt: string | null;
    }[];
  });
}
