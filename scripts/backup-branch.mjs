// Before a release (spec 064): freezes the production database in a Neon branch, so the release can be
// rolled back. Reads the same secrets as deploy.mjs; prints no secret.
//   node scripts/backup-branch.mjs production
import { readFileSync } from 'node:fs';
import path from 'node:path';

const env = process.argv[2] ?? 'production';
const source = { production: 'main', staging: 'dev' }[env];
if (!source) throw new Error('usage: node scripts/backup-branch.mjs production|staging');
const read = (file) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/u)
  .filter((line) => /^[A-Z0-9_]+=/u.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
const secrets = path.resolve(import.meta.dirname, '../../.secrets');
const admin = read(process.env.STRUO_ADMIN_SECRETS ?? path.join(secrets, '.admin.env'));
const own = read(process.env.STRUO_SECRETS ?? path.join(secrets, 'struo.env'));
const neon = async (url, init = {}) => {
  const res = await fetch(`https://console.neon.tech/api/v2${url}`, { ...init, headers: { authorization: `Bearer ${admin.NEON_API_TOKEN}`, 'content-type': 'application/json', ...init.headers } });
  if (!res.ok) throw new Error(`Neon ${res.status} on ${url}`);
  return res.json();
};
const project = own.NEON_PROJECT_ID;
const { branches } = await neon(`/projects/${project}/branches`);
const parent = branches.find((branch) => branch.name === source);
if (!parent) throw new Error(`branch ${source} not found`);
const name = `backup-${env}-${new Date().toISOString().slice(0, 16).replace(/[:T]/gu, '-')}`;
const created = await neon(`/projects/${project}/branches`, { method: 'POST', body: JSON.stringify({ branch: { name, parent_id: parent.id } }) });
console.log(`Neon: « ${name} » frozen from « ${source} » (${created.branch.id}). Keep it until the release is confirmed.`);
