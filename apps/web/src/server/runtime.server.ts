import { createPool, type Db, type Drafter, type Mailer, type Messenger, type Storage } from '@struo/core';
import { betterAuth } from 'better-auth';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { createDrafter, createMailer, createMessenger, createStorage, secretBox } from './adapters.server.ts';
import { env, type Env } from './env.server.ts';
import { startJobs } from './jobs.server.ts';

function createAuth(environment: Env, db: Db) {
  return betterAuth({
    appName: 'Struo',
    secret: environment.BETTER_AUTH_SECRET,
    baseURL: environment.APP_BASE_URL,
    basePath: '/api/auth',
    // The application role: identity tables are reachable, company tables only under RLS.
    database: db,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    rateLimit: {
      enabled: environment.APP_ENV === 'production',
      window: 60,
      max: 100,
      customRules: { '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 60, max: 5 } },
    },
    advanced: { cookiePrefix: 'struo', useSecureCookies: environment.APP_BASE_URL.startsWith('https://') },
    plugins: [tanstackStartCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export interface Runtime {
  env: Env;
  /** Connects as struo_app: row-level security applies. */
  db: Db;
  /** Owner connection: portal payments, webhooks, platform console and jobs only. */
  owner: Db;
  auth: Auth;
  storage: Storage;
  mailer: Mailer;
  messenger: Messenger;
  drafter: Drafter;
  secrets: ReturnType<typeof secretBox>;
}

let current: Runtime | undefined;

export function runtime(): Runtime {
  if (current) return current;
  const environment = env();
  const db = createPool(environment.DATABASE_URL, 10);
  const owner = createPool(environment.DATABASE_OWNER_URL || environment.DATABASE_URL, 3);
  current = {
    env: environment,
    db,
    owner,
    auth: createAuth(environment, db),
    storage: createStorage(environment),
    mailer: createMailer(environment),
    messenger: createMessenger(environment),
    drafter: createDrafter(environment),
    secrets: secretBox(environment),
  };
  if (environment.JOBS_ENABLED && environment.APP_ENV !== 'test') startJobs(current);
  return current;
}
