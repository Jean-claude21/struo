// Applies the SQL migrations with the owner connection, then gives struo_app its password.
//   DATABASE_OWNER_URL=... APP_DB_PASSWORD=... pnpm db:migrate
import { createPool } from '../packages/core/src/db.ts';
import { migrate } from '../packages/core/src/migrate.ts';

const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_OWNER_URL is empty.');
const owner = createPool(url, 1);
try {
  const applied = await migrate(owner, { appPassword: process.env.APP_DB_PASSWORD || undefined, log: console.log });
  console.log(applied.length ? `${applied.length} migration(s) applied.` : 'Database up to date.');
} finally {
  await owner.end();
}
