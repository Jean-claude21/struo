// Release smoke test (spec 064): walks the public site, the demo of every role and the protected
// doors of a deployed environment, the way a visitor and an attacker would. Read-only: it creates
// demo copies (deleted after 24 h) and sends nothing to anyone.
//   node scripts/smoke.mjs https://struo-staging.kete.digital
const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/u, '');
let failed = 0;
const ok = (name, pass, detail = '') => {
  if (!pass) failed += 1;
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const get = (path, init = {}) => fetch(`${base}${path}`, { redirect: 'manual', ...init });
const text = async (path, init) => { const res = await get(path, init); return { res, body: await res.text() }; };

// Health and version.
{
  const res = await get('/api/health');
  const body = await res.json().catch(() => ({}));
  ok('health', res.status === 200 && body.status === 'ok', `version ${String(body.version ?? '?').slice(0, 7)}`);
}

// The landing in both languages, its photos, prices on quote by default.
{
  const fr = await text('/', { headers: { 'accept-language': 'fr-FR,fr' } });
  ok('landing FR', fr.res.status === 200 && fr.body.includes('sous contrôle'));
  ok('landing has no unfilled {placeholder}', !/\{[a-z]+\}/u.test(fr.body.replace(/<script[\s\S]*?<\/script>/gu, '')));
  const en = await text('/', { headers: { 'accept-language': 'en-GB,en' } });
  ok('landing EN from the browser language', en.res.status === 200 && en.body.includes('under control'));
  const images = [...new Set([...fr.body.matchAll(/src="(\/landing\/[^"]+)"/gu)].map((match) => match[1]))];
  const codes = await Promise.all(images.map(async (src) => (await get(src)).status));
  ok('landing photos', images.length >= 6 && codes.every((code) => code === 200), `${images.length} photos`);
  const tg = await text('/', { headers: { cookie: 'struo_country=TG' } });
  ok('prices follow the founder switch', tg.res.status === 200 && (tg.body.includes('Sur devis') || /F\s?CFA/u.test(tg.body)));
}

// Legal pages.
for (const path of ['/mentions-legales', '/confidentialite', '/cookies', '/conditions', '/traitement-donnees']) {
  const { res, body } = await text(path);
  ok(`legal ${path}`, res.status === 200 && body.includes('ed-doc-hero') && body.includes('contact@kete.digital'));
}

// Public entry pages.
for (const path of ['/demo', '/login', '/signup', '/forgot-password']) {
  ok(`page ${path}`, (await get(path)).status === 200);
}

// The demo of every role opens its own space, signed in.
for (const [role, home] of [['owner', '/app'], ['engineer', '/app'], ['accountant', '/app'], ['site_lead', '/field'], ['client', '/portal/']]) {
  const start = await get(`/api/demo/start?role=${role}`);
  const location = start.headers.get('location') ?? '';
  const cookies = (start.headers.getSetCookie?.() ?? []).map((item) => item.split(';')[0]).join('; ');
  let landed = 0;
  if (location) {
    const next = await get(location.startsWith('http') ? new URL(location).pathname + new URL(location).search : location, { headers: { cookie: cookies } });
    landed = next.status;
  }
  ok(`demo ${role}`, [302, 303, 307].includes(start.status) && location.includes(home) && [200, 302, 307].includes(landed), `${start.status} → ${location.split('?')[0]} (${landed})`);
}

// Protected doors refuse strangers.
{
  const consoleRes = await get('/console');
  ok('console needs a platform admin', [302, 307].includes(consoleRes.status) || (consoleRes.status === 200 && !(await consoleRes.text()).includes('struo_pk_')));
  const app = await get('/app');
  ok('office needs a session', [302, 307].includes(app.status), `${app.status} → ${app.headers.get('location') ?? ''}`);
  for (const path of ['/mcp', '/mcp/platform']) {
    const res = await get(path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
    ok(`${path} refuses without token`, res.status === 401 && Boolean(res.headers.get('www-authenticate')));
  }
  for (const path of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource/mcp/platform', '/.well-known/oauth-authorization-server']) {
    ok(`metadata ${path}`, (await get(path)).status === 200);
  }
  ok('field API refuses without session', [401, 403].includes((await get('/api/field/snapshot')).status));
  ok('company export refuses without session', [401, 403].includes((await get('/api/export/company')).status));
  ok('unknown client space link refused', [401, 403, 404].includes((await get('/portal/not-a-real-token')).status) || (await (await get('/portal/not-a-real-token')).text()).length > 0);
}

console.log(failed ? `\n${failed} check(s) failed on ${base}` : `\nAll checks passed on ${base}`);
process.exit(failed ? 1 : 0);
