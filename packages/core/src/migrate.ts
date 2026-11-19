import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.ts';

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');

/**
 * Applies the SQL migrations not yet applied, in order, each in its own transaction, with an
 * advisory lock so two processes never migrate at once. An applied migration whose file changed
 * stops everything: migrations are additive (constitution).
 * Must run with the owner connection. When `appPassword` is given, the `struo_app` role receives
 * LOGIN and that password.
 */
export async function migrate(
  owner: Db,
  options: { appPassword?: string; directory?: string; log?: (line: string) => void } = {},
): Promise<string[]> {
  const directory = options.directory ?? MIGRATIONS_DIR;
  const log = options.log ?? (() => undefined);
  const client = await owner.connect();
  const applied: string[] = [];
  try {
    await client.query('select pg_advisory_lock(727001)');
    await client.query(`create table if not exists schema_migration (
      name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
    const { rows } = await client.query<{ name: string; checksum: string }>('select name, checksum from schema_migration');
    const done = new Map(rows.map((row) => [row.name, row.checksum]));
    const files = readdirSync(directory).filter((file) => /^\d{4}_.+\.sql$/u.test(file)).sort();
    for (const file of files) {
      const sql = readFileSync(path.join(directory, file), 'utf8');
      const checksum = createHash('sha256').update(sql.replace(/\r\n/gu, '\n')).digest('hex');
      const previous = done.get(file);
      if (previous) {
        if (previous !== checksum) throw new Error(`Migration ${file} was edited after being applied.`);
        continue;
      }
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migration (name, checksum) values ($1, $2)', [file, checksum]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
      applied.push(file);
      log(`applied ${file}`);
    }
    if (options.appPassword) {
      const literal = client.escapeLiteral(options.appPassword);
      await client.query(`alter role struo_app with login password ${literal}`);
    }
  } finally {
    await client.query('select pg_advisory_unlock(727001)').catch(() => undefined);
    client.release();
  }
  return applied;
}
