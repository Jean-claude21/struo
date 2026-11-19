import { randomUUID } from 'node:crypto';
import { createPool, migrate, createCompany, resolveActor, type Actor, type Db } from '../src/index.ts';

/**
 * Test databases: TEST_DATABASE_URL is an owner connection to a throw-away database (local cluster
 * or CI service). The schema is rebuilt from the migrations once per file; the application pool
 * connects as struo_app, so row-level security is really exercised.
 */
const OWNER_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:54330/struo_test';
const APP_PASSWORD = 'struo_test_password';

export interface TestDb {
  owner: Db;
  app: Db;
  close(): Promise<void>;
}

export async function setupDatabase(): Promise<TestDb> {
  const owner = createPool(OWNER_URL, 3);
  await owner.query('drop schema if exists public cascade');
  await owner.query('create schema public');
  await migrate(owner, { appPassword: APP_PASSWORD });
  const url = new URL(OWNER_URL);
  url.username = 'struo_app';
  url.password = APP_PASSWORD;
  const app = createPool(url.toString(), 5);
  return {
    owner,
    app,
    async close() {
      await app.end();
      await owner.end();
    },
  };
}

export async function createUser(owner: Db, name = 'Test User'): Promise<string> {
  const id = randomUUID();
  await owner.query('insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, true)', [
    id, name, `${id}@example.test`,
  ]);
  return id;
}

/** A company with its owner, ready to act. */
export async function createTestCompany(db: TestDb, name = 'Bâtiments Exemple SARL'): Promise<Actor> {
  const userId = await createUser(db.owner, `Owner of ${name}`);
  const { orgId } = await createCompany(db.app, userId, {
    name, countryCode: 'TG', currencyCode: 'XOF', vatBps: 1800, retentionBps: 500, locale: 'fr',
  });
  const actor = await resolveActor(db.app, userId, orgId, 'web');
  if (!actor) throw new Error('owner not resolved');
  return actor;
}

/** Adds a member with a role to a company and returns their actor. */
export async function addMember(db: TestDb, orgId: string, role: Actor['role']): Promise<Actor> {
  const userId = await createUser(db.owner, `${role} member`);
  await db.owner.query('insert into member (id, "organizationId", "userId", role) values ($1, $2, $3, $4)', [
    randomUUID(), orgId, userId, role,
  ]);
  const actor = await resolveActor(db.app, userId, orgId, 'web');
  if (!actor) throw new Error('member not resolved');
  return actor;
}

export const today = (offsetDays = 0) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};
