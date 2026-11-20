// Demo company with fictional data (never in production): « Kekeli Construction SARL », a building
// company in Lomé with a team of seven, nine sites at every stage (studies, foundations, structure,
// roofing, finishing, done, suspended, not started), twelve months of field reports with photos,
// validated progress, invoices, payments, reminders, expenses, milestones linked by dependencies,
// documents, incidents, deliveries, checklists, signed reports and client spaces with messages.
// The photos are generated images (scripts/demo/photos), no real person nor real site.
// Re-running it replaces the demo company. Dates are relative to today so the alerts stay live.
//
//   pnpm db:seed                      (local: apps/web/.env.local)
//   SEED_PASSWORD=… pnpm db:seed      (choose the demo password; otherwise one is generated)
//
// The accounts and their password are written to .local/seed-credentials.txt (git-ignored).
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import * as core from '@struo/core';
import { createStorage } from '../src/server/adapters.server.ts';
import type { Env } from '../src/server/env.server.ts';
import { DEMO_NAME, seedDemoCompany } from './demo-company.ts';

const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!appUrl || !ownerUrl) throw new Error('DATABASE_URL and DATABASE_OWNER_URL are required');
if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW !== 'yes') throw new Error('refusing to seed production');

const here = path.dirname(fileURLToPath(import.meta.url));
const owner = core.createPool(ownerUrl, 2);
const app = core.createPool(appUrl, 4);
const storage = createStorage({
  S3: process.env.S3_BUCKET ? {
    bucket: process.env.S3_BUCKET, endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION ?? 'auto',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  } : null,
  // A relative folder is the repository's (where `pnpm start` and the preview run), not this script's.
  STORAGE_DIR: path.resolve(here, '../../..', process.env.STORAGE_DIR ?? './storage'),
} as unknown as Env);
const password = process.env.SEED_PASSWORD ?? `demo-${randomBytes(5).toString('hex')}`;
const hash = await hashPassword(password);

const result = await seedDemoCompany(
  { owner, app, storage, assetsDir: path.join(here, 'demo'), passwordHash: hash, baseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000', log: (message) => console.log(message) },
  { name: DEMO_NAME, email: (_key, standard) => standard, replaceExisting: true },
);

await app.end();
await owner.end();

const local = path.resolve(here, '../../../.local');
mkdirSync(local, { recursive: true });
writeFileSync(path.join(local, 'seed-credentials.txt'), [
  `Demo company: ${DEMO_NAME}`,
  `Password (all accounts): ${password}`,
  ...result.users.map((user) => `${user.email.padEnd(22)} ${user.name.padEnd(16)} ${user.role}`),
  '',
  'Client spaces:',
  ...result.portals.map((portal) => `${portal.code.padEnd(6)} ${portal.contact.padEnd(40)} ${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/portal/${portal.token}${portal.requireCode ? '   (code e-mail requis)' : ''}`),
  '',
].join('\n'));
console.log(`Demo company ready: ${DEMO_NAME} (${result.orgId}). Accounts in .local/seed-credentials.txt`);
