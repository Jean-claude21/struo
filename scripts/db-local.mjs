#!/usr/bin/env node
// Local PostgreSQL 17 cluster for development and tests — no container (constitution).
//   node scripts/db-local.mjs start|stop|reset|status|url
// Binaries: PG_BIN, else the PATH. Data: .local/pgdata, port STRUO_DB_PORT (54330).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PGDATA = path.join(ROOT, '.local', 'pgdata');
const PORT = Number(process.env.STRUO_DB_PORT ?? 54330);
const bin = (name) => (process.env.PG_BIN ? path.join(process.env.PG_BIN, name) : name);
const run = (cmd, args, opts = {}) =>
  spawnSync(bin(cmd), args, { encoding: 'utf8', stdio: opts.quiet ? 'pipe' : 'inherit', ...opts });

const OWNER_URL = `postgresql://postgres@localhost:${PORT}/struo`;
const TEST_URL = `postgresql://postgres@localhost:${PORT}/struo_test`;

function start() {
  if (!existsSync(path.join(PGDATA, 'PG_VERSION'))) {
    mkdirSync(PGDATA, { recursive: true });
    const init = run('initdb', ['-D', PGDATA, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-locale'], {
      quiet: true,
    });
    if (init.status !== 0) throw new Error(init.stderr);
  }
  const status = run('pg_ctl', ['-D', PGDATA, 'status'], { quiet: true });
  if (status.status !== 0) {
    const started = spawnSync(
      bin('pg_ctl'),
      ['-D', PGDATA, '-o', `-p ${PORT}`, '-l', path.join(ROOT, '.local', 'pg.log'), '-w', 'start'],
      { stdio: 'ignore' },
    );
    if (started.status !== 0) throw new Error('pg_ctl start failed (see .local/pg.log)');
  }
  for (const db of ['struo', 'struo_test']) {
    const exists = run('psql', ['-p', String(PORT), '-U', 'postgres', '-tAc', `select 1 from pg_database where datname='${db}'`, 'postgres'], { quiet: true });
    if (!exists.stdout.trim()) run('createdb', ['-p', String(PORT), '-U', 'postgres', db]);
  }
  console.log(`PostgreSQL ready on port ${PORT}`);
  console.log(`DATABASE_OWNER_URL=${OWNER_URL}`);
  console.log(`TEST_DATABASE_URL=${TEST_URL}`);
}

const command = process.argv[2] ?? 'status';
if (command === 'start') start();
else if (command === 'stop') run('pg_ctl', ['-D', PGDATA, 'stop', '-m', 'fast']);
else if (command === 'status') run('pg_ctl', ['-D', PGDATA, 'status']);
else if (command === 'reset') {
  run('pg_ctl', ['-D', PGDATA, 'stop', '-m', 'fast'], { quiet: true });
  rmSync(PGDATA, { recursive: true, force: true });
  start();
} else if (command === 'url') console.log(OWNER_URL);
else throw new Error(`Unknown command: ${command}`);
