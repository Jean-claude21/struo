// Spec 076: sets up the founder's Metabase (once), connects Struo's analytics views (read-only login)
// and creates the first dashboard. Secrets stay in ../.secrets; nothing secret is printed.
//   node scripts/metabase-setup.mjs
import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const URL_ = 'https://metabase.kete.digital';
const dir = path.resolve(import.meta.dirname, '../../.secrets');
const read = (file) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/u)
  .filter((line) => /^[A-Z0-9_]+=/u.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
const MB = path.join(dir, 'metabase.env');
const own = read(path.join(dir, 'struo.env'));
let mb = read(MB);
const ADMIN_EMAIL = process.env.METABASE_ADMIN_EMAIL ?? read(path.join(dir, 'struo.env')).PLATFORM_ADMIN_EMAILS.split(',')[0];

const call = async (method, route, body, session) => {
  const res = await fetch(`${URL_}/api${route}`, { method, headers: { 'content-type': 'application/json', ...(session ? { 'x-metabase-session': session } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};

// 1. First admin (only while Metabase is not set up).
const props = await call('GET', '/session/properties');
if (!props['has-user-setup']) {
  const password = `${randomBytes(18).toString('base64url')}Aa1!`;
  appendFileSync(MB, `METABASE_ADMIN_EMAIL=${ADMIN_EMAIL}\nMETABASE_ADMIN_PASSWORD=${password}\n`);
  await call('POST', '/setup', {
    token: props['setup-token'],
    user: { email: ADMIN_EMAIL, first_name: 'Admin', last_name: 'Kete', password, site_name: 'Kete' },
    prefs: { site_name: 'Kete', site_locale: 'fr', allow_tracking: false },
  });
  console.log('Metabase: admin created (password kept in .secrets/metabase.env).');
  mb = read(MB);
}
const { id: session } = await call('POST', '/session', { username: mb.METABASE_ADMIN_EMAIL, password: mb.METABASE_ADMIN_PASSWORD });

// 2. Struo, read-only, analytics views only.
const host = 'ep-winter-water-bh1gg4uj-pooler.c-10.eu-central-1.aws.neon.tech';
const databases = (await call('GET', '/database', null, session)).data ?? [];
let struo = databases.find((item) => item.name === 'Struo (production)');
if (!struo) {
  struo = await call('POST', '/database', {
    engine: 'postgres', name: 'Struo (production)', is_full_sync: true,
    details: { host, port: 5432, dbname: 'neondb', user: 'struo_metabase', password: own.METABASE_DB_PASSWORD_PRODUCTION, ssl: true, 'ssl-mode': 'require',
      'schema-filters-type': 'inclusion', 'schema-filters-patterns': 'analytics', 'tunnel-enabled': false, 'advanced-options': false },
  }, session);
  console.log('Metabase: Struo connected (analytics views, read-only).');
}

// 3. The first dashboard: the questions the founder asks every week.
const Q = [
  ['Entreprises créées par semaine', 'line', `select date_trunc('week', created_at)::date as semaine, count(*) as entreprises from analytics.companies where not internal group by 1 order by 1`],
  ['Où en sont les entreprises', 'pie', `select case when suspended then 'Suspendue' when paying then 'Payante' when on_trial and trial_ends_at > now() then 'En essai' when on_trial then 'Essai terminé' else 'Licence terminée' end as statut, count(*) as entreprises from analytics.companies where not internal group by 1`],
  ['Conversion essai → payant', 'scalar', `select round(100.0 * count(*) filter (where paying) / nullif(count(*), 0), 1) as "% payantes" from analytics.companies where not internal`],
  ['Licences vendues par mois', 'bar', `select date_trunc('month', l.redeemed_at)::date as mois, l.plan_code as formule, count(*) as licences from analytics.licences l join analytics.companies c using (org_id) where not c.internal group by 1, 2 order by 1`],
  ['Rapports de terrain par semaine', 'line', `select date_trunc('week', r.created_at)::date as semaine, count(*) as rapports, count(*) filter (where r.status = 'validated') as valides from analytics.field_reports r join analytics.companies c using (org_id) where not c.internal group by 1 order by 1`],
  ['Entreprises actives (rapport sur 30 jours)', 'scalar', `select count(distinct r.org_id) as actives from analytics.field_reports r join analytics.companies c using (org_id) where not c.internal and r.created_at > now() - interval '30 days'`],
  ['Factures émises par mois (par devise)', 'bar', `select date_trunc('month', i.issued_on)::date as mois, i.currency_code as devise, count(*) as factures from analytics.invoices i join analytics.companies c using (org_id) where not c.internal and i.status <> 'draft' and i.issued_on is not null group by 1, 2 order by 1`],
  ['Demandes de rappel par semaine', 'bar', `select date_trunc('week', created_at)::date as semaine, coalesce(country_code, '?') as pays, count(*) as demandes from analytics.callback_requests group by 1, 2 order by 1`],
  ['Coût IA par mois (USD)', 'bar', `select date_trunc('month', at)::date as mois, round(sum(cost_microusd) / 1e6, 2) as usd from analytics.ai_usage group by 1 order by 1`],
  ['Échecs e-mails et notifications (14 jours)', 'table', `select at::date as jour, kind, name, count(*) as fois from analytics.platform_events where kind in ('mail_failed', 'push_failed') and at > now() - interval '14 days' group by 1, 2, 3 order by 1 desc`],
];
const dashboards = await call('GET', '/dashboard', null, session);
if ((dashboards ?? []).some((item) => item.name === 'Struo — pilotage')) {
  console.log('Metabase: dashboard already there.');
} else {
  const cards = [];
  for (const [name, display, query] of Q) {
    cards.push(await call('POST', '/card', { name, display, visualization_settings: {}, dataset_query: { type: 'native', native: { query }, database: struo.id } }, session));
  }
  const dashboard = await call('POST', '/dashboard', { name: 'Struo — pilotage', description: 'Les chiffres de la semaine. Entreprises internes et démos exclues.' }, session);
  const layout = cards.map((card, index) => ({ id: -(index + 1), card_id: card.id, row: Math.floor(index / 2) * 6, col: (index % 2) * 12, size_x: 12, size_y: 6, parameter_mappings: [], visualization_settings: {} }));
  await call('PUT', `/dashboard/${dashboard.id}`, { dashcards: layout }, session);
  console.log(`Metabase: dashboard « Struo — pilotage » with ${cards.length} charts → ${URL_}/dashboard/${dashboard.id}`);
}
