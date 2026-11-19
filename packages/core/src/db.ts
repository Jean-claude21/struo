import pg from 'pg';

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

// bigint (int8) and numeric come back as strings by default; amounts fit in a JS number up to
// 9e15 minor units, far beyond any construction budget, so they are parsed as numbers.
pg.types.setTypeParser(20, (value) => Number(value));
pg.types.setTypeParser(1700, (value) => Number(value));
// Dates (no time) stay ISO strings: no time-zone shift.
pg.types.setTypeParser(1082, (value) => value);

export function createPool(connectionString: string, max = 10): Db {
  return new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000 });
}

/** Where an action comes from (journal). */
export type Door = 'web' | 'field' | 'api' | 'mcp' | 'portal' | 'job' | 'system';

/** The acting member of a company. Built by `resolveActor`, never from client input. */
export interface Actor {
  readonly userId: string;
  readonly orgId: string;
  readonly role: Role;
  readonly door: Door;
}

import type { Role } from './permissions.ts';
export { ROLES, type Role } from './permissions.ts';

/**
 * Runs `work` in one transaction as `userId`: row-level security then lets it reach only the
 * companies this user is a member of. The pool must connect as `struo_app` (NOBYPASSRLS).
 */
export async function asUser<T>(db: Db, userId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query('begin');
    await tx.query(`select set_config('struo.user_id', $1, true)`, [userId]);
    const result = await work(tx);
    await tx.query('commit');
    return result;
  } catch (error) {
    await tx.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    tx.release();
  }
}

/** Runs work in one transaction on a pool, without a user context (owner jobs, migrations). */
export async function inTransaction<T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query('begin');
    const result = await work(tx);
    await tx.query('commit');
    return result;
  } catch (error) {
    await tx.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    tx.release();
  }
}
