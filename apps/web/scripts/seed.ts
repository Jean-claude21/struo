// Demo company with fictional data (never in production): 5 sites at different stages, their phases,
// invoices, payments, expenses, milestones, documents, field reports and incidents, plus a team of
// four. Re-running it replaces the demo company. Dates are relative to today so the alerts stay live.
//
//   pnpm db:seed                      (local: apps/web/.env.local)
//   SEED_PASSWORD=… pnpm db:seed      (choose the demo password; otherwise one is generated)
//
// The accounts and their password are written to .local/seed-credentials.txt (git-ignored).
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import * as core from '@struo/core';

const DEMO_NAME = 'Démo BTP SARL';
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!appUrl || !ownerUrl) throw new Error('DATABASE_URL and DATABASE_OWNER_URL are required');
if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW !== 'yes') throw new Error('refusing to seed production');

const owner = core.createPool(ownerUrl, 2);
const app = core.createPool(appUrl, 4);
const password = process.env.SEED_PASSWORD ?? `demo-${randomBytes(5).toString('hex')}`;
const hash = await hashPassword(password);

const day = (offset: number) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); };
const at = (offset: number, hour = 9) => { const date = new Date(); date.setDate(date.getDate() + offset); date.setHours(hour, 15, 0, 0); return date.toISOString(); };

async function ensureUser(name: string, email: string): Promise<string> {
  const found = await owner.query<{ id: string }>('select id from "user" where email = $1', [email]);
  const id = found.rows[0]?.id ?? randomUUID();
  if (!found.rows[0]) {
    await owner.query('insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $2, $3, true, now(), now())', [id, name, email]);
  }
  await owner.query(`delete from account where "userId" = $1 and "providerId" = 'credential'`, [id]);
  await owner.query(
    `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, 'credential', $2, $3, now(), now())`,
    [randomUUID(), id, hash],
  );
  return id;
}

// ---------------------------------------------------------------- people and company
const afi = await ensureUser('Afi Mensah', 'demo@struo.test');
const jean = await ensureUser('Jean Dzifa', 'jean@struo.test');
const komi = await ensureUser('Komi Adadé', 'komi@struo.test');
const akossiwa = await ensureUser('Akossiwa Apo', 'akossiwa@struo.test');

const old = await owner.query<{ id: string }>('select o.id from organization o join member m on m."organizationId" = o.id where o.name = $1 and m."userId" = $2', [DEMO_NAME, afi]);
for (const row of old.rows) await owner.query('delete from organization where id = $1', [row.id]);

const { orgId } = await core.createCompany(app, afi, { name: DEMO_NAME, countryCode: 'TG', currencyCode: 'XOF', vatBps: 1800, retentionBps: 500, locale: 'fr' });
for (const [userId, role] of [[jean, 'engineer'], [komi, 'site_lead'], [akossiwa, 'accountant']] as const) {
  await owner.query('insert into member (id, "organizationId", "userId", role, "createdAt") values ($1, $2, $3, $4, now())', [randomUUID(), orgId, userId, role]);
}
await owner.query(`update org_settings set plan_code = 'pro', paid_until = now() + interval '1 month' where org_id = $1`, [orgId]);
const boss = (await core.resolveActor(app, afi, orgId, 'web'))!;
const engineer = (await core.resolveActor(app, jean, orgId, 'web'))!;
const lead = (await core.resolveActor(app, komi, orgId, 'field'))!;
const config = await core.getConfiguration(app, boss);
const typeId = (name: string) => config.projectTypes.find((type) => type.name.toLowerCase().startsWith(name.toLowerCase()))?.id ?? null;

// ---------------------------------------------------------------- clients and sites
const client = async (name: string, kind: 'individual' | 'company' | 'public', phone: string, email: string | null) =>
  (await core.createClient(app, boss, { name, kind, phone, email })).id;
const c1 = await client('M. Kodjo Amegah', 'individual', '+228 90 11 22 33', 'k.amegah@example.test');
const c2 = await client('Logistique du Golfe SA', 'company', '+228 22 21 40 50', 'compta@logistique-golfe.example.test');
const c3 = await client('Commune de Kloto', 'public', '+228 24 41 00 12', null);
const c4 = await client('Mme Ablavi Kossi', 'individual', '+228 91 45 67 89', 'ablavi.kossi@example.test');
const c5 = await client('Immo Plus SARL', 'company', '+228 22 50 60 70', 'direction@immoplus.example.test');

const M = 1_000_000;
const sites = [
  { code: 'P001', name: 'Villa R+1 Bè-Kpota', type: 'Rés', clientId: c1, location: 'Lomé, Bè-Kpota', lat: 6.1462, lng: 1.2402, start: -150, end: 120, status: 'active', budget: 48 * M, progress: [100, 100, 55, 0, 0] },
  { code: 'P002', name: 'Entrepôt Zone Portuaire', type: 'Com', clientId: c2, location: 'Lomé, Zone portuaire', lat: 6.1319, lng: 1.2885, start: -90, end: 150, status: 'active', budget: 62 * M, progress: [100, 80, 20, 0, 0] },
  { code: 'P003', name: 'Centre de santé de Kpalimé', type: 'Ins', clientId: c3, location: 'Kpalimé', lat: 6.9, lng: 0.6333, start: -60, end: 200, status: 'active', budget: 41 * M, progress: [100, 45, 0, 0, 0] },
  { code: 'P004', name: 'Rénovation maison Adidogomé', type: 'Rén', clientId: c4, location: 'Lomé, Adidogomé', lat: 6.1709, lng: 1.1897, start: -240, end: -20, status: 'done', budget: 18.9 * M, progress: [100, 100, 100, 100, 100] },
  { code: 'P005', name: 'Immeuble R+3 Agoè', type: 'Rés', clientId: c5, location: 'Lomé, Agoè', lat: 6.2278, lng: 1.2111, start: -210, end: 90, status: 'suspended', budget: 30 * M, progress: [100, 100, 35, 0, 0] },
] as const;
const ids: Record<string, string> = {};
for (const site of sites) {
  const { id } = await core.createProject(app, boss, {
    code: site.code, name: site.name, typeId: typeId(site.type), clientId: site.clientId, managerId: komi, location: site.location,
    latitude: site.lat, longitude: site.lng, startDate: day(site.start), endDate: day(site.end), status: site.status, budgetMinor: site.budget,
  });
  ids[site.code] = id;
  const detail = await core.getProject(app, boss, id);
  const weights = [0.08, 0.18, 0.42, 0.14, 0.18];
  for (const [index, phase] of detail.phases.entries()) {
    await core.updatePhase(app, boss, phase.id, { budgetMinor: Math.round(site.budget * (weights[index] ?? 0.1)), progressPct: site.progress[index] ?? 0 });
  }
}

// ---------------------------------------------------------------- invoices and payments
async function invoice(code: string, kind: 'advance' | 'progress' | 'final', amount: number, issued: number, due: number, label: string, deduction = 0) {
  return (await core.createInvoice(app, boss, { projectId: ids[code], kind, label, amountMinor: amount, deductionMinor: deduction, issuedOn: day(issued), dueOn: day(due) })).id;
}
/** Pays an invoice: its full net amount, or a share of it. */
async function pay(code: string, invoiceId: string, share: number, on: number, method: 'mobile_money' | 'transfer' | 'cheque', reference: string) {
  const net = (await core.listInvoices(app, boss, { projectId: ids[code] })).find((row) => row.id === invoiceId)!.netMinor;
  await core.recordPayment(app, boss, { projectId: ids[code], invoiceId, amountMinor: Math.round(net * share), method, receivedOn: day(on), reference });
}
const p1a = await invoice('P001', 'advance', 5 * M, -148, -138, 'Avance au démarrage');
await pay('P001', p1a, 1, -140, 'transfer', 'VIR-0381');
const p1b = await invoice('P001', 'progress', 8 * M, -60, -30, 'Situation n°1 · Fondations');
await pay('P001', p1b, 0.5, -25, 'mobile_money', 'TMoney 88231947');
await invoice('P001', 'progress', 6.5 * M, -12, 18, 'Situation n°2 · Gros œuvre');
const p2a = await invoice('P002', 'advance', 12 * M, -88, -78, 'Avance 20 %');
await pay('P002', p2a, 1, -80, 'transfer', 'VIR-1120');
await invoice('P002', 'progress', 9 * M, -20, 10, 'Situation n°1');
await invoice('P003', 'advance', 6 * M, -58, -28, 'Avance de démarrage');
const p4a = await invoice('P004', 'progress', 10 * M, -180, -150, 'Situation n°1');
await pay('P004', p4a, 1, -152, 'cheque', 'CHQ 004512');
const p4b = await invoice('P004', 'final', 6 * M, -40, -10, 'Décompte final');
await pay('P004', p4b, 1, -12, 'mobile_money', 'Flooz 55102');
const p5a = await invoice('P005', 'advance', 10 * M, -205, -195, 'Avance');
await pay('P005', p5a, 1, -196, 'transfer', 'VIR-0007');
await invoice('P005', 'progress', 7 * M, -120, -90, 'Situation n°1 · Fondations');
await invoice('P005', 'progress', 6.5 * M, -75, -45, 'Situation n°2 · Gros œuvre');

// ---------------------------------------------------------------- expenses
const expense = (code: string, category: (typeof core.EXPENSE_CATEGORIES)[number], label: string, supplier: string, amount: number, on: number) =>
  core.addExpense(app, boss, { projectId: ids[code], category, label, supplier, amountMinor: amount, spentOn: day(on) });
await expense('P001', 'materials', 'Ciment CPJ 45 · 300 sacs', 'Cimenterie du Golfe', 1_650_000, -100);
await expense('P001', 'materials', 'Fer à béton HA 10/12', 'Quincaillerie Lomé 2', 2_400_000, -70);
await expense('P001', 'labour', 'Main-d’œuvre gros œuvre (4 semaines)', 'Équipe Komi', 3_200_000, -30);
await expense('P001', 'equipment', 'Location bétonnière', 'Loc-Matériel', 280_000, -15);
await expense('P002', 'materials', 'Charpente métallique (acompte)', 'Métal Afrique', 9_500_000, -40);
await expense('P002', 'subcontracting', 'Terrassement', 'TP Services', 4_100_000, -80);
await expense('P003', 'materials', 'Agglos de 15 · 4 000 unités', 'Briqueterie Kpalimé', 1_400_000, -35);
await expense('P003', 'transport', 'Transport matériaux Lomé → Kpalimé', 'Transport Plateaux', 650_000, -33);
await expense('P004', 'materials', 'Carrelage et faïence', 'Céramique Plus', 2_900_000, -110);
await expense('P004', 'labour', 'Finitions', 'Équipe Komi', 3_800_000, -60);
await expense('P005', 'materials', 'Ciment et sable', 'Cimenterie du Golfe', 4_300_000, -150);
await expense('P005', 'labour', 'Main-d’œuvre fondations', 'Équipe Yao', 5_600_000, -120);

// ---------------------------------------------------------------- milestones
const milestone = async (code: string, name: string, category: string, planned: number, actual: number | null, client = false, action?: string) =>
  core.addMilestone(app, boss, { projectId: ids[code], name, category, plannedOn: day(planned), actualOn: actual === null ? null : day(actual), clientValidation: client, action, priority: actual === null && planned < 0 ? 'high' : 'normal' });
await milestone('P001', 'Signature du contrat', 'admin', -155, -155);
await milestone('P001', 'Obtention du permis de construire', 'admin', -140, -138);
await milestone('P001', 'Achèvement des fondations', 'technical', -60, -55, true);
await milestone('P001', 'Dalle du R+1 coulée', 'technical', 14, null);
await milestone('P001', 'Réception des travaux', 'delivery', 120, null, true);
await milestone('P002', 'Démarrage chantier', 'technical', -88, -88);
await milestone('P002', 'Charpente métallique posée', 'technical', 35, null);
await milestone('P002', 'Réception', 'delivery', 150, null, true);
await milestone('P003', 'Obtention du permis de construire', 'admin', -70, -62);
await milestone('P003', 'Achèvement des fondations', 'technical', -9, null, true, 'Relancer le fournisseur de ciment');
await milestone('P003', 'Mise hors d’eau', 'technical', 90, null);
await milestone('P004', 'Réception des travaux', 'delivery', -25, -20, true);
await milestone('P005', 'Achèvement des fondations', 'technical', -130, -128, true);
await milestone('P005', 'Plancher du R+2', 'technical', -40, null, false, 'Chantier suspendu : impayés');

// ---------------------------------------------------------------- documents
const docs = await core.listDocuments(app, boss);
const setDoc = async (code: string, name: string, status: 'valid' | 'pending' | 'to_fix' | 'missing', expires?: number, reference?: string) => {
  const doc = docs.find((row) => row.projectId === ids[code] && row.title.toLowerCase().includes(name.toLowerCase()));
  if (doc) await core.updateDocument(app, boss, doc.id, { status, expiresOn: expires === undefined ? null : day(expires), reference: reference ?? null, issuedOn: day(-100) });
};
for (const code of ['P001', 'P002', 'P003', 'P004', 'P005']) {
  await setDoc(code, 'contrat', 'valid', undefined, `CTR-${code}`);
  await setDoc(code, 'ordre', code === 'P003' ? 'pending' : 'valid');
}
await setDoc('P001', 'permis', 'valid', undefined, 'PC-2026-0412');
await setDoc('P001', 'assurance', 'valid', 210, 'RC-88120');
await setDoc('P002', 'permis', 'pending');
await setDoc('P002', 'assurance', 'to_fix', 12, 'RC-77401');
await setDoc('P003', 'permis', 'valid', undefined, 'PC-KL-118');
await setDoc('P003', 'assurance', 'valid', 25, 'RC-90233');
await setDoc('P004', 'permis', 'valid'); await setDoc('P004', 'assurance', 'valid', 300);
await setDoc('P005', 'permis', 'valid'); await setDoc('P005', 'assurance', 'valid', -20, 'RC-55018');

// ---------------------------------------------------------------- field reports and incidents
const phasesOf = async (code: string) => (await core.getProject(app, boss, ids[code]!)).phases;
const report = async (code: string, phaseIndex: number, progress: number | null, note: string, offset: number, validate: boolean) => {
  const phase = (await phasesOf(code))[phaseIndex];
  const id = randomUUID();
  await core.submitReport(app, lead, { id, projectId: ids[code], phaseId: progress === null ? null : phase?.id ?? null, progressPct: progress, note, takenAt: at(offset), latitude: sites.find((site) => site.code === code)!.lat, longitude: sites.find((site) => site.code === code)!.lng });
  await owner.query('update site_report set created_at = taken_at where id = $1', [id]);
  if (validate) await core.reviewReport(app, engineer, id, { decision: 'validated' });
};
await report('P001', 2, 45, 'Poteaux du rez-de-chaussée coulés. Coffrage du plancher en cours.', -14, true);
await report('P001', 2, 50, 'Ferraillage des poutres du plancher posé, contrôle de l’enrobage fait.', -6, true);
await report('P001', 2, 55, 'Ferraillage du plancher de l’étage posé. Coulage prévu vendredi si pas de pluie.', -1, false);
await report('P002', 1, 80, 'Longrines terminées. Livraison de la charpente annoncée pour la semaine prochaine.', -2, false);
await report('P003', 1, 45, 'Semelles terminées sur la moitié du bâtiment. Le ciment manque : livraison en retard.', -3, false);
await report('P003', 1, null, 'Pluie toute la matinée, arrêt du chantier jusqu’à 13 h.', 0, false);
await report('P002', 0, 100, 'Études et implantation validées avec le bureau de contrôle.', -40, true);
const incident = (code: string, kind: (typeof core.INCIDENT_KINDS)[number], priority: (typeof core.PRIORITIES)[number], description: string) =>
  core.reportIncident(app, lead, { id: randomUUID(), projectId: ids[code], kind, priority, description });
await incident('P003', 'defect', 'critical', 'Fissure sur un poteau de l’axe B après décoffrage.');
await incident('P003', 'material_delay', 'important', 'Livraison de 120 sacs de ciment reportée de 4 jours.');
await incident('P002', 'weather', 'info', 'Fortes pluies annoncées jeudi : terrassement suspendu.');

await app.end();
await owner.end();

const here = path.dirname(fileURLToPath(import.meta.url));
const local = path.resolve(here, '../../../.local');
mkdirSync(local, { recursive: true });
writeFileSync(path.join(local, 'seed-credentials.txt'), [
  `Demo company: ${DEMO_NAME}`,
  `Password (all accounts): ${password}`,
  'demo@struo.test      Afi Mensah     owner',
  'jean@struo.test      Jean Dzifa     engineer',
  'komi@struo.test      Komi Adadé     site lead',
  'akossiwa@struo.test  Akossiwa Apo   accountant',
  '',
].join('\n'));
console.log(`Demo company ready: ${DEMO_NAME} (${orgId}). Accounts in .local/seed-credentials.txt`);
