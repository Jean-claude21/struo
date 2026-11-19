// Container entry point: apply the migrations with the owner connection (unless MIGRATE_ON_START is
// false), give struo_app its password, then start the server. Bundled to start.mjs in the image.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPool } from '../packages/core/src/db.ts';
import { migrate } from '../packages/core/src/migrate.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const ownerUrl = process.env.DATABASE_OWNER_URL;
if (ownerUrl && process.env.MIGRATE_ON_START !== 'false') {
  const owner = createPool(ownerUrl, 1);
  try {
    const applied = await migrate(owner, {
      appPassword: process.env.APP_DB_PASSWORD || undefined,
      directory: process.env.MIGRATIONS_DIR ?? path.join(here, 'migrations'),
      log: (line) => console.info(`[migrate] ${line}`),
    });
    console.info(`[migrate] ${applied.length} migration(s) applied`);
  } finally {
    await owner.end();
  }
}
await import(pathToFileURL(path.join(here, '.output/server/index.mjs')).href);
