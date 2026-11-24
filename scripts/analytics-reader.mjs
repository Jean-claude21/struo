// Spec 076: the read-only login of the founder's dashboards (Metabase). It may read the `analytics`
// views (no personal data) and nothing else, in read-only transactions with a time limit. The password
// is generated once and kept in the secrets file; nothing secret is printed.
//   node scripts/analytics-reader.mjs production|staging
import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const env = process.argv[2] ?? 'production';
const branchName = { production: 'main', staging: 'dev' }[env];
if (!branchName) throw new Error('usage: node scripts/analytics-reader.mjs production|staging');
const secretsDir = path.resolve(import.meta.dirname, '../../.secrets');
const read = (file) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/u)
  .filter((line) => /^[A-Z0-9_]+=/u.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
const OWN = path.join(secretsDir, 'struo.env');
const admin = read(path.join(secretsDir, '.admin.env'));
const own = read(OWN);
const neon = async (url) => {
  const res = await fetch(`https://console.neon.tech/api/v2${url}`, { headers: { authorization: `Bearer ${admin.NEON_API_TOKEN}` } });
  if (!res.ok) throw new Error(`Neon ${res.status}`);
  return res.json();
};
const project = own.NEON_PROJECT_ID;
const { branches } = await neon(`/projects/${project}/branches`);
const branch = branches.find((item) => item.name === branchName);
const { roles } = await neon(`/projects/${project}/branches/${branch.id}/roles`);
const ownerRole = roles.find((r) => r.name !== 'struo_app' && !r.protected)?.name ?? 'neondb_owner';
const { databases } = await neon(`/projects/${project}/branches/${branch.id}/databases`);
const database = databases[0].name;
const { uri } = await neon(`/projects/${project}/connection_uri?branch_id=${branch.id}&role_name=${ownerRole}&database_name=${database}`);

const KEY = `METABASE_DB_PASSWORD_${env.toUpperCase()}`;
let password = own[KEY];
if (!password) {
  password = randomBytes(24).toString('base64url');
  appendFileSync(OWN, `\n${KEY}=${password}\n`);
}
const client = new pg.Client({ connectionString: uri });
await client.connect();
try {
  const exists = (await client.query(`select 1 from pg_roles where rolname = 'struo_metabase'`)).rowCount;
  await client.query(`${exists ? 'alter' : 'create'} role struo_metabase login password '${password.replace(/'/gu, "''")}'`);
  await client.query(`alter role struo_metabase set default_transaction_read_only = on`);
  await client.query(`alter role struo_metabase set statement_timeout = '60s'`);
  await client.query(`grant connect on database "${database}" to struo_metabase`);
  await client.query('grant usage on schema analytics to struo_metabase');
  await client.query('grant select on all tables in schema analytics to struo_metabase');
  await client.query('alter default privileges in schema analytics grant select on tables to struo_metabase');
  // Nothing in the application's schema: the views are the only door.
  await client.query('revoke all on all tables in schema public from struo_metabase');
  const host = new URL(uri).host;
  console.log(`Reader « struo_metabase » ready on ${env} (host ${host}, database ${database}); password kept as ${KEY}.`);
} finally {
  await client.end();
}
