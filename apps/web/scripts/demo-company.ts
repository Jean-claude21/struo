// The demo company (fictional): « Kekeli Construction SARL », a building company with a team
// of seven, nine sites at every stage, twelve months of field reports with photos, validated
// progress, invoices, payments, reminders, expenses, milestones with dependencies, documents,
// incidents, deliveries, checklists, signed reports and client spaces with messages.
// The photos are generated images (scripts/demo), no real person nor real site; they are stored once
// and shared by every demo company. Used by the seed script (staging, local) and by the
// try-without-account sandboxes (spec 042). Dates are relative to today so the alerts stay live.
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as core from '@struo/core';

export interface DemoContext {
  owner: core.Db;
  app: core.Db;
  storage: core.Storage;
  /** Folder with photos/, signatures/ and logo-kekeli.png. */
  assetsDir: string;
  /** Password hash given to every account of the company. */
  passwordHash: string;
  baseUrl: string;
  /** Seals a client link so the demo's later messages carry it (spec 049). */
  seal?: (token: string) => string;
  log?: (message: string) => void;
}

export interface DemoOptions {
  name: string;
  /** The e-mail of each account (the seeded demo keeps its addresses, sandboxes get unique ones). */
  email: (key: string, standard: string) => string;
  /** Deletes a previous company of the same name and owner first (the seed script). */
  replaceExisting: boolean;
}

export const DEMO_NAME = 'Kekeli Construction SARL';
const OLD_NAMES = [DEMO_NAME, 'Démo BTP SARL'];
/** Storages that already hold the shared demo files in this process. */
const uploadedTo = new WeakSet<object>();

export async function seedDemoCompany(ctx: DemoContext, options: DemoOptions) {
  const { owner, app, storage } = ctx;
  const log = ctx.log ?? (() => undefined);
  // A seeded random generator: the same demo every time.
  let seed = 20261119;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
  const between = (min: number, max: number) => Math.round(min + rnd() * (max - min));
  const round = (value: number, step = 5_000) => Math.round(value / step) * step;

  const day = (offset: number) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); };
  const at = (offset: number, hour = 9, minute = 15) => { const date = new Date(); date.setDate(date.getDate() + offset); date.setHours(hour, minute, 0, 0); return date.toISOString(); };
  const M = 1_000_000;

  async function ensureUser(name: string, email: string): Promise<string> {
    const found = await owner.query<{ id: string }>('select id from "user" where email = $1', [email]);
    const id = found.rows[0]?.id ?? randomUUID();
    if (!found.rows[0]) {
      await owner.query('insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, $2, $3, true, now(), now())', [id, name, email]);
    } else {
      await owner.query('update "user" set name = $2 where id = $1', [id, name]);
    }
    await owner.query(`delete from account where "userId" = $1 and "providerId" = 'credential'`, [id]);
    await owner.query(
      `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, 'credential', $2, $3, now(), now())`,
      [randomUUID(), id, ctx.passwordHash],
    );
    return id;
  }

  // ---------------------------------------------------------------- people and company
  const PEOPLE = [
    ['afi', 'Afi Mensah', 'demo@struo.test', 'owner'],
    ['jean', 'Jean Dzifa', 'jean@struo.test', 'engineer'],
    ['mawuli', 'Mawuli Tsatsu', 'mawuli@struo.test', 'engineer'],
    ['komi', 'Komi Adadé', 'komi@struo.test', 'site_lead'],
    ['yao', 'Yao Kpogo', 'yao@struo.test', 'site_lead'],
    ['edem', 'Edem Agbeko', 'edem@struo.test', 'site_lead'],
    ['akossiwa', 'Akossiwa Apo', 'akossiwa@struo.test', 'accountant'],
  ] as const;
  type Person = (typeof PEOPLE)[number][0];
  const userIds = {} as Record<Person, string>;
  for (const [key, name, email] of PEOPLE) userIds[key] = await ensureUser(name, options.email(key, email));

  if (options.replaceExisting) {
    const old = await owner.query<{ id: string }>(
      'select distinct o.id from organization o join member m on m."organizationId" = o.id where o.name = any($1) and m."userId" = $2', [OLD_NAMES, userIds.afi]);
    for (const row of old.rows) await owner.query('delete from organization where id = $1', [row.id]);
  }

  const { orgId } = await core.createCompany(app, userIds.afi, { name: options.name, countryCode: 'TG', currencyCode: 'XOF', vatBps: 1800, retentionBps: 500, locale: 'fr' });
  await owner.query(`update organization set "createdAt" = now() - interval '13 months' where id = $1`, [orgId]);
  for (const [key, , , role] of PEOPLE) {
    if (role === 'owner') continue;
    await owner.query('insert into member (id, "organizationId", "userId", role, "createdAt") values ($1, $2, $3, $4, now() - interval \'11 months\')', [randomUUID(), orgId, userIds[key], role]);
  }
  await owner.query(`update org_settings set plan_code = 'pro', paid_until = now() + interval '1 month', is_demo = true where org_id = $1`, [orgId]);
  const actors = {} as Record<Person, core.Actor>;
  for (const [key, , , role] of PEOPLE) actors[key] = (await core.resolveActor(app, userIds[key], orgId, role === 'site_lead' ? 'field' : 'web'))!;
  const boss = actors.afi;
  const config = await core.getConfiguration(app, boss);
  const typeId = (name: string) => config.projectTypes.find((type) => type.name.toLowerCase().startsWith(name.toLowerCase()))?.id ?? null;

  // ---------------------------------------------------------------- files (generated images)
  // Shared by every demo company (the seeded one and the try-without-account copies): stored once.
  const photoDir = path.join(ctx.assetsDir, 'photos');
  const photoKey: Record<string, string> = {};
  const firstUpload = !uploadedTo.has(storage);
  for (const file of readdirSync(photoDir).filter((name) => name.endsWith('.webp'))) {
    const name = file.replace('.webp', '');
    const key = `demo/photos/${name}`;
    if (firstUpload) await storage.put(key, new Uint8Array(readFileSync(path.join(photoDir, file))), 'image/webp');
    photoKey[name] = key;
  }
  const photoSize = (name: string) => readFileSync(path.join(photoDir, `${name}.webp`)).length;
  const signatureKeys: string[] = [];
  for (const file of ['sig1.png', 'sig2.png', 'sig3.png']) {
    const key = `demo/signatures/${file.replace('.png', '')}`;
    if (firstUpload) await storage.put(key, new Uint8Array(readFileSync(path.join(ctx.assetsDir, 'signatures', file))), 'image/png');
    signatureKeys.push(key);
  }
  log(`files: ${Object.keys(photoKey).length} photos, ${signatureKeys.length} signatures`);

  // The company's invoices: its (generated) logo, fictional legal and bank details, its look (spec 036).
  const logoKey = 'demo/branding/logo-kekeli';
  if (firstUpload) await storage.put(logoKey, new Uint8Array(readFileSync(path.join(ctx.assetsDir, 'logo-kekeli.png'))), 'image/png');
  uploadedTo.add(storage);
  await core.setCompanyLogo(app, boss, logoKey, `/api/files/logo/${orgId}`);
  await core.updateInvoiceSettings(app, boss, {
    legalName: 'Kekeli Construction SARL', taxId: '1000000000 (fictif)', tradeRegister: 'RC 0000-B-00000 (fictif)',
    address: '12 avenue des Bâtisseurs, Centre-ville', phone: '22 00 00 00', email: 'facturation@kekeli.example.test',
    bankDetails: 'Banque exemple — compte fictif\nTitulaire : Kekeli Construction SARL', mobileMoney: 'Paiement mobile : 90 00 00 00 (fictif)',
    paymentTerms: 'Paiement à 30 jours par virement ou mobile money. Retenue de garantie libérée à la réception définitive.',
    footer: 'Kekeli Construction SARL — société fictive de démonstration Struo',
    template: 'classic', accentColor: '#e8590c', showSignature: true, signerName: 'Afi Mensah', signerTitle: 'Gérante',
    titles: { progress: 'Situation de travaux' }, customFields: [{ label: 'Agrément', value: 'BTP catégorie B (fictif)' }],
  });

  // ---------------------------------------------------------------- clients
  const client = async (name: string, kind: 'individual' | 'company' | 'public', phone: string, email: string | null) =>
    (await core.createClient(app, boss, { name, kind, phone, email })).id;
  const clients = {
    amegah: await client('M. Kodjo Amegah', 'individual', '90 11 22 33', 'k.amegah@example.test'),
    cocotiers: await client('SCI Les Cocotiers', 'company', '22 21 40 50', 'gerance@cocotiers.example.test'),
    commune: await client('Commune de Bellevue', 'public', '22 25 10 12', 'services.techniques@bellevue.example.test'),
    golfe: await client('Logistique du Golfe SA', 'company', '22 27 33 90', 'achats@logistique-golfe.example.test'),
    grace: await client('Association Sainte-Grâce', 'company', '92 40 18 61', 'direction@saintegrace.example.test'),
    ong: await client('ONG Eau Vive', 'company', '22 61 77 05', 'admin@eauvive.example.test'),
    kossi: await client('Mme Ablavi Kossi', 'individual', '91 45 67 89', 'ablavi.kossi@example.test'),
    immo: await client('Immo Plus SARL', 'company', '22 50 60 70', 'direction@immoplus.example.test'),
  };

  // ---------------------------------------------------------------- sites
  // Phases (from the trade set up at sign-up): Études, Fondations, Gros œuvre, Couverture, Second œuvre.
  const PHASE_WEIGHTS = [0.05, 0.17, 0.40, 0.13, 0.25];
  const PHASE_SPANS = [0.08, 0.16, 0.36, 0.14, 0.26];
  interface SiteSpec {
    code: string; name: string; type: string; client: string; location: string; lat: number; lng: number;
    start: number; end: number; status: 'active' | 'pending' | 'suspended' | 'done'; budget: number; progress: number[];
    lead: Person; engineer: Person; photos: string[][]; lastReport?: number; reportEvery: [number, number];
  }
  const SITES: SiteSpec[] = [
    { code: 'KC-01', name: 'Villa R+1 Amegah', type: 'Rés', client: clients.amegah, location: 'Quartier Nord', lat: 6.2279, lng: 1.2114,
      start: -200, end: 60, status: 'active', budget: 68 * M, progress: [100, 100, 92, 35, 0], lead: 'komi', engineer: 'jean', reportEvery: [2, 4],
      photos: [['m01-site-meeting'], ['f01-excavation', 'f02-rebar-footings', 'f03-footing-pour', 'f04-ground-beam'], ['e01-block-walls', 'e02-column-formwork', 'e03-slab-formwork', 'e04-slab-pour', 'e05-villa-frame'], ['t03-timber-roof', 't02-roof-sheets', 'e05-villa-frame'], ['s02-plastering']] },
    { code: 'KC-02', name: 'Immeuble R+4 Les Cocotiers', type: 'Rés', client: clients.cocotiers, location: 'Quartier du Lac', lat: 6.1462, lng: 1.2402,
      start: -260, end: 200, status: 'active', budget: 420 * M, progress: [100, 100, 52, 0, 0], lead: 'yao', engineer: 'jean', reportEvery: [1, 3],
      photos: [['m01-site-meeting'], ['f01-excavation', 'f02-rebar-footings', 'f03-footing-pour'], ['i01-building-r4-frame', 'i02-r4-rebar-columns', 'e03-slab-formwork', 'e04-slab-pour', 'e02-column-formwork'], [], []] },
    { code: 'KC-03', name: 'École primaire 6 classes', type: 'Ins', client: clients.commune, location: 'Quartier Ouest', lat: 6.1709, lng: 1.1897,
      start: -240, end: 20, status: 'active', budget: 96 * M, progress: [100, 100, 100, 100, 70], lead: 'komi', engineer: 'jean', reportEvery: [2, 5],
      photos: [[], ['f03-footing-pour', 'f04-ground-beam'], ['e01-block-walls', 'e02-column-formwork'], ['t03-timber-roof'], ['s01-school-facade', 's02-plastering', 's03-tiling', 's04-painting', 's05-aluminium-windows']] },
    { code: 'KC-04', name: 'Entrepôt logistique zone portuaire', type: 'Com', client: clients.golfe, location: 'Zone portuaire', lat: 6.1319, lng: 1.2885,
      start: -150, end: 90, status: 'active', budget: 185 * M, progress: [100, 100, 80, 15, 0], lead: 'edem', engineer: 'jean', reportEvery: [2, 4],
      photos: [[], ['f02-rebar-footings', 'f04-ground-beam'], ['t01-steel-frame', 'e04-slab-pour'], ['t02-roof-sheets'], []] },
    { code: 'KC-05', name: 'Clinique Sainte-Grâce', type: 'Ins', client: clients.grace, location: 'Quartier Est', lat: 6.1867, lng: 1.2353,
      start: -45, end: 300, status: 'active', budget: 260 * M, progress: [100, 20, 0, 0, 0], lead: 'yao', engineer: 'mawuli', reportEvery: [2, 3],
      photos: [['c02-site-board', 'm01-site-meeting'], ['c01-clinic-earthworks', 'f01-excavation', 'i04-rain-water', 'f02-rebar-footings'], [], [], []] },
    { code: 'KC-06', name: 'Réhabilitation bureaux ONG Eau Vive', type: 'Rén', client: clients.ong, location: 'Centre-ville', lat: 6.1556, lng: 1.2236,
      start: -300, end: -40, status: 'done', budget: 38 * M, progress: [100, 100, 100, 100, 100], lead: 'edem', engineer: 'mawuli', reportEvery: [3, 6], lastReport: -42,
      photos: [['b02-office-before'], ['b02-office-before'], ['s02-plastering'], ['s05-aluminium-windows'], ['s03-tiling', 's04-painting', 'b01-office-renovated']] },
    { code: 'KC-07', name: 'Villa duplex Bord de mer', type: 'Rés', client: clients.kossi, location: 'Bord de mer', lat: 6.1594, lng: 1.3375,
      start: -220, end: 40, status: 'suspended', budget: 82 * M, progress: [100, 100, 45, 0, 0], lead: 'komi', engineer: 'mawuli', reportEvery: [3, 5], lastReport: -55,
      photos: [[], ['f03-footing-pour', 'f01-excavation'], ['e01-block-walls', 'v01-duplex-stopped'], [], []] },
    { code: 'KC-08', name: 'Forage et château d’eau Les Collines', type: 'Ins', client: clients.ong, location: 'Les Collines', lat: 6.4261, lng: 1.2133,
      start: -180, end: -90, status: 'done', budget: 24 * M, progress: [100, 100, 100, 100, 100], lead: 'edem', engineer: 'mawuli', reportEvery: [3, 5], lastReport: -91,
      photos: [[], ['w01-drilling-rig'], ['w01-drilling-rig', 'w02-water-tower'], ['w02-water-tower'], ['w02-water-tower']] },
    { code: 'KC-09', name: 'Résidence 4 villas Les Jardins', type: 'Rés', client: clients.immo, location: 'Les Jardins', lat: 6.1823, lng: 1.2064,
      start: 30, end: 420, status: 'pending', budget: 310 * M, progress: [40, 0, 0, 0, 0], lead: 'yao', engineer: 'jean', reportEvery: [5, 8], lastReport: -3,
      photos: [['v02-four-villas-plot'], [], [], [], []] },
  ];

  const ids: Record<string, string> = {};
  const phaseIds: Record<string, string[]> = {};
  const phaseWindows: Record<string, [number, number][]> = {};
  for (const site of SITES) {
    const { id } = await core.createProject(app, boss, {
      code: site.code, name: site.name, typeId: typeId(site.type), clientId: site.client, managerId: userIds[site.lead], location: site.location,
      latitude: site.lat, longitude: site.lng, startDate: day(site.start), endDate: day(site.end), status: site.status, budgetMinor: site.budget,
    });
    ids[site.code] = id;
    const detail = await core.getProject(app, boss, id);
    const span = site.end - site.start;
    let cursor = site.start;
    phaseWindows[site.code] = [];
    phaseIds[site.code] = detail.phases.map((phase) => phase.id);
    for (const [index, phase] of detail.phases.entries()) {
      const length = Math.max(5, Math.round(span * (PHASE_SPANS[index] ?? 0.1)));
      const from = index === 0 ? cursor : cursor - Math.round(length * 0.1); // phases overlap a little
      const to = from + length;
      phaseWindows[site.code]!.push([from, to]);
      cursor = to;
      await core.updatePhase(app, boss, phase.id, {
        budgetMinor: round(site.budget * (PHASE_WEIGHTS[index] ?? 0.1), 100_000), startDate: day(from), endDate: day(to),
      });
    }
  }
  log('sites ready');

  // ---------------------------------------------------------------- field reports with photos
  const NOTES: string[][] = [
    ['Relevé topographique fait avec le géomètre, bornes posées.', 'Réunion de lancement avec le client et le bureau de contrôle.', 'Implantation validée, piquets et cordeaux en place.',
      'Étude de sol reçue : bon sol à 1,20 m.', 'Plans d’exécution validés par le bureau d’études.', 'Débroussaillage et clôture provisoire terminés.', 'Installation de chantier : magasin, point d’eau, panneau.'],
    ['Fouilles en rigole terminées sur l’axe {axis}.', 'Ferraillage des semelles posé sur l’axe {axis}, contrôle de l’enrobage fait.', 'Béton de propreté coulé sur {n} semelles.',
      'Coulage des semelles isolées, {m3} m³, éprouvettes prélevées.', 'Longrines coffrées sur l’axe {axis}, coulage prévu demain matin.', 'Remblai compacté par couches de 20 cm, essai à la plaque OK.',
      'Fouilles reprises après la pluie, fond nettoyé.', 'Contrôle du ferraillage par le bureau de contrôle : conforme.', 'Hérisson et dallage du rez-de-chaussée coulés.'],
    ['Élévation des agglos de 15, {pct} % du niveau fait.', 'Poteaux de l’axe {axis} coulés, décoffrage dans 48 h.', 'Coffrage du plancher en cours, étais posés tous les 80 cm.',
      'Pose des hourdis et du ferraillage de la dalle, zone {axis}.', 'Dalle coulée avec la pompe, {m3} m³, cure à l’eau lancée.', 'Chaînages hauts coulés, linteaux posés au-dessus des ouvertures.',
      'Escalier coffré et ferraillé.', 'Décoffrage des poutres de l’axe {axis}, aspect correct.', 'Réservations électricité et plomberie posées avant coulage.', 'Acrotères montés côté rue.'],
    ['Charpente posée sur {n} fermes, contrôle des fixations.', 'Pose des tôles bac acier, {pct} % du toit couvert.', 'Faîtage et rives posés.',
      'Gouttières et descentes d’eau posées côté {side}.', 'Étanchéité de la terrasse : première couche appliquée.', 'Contrôle de l’écoulement des eaux de pluie : OK.'],
    ['Enduit intérieur terminé dans {n} pièces.', 'Carrelage posé dans {n} pièces, joints demain.', 'Peinture première couche dans les salles côté {side}.',
      'Pose des menuiseries aluminium au rez-de-chaussée.', 'Électricité : tirage des câbles terminé, tableau posé.', 'Plomberie : essais de pression OK.',
      'Faux plafond posé dans {n} pièces.', 'Pose des portes intérieures.', 'Nettoyage de fin de lot et liste des réserves établie.'],
  ];
  const fill = (text: string) => text
    .replace('{axis}', pick(['A', 'B', 'C', 'D', '1', '2', '3', '4']))
    .replace('{n}', String(between(2, 8)))
    .replace('{m3}', String(between(4, 32)))
    .replace('{pct}', String(between(3, 9) * 10))
    .replace('{side}', pick(['rue', 'cour', 'nord', 'sud']));
  const WEATHER = ['Forte pluie le matin, reprise à 11 h.', 'Pluie l’après-midi, bâchage des agglos.', 'Chaleur, arrosage du béton deux fois.'];

  interface Made { id: string; site: string; offset: number; phaseIndex: number; progress: number | null; status: 'pending' | 'validated' | 'rejected' }
  const reports: Made[] = [];
  const lastNote: Record<string, string> = {};
  for (const site of SITES) {
    const windows = phaseWindows[site.code]!;
    const last = Math.min(site.lastReport ?? -0, 0);
    const first = Math.max(site.start, -330);
    if (first > last) continue;
    let offset = first;
    while (offset <= last) {
      let phaseIndex = windows.findIndex(([from, to]) => offset >= from && offset <= to);
      if (phaseIndex < 0) phaseIndex = offset > windows[windows.length - 1]![1] ? 4 : 0;
      // Do not report on a phase the site never reached.
      while (phaseIndex > 0 && (site.progress[phaseIndex] ?? 0) === 0) phaseIndex -= 1;
      const [from, to] = windows[phaseIndex]!;
      const target = site.progress[phaseIndex] ?? 0;
      const reachedAt = target >= 100 ? to : last; // a finished phase reaches 100 at its end
      const share = Math.min(1, Math.max(0.05, (offset - from) / Math.max(1, reachedAt - from)));
      const recent = -offset <= 3 && site.status !== 'done';
      // A report still to validate moves the phase forward from where it is validated.
      const progress = recent ? Math.min(100, Math.ceil((target + 1) / 5) * 5) : Math.min(target, Math.max(5, Math.round((target * share) / 5) * 5));
      const pool = site.photos[phaseIndex]?.length ? site.photos[phaseIndex]! : site.photos.flat();
      const weather = rnd() < 0.12;
      let base = pick(NOTES[phaseIndex]!);
      if (base === lastNote[site.code]) base = pick(NOTES[phaseIndex]!.filter((item) => item !== base));
      lastNote[site.code] = base;
      const note = `${fill(base)}${weather ? ` ${pick(WEATHER)}` : ''}`;
      const id = randomUUID();
      const count = pool.length ? between(1, Math.min(3, pool.length)) : 0;
      const chosen = [...pool].sort(() => rnd() - 0.5).slice(0, count);
      const takenAt = at(offset, between(8, 16), between(0, 59));
      await core.submitReport(app, actors[site.lead], {
        id, projectId: ids[site.code], phaseId: phaseIds[site.code]![phaseIndex], progressPct: progress, note, takenAt,
        latitude: site.lat + (rnd() - 0.5) * 0.001, longitude: site.lng + (rnd() - 0.5) * 0.001,
        photos: chosen.map((name) => ({ id: randomUUID(), storageKey: photoKey[name], mediaType: 'image/webp', sizeBytes: photoSize(name), latitude: site.lat, longitude: site.lng, takenAt })),
      });
      const status: Made['status'] = !recent ? (rnd() < 0.03 ? 'rejected' : 'validated') : 'pending';
      reports.push({ id, site: site.code, offset, phaseIndex, progress, status });
      offset += between(...site.reportEvery);
    }
  }
  // Reviews in date order, so validated progress ends where the site really is.
  for (const report of reports.sort((a, b) => a.offset - b.offset)) {
    const site = SITES.find((item) => item.code === report.site)!;
    if (report.status === 'pending') continue;
    await core.reviewReport(app, actors[site.engineer], report.id, report.status === 'validated'
      ? { decision: 'validated' }
      : { decision: 'rejected', note: 'Photos floues et avancement à vérifier : merci de refaire le rapport.' });
  }
  await owner.query(
    `update site_report set created_at = taken_at, reviewed_at = case when reviewed_at is not null then taken_at + interval '20 hours' end where org_id = $1`, [orgId]);
  // Validated progress = where each site really is (phases already passed are complete).
  for (const site of SITES) {
    for (const [index, phaseId] of phaseIds[site.code]!.entries()) await core.updatePhase(app, boss, phaseId, { progressPct: site.progress[index] ?? 0 });
  }
  log(`reports: ${reports.length} (${reports.filter((item) => item.status === 'pending').length} to validate)`);

  // ---------------------------------------------------------------- invoices, payments, reminders
  async function invoice(code: string, kind: 'advance' | 'progress' | 'final', amount: number, issued: number, due: number, label: string, deduction = 0) {
    return (await core.createInvoice(app, actors.akossiwa, { projectId: ids[code], kind, label, amountMinor: Math.round(amount), deductionMinor: Math.round(deduction), issuedOn: day(issued), dueOn: day(due) })).id;
  }
  async function pay(code: string, invoiceId: string, share: number, on: number, method: (typeof core.PAYMENT_METHODS)[number], reference: string) {
    const net = (await core.listInvoices(app, boss, { projectId: ids[code] })).find((row) => row.id === invoiceId)!.netMinor;
    await core.recordPayment(app, actors.akossiwa, { projectId: ids[code], invoiceId, amountMinor: Math.round(net * share), method, receivedOn: day(on), reference });
  }
  const remind = async (invoiceId: string, kind: 'reminder' | 'formal_notice', channel: 'email' | 'whatsapp' | 'phone' | 'letter', offset: number, body?: string) => {
    const { id } = await core.recordReminder(app, actors.akossiwa, invoiceId, { kind, channel, body: body ?? null });
    await owner.query('update reminder set sent_at = $2 where id = $1', [id, at(offset, 10)]);
  };
  // KC-01 villa: pays well, one statement paid in two parts.
  let inv = await invoice('KC-01', 'advance', 13.6 * M, -195, -185, 'Avance de démarrage 20 %');
  await pay('KC-01', inv, 1, -186, 'transfer', 'VIR-ORA-0381');
  inv = await invoice('KC-01', 'progress', 11 * M, -130, -100, 'Situation n°1 · Fondations', 2.2 * M);
  await pay('KC-01', inv, 1, -98, 'mobile_money', 'Mobile 88231947');
  inv = await invoice('KC-01', 'progress', 14 * M, -75, -45, 'Situation n°2 · Gros œuvre RDC', 2.8 * M);
  await pay('KC-01', inv, 0.6, -40, 'mobile_money', 'Mobile 90215533');
  await pay('KC-01', inv, 0.4, -21, 'transfer', 'VIR-ORA-0457');
  await invoice('KC-01', 'progress', 12 * M, -18, 12, 'Situation n°3 · Dalle R+1', 2.4 * M);
  // KC-02 building: big amounts, the third statement is late and the second half paid.
  inv = await invoice('KC-02', 'advance', 84 * M, -255, -245, 'Avance 20 %');
  await pay('KC-02', inv, 1, -246, 'transfer', 'VIR-BTD-11204');
  inv = await invoice('KC-02', 'progress', 60 * M, -180, -150, 'Situation n°1 · Fondations spéciales', 12 * M);
  await pay('KC-02', inv, 1, -151, 'transfer', 'VIR-BTD-11877');
  const k2s2 = await invoice('KC-02', 'progress', 75 * M, -110, -80, 'Situation n°2 · Planchers R+1 et R+2', 15 * M);
  await pay('KC-02', k2s2, 0.5, -70, 'transfer', 'VIR-BTD-12530');
  const k2s3 = await invoice('KC-02', 'progress', 68 * M, -50, -20, 'Situation n°3 · Plancher R+3', 13.6 * M);
  await remind(k2s2, 'reminder', 'email', -55, 'Solde de la situation n°2 : merci de régulariser.');
  await remind(k2s3, 'reminder', 'whatsapp', -12);
  await remind(k2s3, 'reminder', 'phone', -4, 'Le gérant promet un virement avant la fin du mois.');
  // KC-03 school (public client): pays late.
  inv = await invoice('KC-03', 'advance', 19.2 * M, -238, -208, 'Avance de démarrage');
  await pay('KC-03', inv, 1, -226, 'cheque', 'CHQ Trésor 004512');
  inv = await invoice('KC-03', 'progress', 22 * M, -160, -130, 'Situation n°1 · Fondations et élévation', 4.4 * M);
  await pay('KC-03', inv, 1, -96, 'cheque', 'CHQ Trésor 004788');
  const k3s2 = await invoice('KC-03', 'progress', 25 * M, -90, -60, 'Situation n°2 · Charpente et couverture', 5 * M);
  await remind(k3s2, 'reminder', 'email', -50);
  await remind(k3s2, 'reminder', 'letter', -30, 'Courrier déposé au service technique de la mairie.');
  await remind(k3s2, 'formal_notice', 'letter', -8, 'Mise en demeure de payer sous 15 jours.');
  await invoice('KC-03', 'progress', 15 * M, -12, 18, 'Situation n°3 · Second œuvre', 3 * M);
  // KC-04 warehouse: pays on time.
  inv = await invoice('KC-04', 'advance', 46 * M, -148, -138, 'Avance 25 %');
  await pay('KC-04', inv, 1, -139, 'transfer', 'VIR-ECO-55210');
  inv = await invoice('KC-04', 'progress', 50 * M, -90, -60, 'Situation n°1 · Dallage et massifs', 12.5 * M);
  await pay('KC-04', inv, 1, -62, 'transfer', 'VIR-ECO-55902');
  inv = await invoice('KC-04', 'progress', 38 * M, -30, 0, 'Situation n°2 · Charpente métallique', 9.5 * M);
  await pay('KC-04', inv, 1, -3, 'transfer', 'VIR-ECO-56340');
  // KC-05 clinic: just started.
  inv = await invoice('KC-05', 'advance', 52 * M, -40, -30, 'Avance de démarrage 20 %');
  await pay('KC-05', inv, 1, -33, 'transfer', 'VIR-UTB-7781');
  // KC-06 offices: done and paid.
  inv = await invoice('KC-06', 'advance', 7.6 * M, -298, -288, 'Avance');
  await pay('KC-06', inv, 1, -290, 'transfer', 'VIR-ECO-40112');
  inv = await invoice('KC-06', 'progress', 15 * M, -180, -150, 'Situation n°1', 3 * M);
  await pay('KC-06', inv, 1, -149, 'transfer', 'VIR-ECO-41020');
  inv = await invoice('KC-06', 'final', 15.4 * M, -45, -15, 'Décompte final', 4.6 * M);
  await pay('KC-06', inv, 1, -18, 'transfer', 'VIR-ECO-43391');
  // KC-07 duplex: two statements unpaid, site suspended.
  inv = await invoice('KC-07', 'advance', 16.4 * M, -218, -208, 'Avance');
  await pay('KC-07', inv, 1, -209, 'mobile_money', 'Mobile 55102');
  inv = await invoice('KC-07', 'progress', 14 * M, -150, -120, 'Situation n°1 · Fondations', 2.8 * M);
  await pay('KC-07', inv, 1, -118, 'mobile_money', 'Mobile 57730');
  const k7s2 = await invoice('KC-07', 'progress', 18 * M, -100, -70, 'Situation n°2 · Élévation RDC', 3.6 * M);
  const k7s3 = await invoice('KC-07', 'progress', 9 * M, -65, -35, 'Situation n°3 · Chaînages', 1.8 * M);
  await remind(k7s2, 'reminder', 'whatsapp', -62);
  await remind(k7s2, 'reminder', 'phone', -48);
  await remind(k7s2, 'formal_notice', 'letter', -40, 'Mise en demeure : à défaut de paiement sous 8 jours, le chantier sera suspendu.');
  await remind(k7s3, 'reminder', 'email', -25);
  // KC-08 borehole: done and paid.
  inv = await invoice('KC-08', 'advance', 7.2 * M, -178, -168, 'Avance 30 %');
  await pay('KC-08', inv, 1, -170, 'transfer', 'VIR-ECO-38800');
  inv = await invoice('KC-08', 'final', 16.8 * M, -95, -65, 'Décompte final', 0);
  await pay('KC-08', inv, 1, -71, 'transfer', 'VIR-ECO-39512');
  await owner.query('update payment set created_at = received_on::timestamptz + interval \'10 hours\' where org_id = $1', [orgId]);
  log('finance ready');

  // ---------------------------------------------------------------- expenses
  const SUPPLIERS = {
    materials: [['Ciment CPJ 45', 'Cimenterie du Golfe', 'sacs', 5_500], ['Fer à béton HA 8/10/12', 'Quincaillerie Centrale', 'tonnes', 620_000], ['Agglos de 15', 'Briqueterie Agoè', 'unités', 350],
      ['Sable lagunaire', 'Carrière Aképé', 'voyages', 95_000], ['Gravier 5/15', 'Carrière Aképé', 'voyages', 165_000], ['Bois de coffrage', 'Scierie du Port', 'lots', 240_000]],
    labour: [['Équipe maçons', 'Tâcherons', 'semaines', 420_000], ['Ferrailleurs', 'Tâcherons', 'semaines', 260_000], ['Manœuvres', 'Tâcherons', 'semaines', 180_000]],
    equipment: [['Location bétonnière', 'Loc-Matériel Pro', 'jours', 25_000], ['Pompe à béton', 'Béton Express', 'coulages', 350_000], ['Location étais', 'Loc-Matériel Pro', 'semaines', 85_000]],
    transport: [['Transport matériaux', 'Transport Plateaux', 'rotations', 45_000]],
    subcontracting: [['Électricité', 'Elec Pro Services', 'lot', 0], ['Plomberie', 'Hydro Services', 'lot', 0], ['Étanchéité', 'Etanch Plus', 'lot', 0], ['Charpente métallique', 'Métal Afrique', 'lot', 0]],
    fees: [['Bureau de contrôle', 'Veritas Afrique de l’Ouest', 'visite', 150_000], ['Laboratoire béton', 'LNBTP', 'essais', 60_000]],
  } as const;
  const SPENT_RATIO: Record<string, number> = { 'KC-01': 0.72, 'KC-02': 1.06, 'KC-03': 0.7, 'KC-04': 0.74, 'KC-05': 0.62, 'KC-06': 0.71, 'KC-07': 0.95, 'KC-08': 0.69 };
  let expenseCount = 0;
  for (const site of SITES) {
    const ratio = SPENT_RATIO[site.code];
    if (!ratio) continue;
    const earned = site.progress.reduce((sum, pct, index) => sum + site.budget * (PHASE_WEIGHTS[index] ?? 0) * pct / 100, 0);
    let left = earned * ratio;
    const last = Math.min(site.lastReport ?? 0, 0);
    const span = Math.max(10, last - site.start);
    while (left > 300_000) {
      const category = pick(['materials', 'materials', 'materials', 'labour', 'labour', 'equipment', 'transport', 'subcontracting', 'fees'] as const);
      const [label, supplier, unit, price] = pick<readonly [string, string, string, number]>(SUPPLIERS[category] as readonly (readonly [string, string, string, number])[]);
      let amount: number; let detail: string;
      if (price) {
        const quantity = Math.max(1, Math.round((left * (0.05 + rnd() * 0.1)) / price));
        amount = Math.min(left, quantity * price); detail = `${label} · ${quantity} ${unit}`;
      } else {
        amount = Math.min(left, round(left * (0.1 + rnd() * 0.15), 50_000)); detail = `${label} · acompte`;
      }
      if (amount < 50_000) break;
      await core.addExpense(app, boss, { projectId: ids[site.code], category, label: detail, supplier, amountMinor: Math.round(amount), spentOn: day(site.start + between(2, span)) });
      left -= amount; expenseCount += 1;
    }
  }
  await owner.query('update expense set created_at = spent_on::timestamptz + interval \'11 hours\' where org_id = $1', [orgId]);
  log(`expenses: ${expenseCount}`);

  // ---------------------------------------------------------------- milestones and dependencies
  type MsSpec = [name: string, category: string, planned: number, actual: number | null, client?: boolean, action?: string];
  const MILESTONES: Record<string, MsSpec[]> = {
    'KC-01': [['Signature du contrat', 'admin', -205, -205], ['Permis de construire obtenu', 'admin', -190, -186], ['Fondations réceptionnées', 'technical', -120, -116, true],
      ['Dalle du R+1 coulée', 'technical', -25, -22, true], ['Toiture posée (hors d’eau)', 'technical', 12, null], ['Menuiseries posées', 'finishing', 35, null], ['Réception des travaux', 'delivery', 60, null, true]],
    'KC-02': [['Ordre de service de démarrage', 'admin', -255, -255], ['Fondations spéciales terminées', 'technical', -170, -160], ['Plancher R+1 coulé', 'technical', -110, -100],
      ['Plancher R+2 coulé', 'technical', -60, -48], ['Plancher R+3 coulé', 'technical', -12, null, false, 'Relancer le fournisseur de fer HA 12'], ['Plancher R+4 coulé', 'technical', 30, null],
      ['Bâtiment hors d’eau', 'technical', 90, null], ['Réception des travaux', 'delivery', 200, null, true]],
    'KC-03': [['Ordre de service de démarrage', 'admin', -238, -238], ['Fondations réceptionnées', 'technical', -170, -168, true], ['Élévation terminée', 'technical', -110, -105],
      ['Charpente et toiture posées', 'technical', -50, -44], ['Peinture et carrelage terminés', 'finishing', 5, null], ['Réception provisoire', 'delivery', 20, null, true]],
    'KC-04': [['Démarrage chantier', 'admin', -148, -148], ['Dallage industriel coulé', 'technical', -90, -92], ['Charpente métallique levée', 'technical', -20, -18],
      ['Couverture posée', 'technical', 25, null], ['Réception', 'delivery', 90, null, true]],
    'KC-05': [['Permis de construire obtenu', 'admin', -50, -47], ['Terrassement terminé', 'technical', -10, null, false, 'Pompage des fouilles après les pluies'],
      ['Fondations réceptionnées', 'technical', 45, null, true], ['Gros œuvre terminé', 'technical', 170, null], ['Réception', 'delivery', 300, null, true]],
    'KC-06': [['Démarrage', 'admin', -298, -298], ['Démolition et curage', 'technical', -260, -255], ['Réception des travaux', 'delivery', -45, -42, true]],
    'KC-07': [['Signature du contrat', 'admin', -215, -215], ['Fondations réceptionnées', 'technical', -150, -148, true],
      ['Plancher R+1 coulé', 'technical', -50, null, false, 'Chantier suspendu : deux situations impayées'], ['Réception des travaux', 'delivery', 40, null, true]],
    'KC-08': [['Forage réalisé', 'technical', -150, -152], ['Château d’eau monté', 'technical', -100, -95], ['Réception', 'delivery', -92, -90, true]],
    'KC-09': [['Signature du contrat', 'admin', 10, null], ['Démarrage chantier', 'admin', 30, null], ['Fondations villa 1', 'technical', 90, null]],
  };
  const msIds: Record<string, string[]> = {};
  for (const [code, list] of Object.entries(MILESTONES)) {
    msIds[code] = [];
    for (const [name, category, planned, actual, clientValidation, action] of list) {
      const { id } = await core.addMilestone(app, boss, {
        projectId: ids[code], name, category, plannedOn: day(planned), actualOn: actual === null ? null : day(actual), clientValidation: clientValidation ?? false,
        action: action ?? null, priority: actual === null && planned < 0 ? 'high' : 'normal',
      });
      msIds[code]!.push(id);
    }
  }
  // Each milestone waits for the previous one of its site (lag: the usual gap), plus links across sites.
  const LAGS: Record<string, number[]> = { 'KC-01': [0, 30, 45, 21, 14, 14], 'KC-02': [0, 30, 30, 30, 30, 30, 60], 'KC-03': [0, 30, 30, 30, 7], 'KC-04': [0, 30, 21, 30], 'KC-05': [0, 21, 60, 60], 'KC-06': [0, 30], 'KC-07': [0, 45, 30], 'KC-08': [0, 0], 'KC-09': [0, 30] };
  for (const [code, list] of Object.entries(msIds)) {
    for (let index = 1; index < list.length; index += 1) {
      await core.setMilestoneDependencies(app, actors.jean, list[index]!, { dependsOn: [{ id: list[index - 1]!, lagDays: LAGS[code]?.[index - 1] ?? 0 }] });
    }
  }
  // The team of the school starts the residence once the school is handed over; the warehouse roof
  // waits for the steel delivered to the building first.
  await core.setMilestoneDependencies(app, actors.jean, msIds['KC-09']![1]!, { dependsOn: [{ id: msIds['KC-09']![0]!, lagDays: 20 }, { id: msIds['KC-03']![5]!, lagDays: 10 }] });
  await core.setMilestoneDependencies(app, actors.jean, msIds['KC-04']![3]!, { dependsOn: [{ id: msIds['KC-04']![2]!, lagDays: 30 }, { id: msIds['KC-02']![4]!, lagDays: 7 }] });
  log('milestones ready');

  // ---------------------------------------------------------------- documents
  const docs = await core.listDocuments(app, boss);
  const setDoc = async (code: string, name: string, status: 'valid' | 'pending' | 'to_fix' | 'missing', expires?: number, reference?: string, issued = -100) => {
    const doc = docs.find((row) => row.projectId === ids[code] && row.title.toLowerCase().includes(name.toLowerCase()));
    if (doc) await core.updateDocument(app, boss, doc.id, { status, expiresOn: expires === undefined ? null : day(expires), reference: reference ?? null, issuedOn: day(issued) });
  };
  for (const site of SITES) {
    if (site.status === 'pending') { await setDoc(site.code, 'contrat', 'pending'); continue; }
    await setDoc(site.code, 'contrat', 'valid', undefined, `CTR-${site.code}`, site.start - 5);
    await setDoc(site.code, 'ordre', 'valid', undefined, `OS-${site.code}`, site.start);
  }
  await setDoc('KC-01', 'permis', 'valid', undefined, 'PC-AGO-2026-0412'); await setDoc('KC-01', 'assurance', 'valid', 210, 'RC-88120');
  await setDoc('KC-02', 'permis', 'valid', undefined, 'PC-LOM-2025-1180'); await setDoc('KC-02', 'assurance', 'to_fix', 12, 'RC-77401');
  await setDoc('KC-03', 'permis', 'valid', undefined, 'PC-G5-118'); await setDoc('KC-03', 'assurance', 'valid', 25, 'RC-90233');
  await setDoc('KC-04', 'permis', 'pending'); await setDoc('KC-04', 'assurance', 'valid', 140, 'RC-91002');
  await setDoc('KC-05', 'permis', 'valid', undefined, 'PC-KEG-2026-077'); await setDoc('KC-05', 'assurance', 'valid', 6, 'RC-93310');
  await setDoc('KC-06', 'permis', 'valid'); await setDoc('KC-06', 'assurance', 'valid', -20, 'RC-55018');
  await setDoc('KC-07', 'permis', 'valid', undefined, 'PC-BAG-2025-310'); await setDoc('KC-07', 'assurance', 'valid', -5, 'RC-60291');
  await setDoc('KC-08', 'permis', 'valid'); await setDoc('KC-08', 'assurance', 'valid', 90);

  // ---------------------------------------------------------------- incidents
  type IncidentSpec = { code: string; kind: (typeof core.INCIDENT_KINDS)[number]; priority: (typeof core.PRIORITIES)[number]; text: string; offset: number; by: Person;
    status?: 'open' | 'in_progress' | 'resolved'; decision?: string; action?: string; assignee?: Person; due?: number; impact?: number; resolution?: string; photo?: string };
  const INCIDENTS: IncidentSpec[] = [
    { code: 'KC-02', kind: 'defect', priority: 'critical', text: 'Fissure diagonale sur un mur d’agglos du R+2, côté cage d’escalier.', offset: -2, by: 'yao', status: 'in_progress',
      decision: 'Expertise', action: 'Pose de témoins en plâtre, visite du bureau de contrôle jeudi.', assignee: 'jean', due: 3, impact: 4, photo: 'i03-crack-incident' },
    { code: 'KC-02', kind: 'material_delay', priority: 'important', text: 'Fer HA 12 en rupture chez le fournisseur : 4 tonnes manquantes pour le plancher R+3.', offset: -9, by: 'yao', status: 'in_progress',
      decision: 'Changer de fournisseur', action: 'Commande passée chez Métal Afrique, livraison annoncée sous 5 jours.', assignee: 'afi', due: 2, impact: 10 },
    { code: 'KC-05', kind: 'weather', priority: 'important', text: 'Fouilles inondées après les pluies de la nuit, 40 cm d’eau.', offset: -4, by: 'yao', status: 'in_progress',
      decision: 'Pompage', action: 'Motopompe louée, reprise des fouilles après assèchement.', assignee: 'yao', due: 1, impact: 6, photo: 'i04-rain-water' },
    { code: 'KC-05', kind: 'other', priority: 'info', text: 'Le voisin demande que la clôture provisoire soit reculée de 50 cm.', offset: -1, by: 'yao' },
    { code: 'KC-01', kind: 'equipment', priority: 'important', text: 'Bétonnière en panne (moteur), coulage des poteaux de l’étage reporté.', offset: -1, by: 'komi' },
    { code: 'KC-03', kind: 'defect', priority: 'info', text: 'Quelques carreaux fissurés dans la salle 4 à remplacer.', offset: -3, by: 'komi', status: 'open', assignee: 'komi', due: 5 },
    { code: 'KC-04', kind: 'accident', priority: 'critical', text: 'Ouvrier blessé à la main (coupure) lors de la pose des tôles. Soigné au dispensaire, arrêt 3 jours.', offset: -15, by: 'edem', status: 'resolved',
      decision: 'Rappel sécurité', action: 'Gants obligatoires, causerie sécurité tous les lundis.', assignee: 'edem', resolution: 'Ouvrier de retour, causerie faite le lundi suivant.' },
    { code: 'KC-04', kind: 'material_delay', priority: 'important', text: 'Retard de livraison des tôles bac acier (bateau en attente au port).', offset: -28, by: 'edem', status: 'resolved',
      decision: 'Attendre', action: 'Suivi quotidien avec le transitaire.', assignee: 'afi', impact: 8, resolution: 'Tôles livrées, pose reprise.' },
    { code: 'KC-01', kind: 'weather', priority: 'info', text: 'Pluie toute la matinée, arrêt du chantier jusqu’à 13 h.', offset: -17, by: 'komi', status: 'resolved', resolution: 'Reprise l’après-midi.' },
    { code: 'KC-07', kind: 'other', priority: 'critical', text: 'Chantier arrêté sur décision de la direction : situations n°2 et n°3 impayées.', offset: -40, by: 'komi', status: 'open',
      decision: 'Suspension', action: 'Gardiennage maintenu, matériel rapatrié au dépôt.', assignee: 'afi' },
    { code: 'KC-03', kind: 'material_delay', priority: 'important', text: 'Menuiseries alu livrées avec 2 châssis aux mauvaises dimensions.', offset: -20, by: 'komi', status: 'resolved',
      decision: 'Retour fournisseur', action: 'Châssis repris, refabrication 10 jours.', assignee: 'jean', impact: 3, resolution: 'Châssis conformes posés.' },
    { code: 'KC-02', kind: 'equipment', priority: 'info', text: 'Grue à tour : contrôle périodique à prévoir avant fin du mois.', offset: -6, by: 'yao', status: 'open', assignee: 'jean', due: 12 },
  ];
  for (const spec of INCIDENTS) {
    const id = randomUUID();
    await core.reportIncident(app, actors[spec.by], { id, projectId: ids[spec.code], kind: spec.kind, priority: spec.priority, description: spec.text });
    await owner.query('update incident set created_at = $2 where id = $1', [id, at(spec.offset, between(8, 16))]);
    if (spec.status || spec.assignee) {
      await core.updateIncident(app, actors.jean, id, {
        status: spec.status === 'resolved' ? 'in_progress' : spec.status, decision: spec.decision ?? null, action: spec.action ?? null,
        assigneeId: spec.assignee ? userIds[spec.assignee] : null, dueOn: spec.due === undefined ? null : day(spec.due), impactDays: spec.impact ?? null,
      });
      if (spec.status === 'resolved') await core.updateIncident(app, actors.jean, id, { status: 'resolved', resolutionNote: spec.resolution ?? null });
    }
  }
  log(`incidents: ${INCIDENTS.length}`);

  // ---------------------------------------------------------------- deliveries and signatures
  const DELIVERIES: [string, string, string, number, string, string, number, 'conform' | 'reserve', string | null][] = [
    ['KC-01', 'Cimenterie du Golfe', 'Ciment CPJ 45', 200, 'sacs', 'd01-cement-delivery', -24, 'conform', null],
    ['KC-01', 'Quincaillerie Centrale', 'Fer HA 10 et HA 12', 2.5, 'tonnes', 'd02-rebar-delivery', -32, 'conform', null],
    ['KC-01', 'Carrière Aképé', 'Sable lagunaire', 3, 'voyages', 'd03-sand-gravel', -9, 'conform', null],
    ['KC-02', 'Cimenterie du Golfe', 'Ciment CPJ 45', 600, 'sacs', 'd01-cement-delivery', -5, 'reserve', '12 sacs déchirés, refusés.'],
    ['KC-02', 'Métal Afrique', 'Fer HA 12', 4, 'tonnes', 'd02-rebar-delivery', -1, 'conform', null],
    ['KC-02', 'Carrière Aképé', 'Gravier 5/15', 6, 'voyages', 'd03-sand-gravel', -14, 'conform', null],
    ['KC-02', 'Cimenterie du Golfe', 'Ciment CPJ 45', 500, 'sacs', 'd01-cement-delivery', -37, 'conform', null],
    ['KC-03', 'Céramique Plus', 'Carrelage 40×40 grès', 380, 'm²', 'd03-sand-gravel', -18, 'conform', null],
    ['KC-03', 'Alu Concept', 'Châssis aluminium', 24, 'unités', 'd02-rebar-delivery', -21, 'reserve', '2 châssis aux mauvaises dimensions.'],
    ['KC-04', 'Métal Afrique', 'Tôles bac acier 0,45', 1800, 'm²', 'd02-rebar-delivery', -26, 'conform', null],
    ['KC-04', 'Cimenterie du Golfe', 'Ciment CPJ 45', 300, 'sacs', 'd01-cement-delivery', -60, 'conform', null],
    ['KC-05', 'Carrière Aképé', 'Sable et gravier', 4, 'voyages', 'd03-sand-gravel', -6, 'conform', null],
    ['KC-05', 'Quincaillerie Centrale', 'Fer HA 8/10/12', 3, 'tonnes', 'd02-rebar-delivery', -3, 'conform', null],
  ];
  for (const [code, supplier, item, quantity, unit, photo, offset, verdict, note] of DELIVERIES) {
    const id = randomUUID();
    const reference = `BL-${between(10000, 99999)}`;
    const key = `org/${orgId}/deliveries/${id}`;
    await storage.put(key, new Uint8Array(readFileSync(path.join(photoDir, `${photo}.webp`))), 'image/webp');
    const site = SITES.find((candidate) => candidate.code === code)!;
    await core.recordDelivery(app, actors[site.lead], {
      id, projectId: ids[code], supplier, item, quantity, unit, deliveredOn: day(offset), reference, verdict, note,
      extracted: { supplier, item, quantity, unit, date: day(offset), reference },
    }, key);
    await owner.query('update delivery set created_at = $2 where id = $1', [id, at(offset, 10)]);
    const signatureId = randomUUID();
    await core.recordSignature(app, actors[site.lead], {
      id: signatureId, projectId: ids[code], subjectKind: 'delivery', subjectId: id, title: `Réception livraison · ${item}`,
      signerName: pick(['Kofi Adjo', 'Séna Amouzou', 'Elom Dossou']), signerRole: 'Chauffeur fournisseur', verdict, reserveNote: note,
    }, pick(signatureKeys), 'field');
    await owner.query('update signature set signed_at = $2 where id = $1', [signatureId, at(offset, 10, 30)]);
  }
  const PVS: [string, string, string, string, number, 'milestone' | 'pv'][] = [
    ['KC-06', 'PV de réception des travaux', 'Mme Akua Lawson', 'Directrice, ONG Eau Vive', -42, 'milestone'],
    ['KC-08', 'PV de réception du forage', 'M. Komlan Ayivi', 'Chef de projet, ONG Eau Vive', -90, 'milestone'],
    ['KC-01', 'PV de réception des fondations', 'M. Kodjo Amegah', 'Maître d’ouvrage', -116, 'milestone'],
    ['KC-03', 'PV de réception des fondations', 'M. Yawo Gbadoe', 'Service technique, mairie', -168, 'milestone'],
    ['KC-02', 'PV de visite du bureau de contrôle', 'Ing. Afiwa Sossou', 'Bureau de contrôle', -48, 'pv'],
    ['KC-04', 'PV de réception du dallage', 'M. Pierre Agbodjan', 'Responsable travaux, Logistique du Golfe', -92, 'pv'],
  ];
  for (const [code, title, signer, role, offset, kind] of PVS) {
    const id = randomUUID();
    const site = SITES.find((candidate) => candidate.code === code)!;
    await core.recordSignature(app, actors[site.engineer], { id, projectId: ids[code], subjectKind: kind, title, signerName: signer, signerRole: role, verdict: 'conform' }, pick(signatureKeys), 'office');
    await owner.query('update signature set signed_at = $2 where id = $1', [id, at(offset, 15)]);
  }
  log(`deliveries: ${DELIVERIES.length}, signed reports: ${PVS.length}`);

  // ---------------------------------------------------------------- checklists
  const templates = await core.listChecklistTemplates(app, boss);
  let checklists = 0;
  for (const site of SITES.filter((candidate) => candidate.status === 'active')) {
    for (let offset = -60; offset <= 0; offset += between(3, 9)) {
      if (offset < site.start) continue;
      const template = pick(templates);
      const id = randomUUID();
      const items = template.items.map((label) => {
        const done = rnd() > 0.12;
        return { label, done, note: done ? null : pick(['À reprendre demain', 'Manque le matériel', 'Signalé au chef de chantier']) };
      });
      await core.submitChecklist(app, actors[site.lead], { id, projectId: ids[site.code], templateId: template.id, name: template.name, items, doneAt: at(offset, 7, 40) });
      checklists += 1;
    }
  }
  await owner.query('update checklist_run set created_at = done_at where org_id = $1', [orgId]).catch(() => undefined);
  log(`checklists: ${checklists}`);

  // ---------------------------------------------------------------- client spaces and messages
  const PORTALS: { code: string; contact: string; email: string; phone: string; opened: number; thread: [who: 'client' | Person, text: string, offset: number][] }[] = [
    { code: 'KC-01', contact: 'Kodjo Amegah', email: 'k.amegah@example.test', phone: '90 11 22 33', opened: -150, thread: [
      ['client', 'Bonjour, j’ai vu les photos de la dalle, c’est du beau travail. Quand est-ce que la toiture commence ?', -20],
      ['jean', 'Bonjour M. Amegah, la charpente arrive la semaine prochaine, pose prévue sur 10 jours.', -20],
      ['client', 'Merci. Je passe samedi matin avec mon épouse pour voir l’étage.', -6],
      ['jean', 'Nous vous attendons samedi à 9 h, Komi sera sur place.', -6],
    ] },
    { code: 'KC-03', contact: 'Service technique, mairie de Bellevue', email: 'services.techniques@bellevue.example.test', phone: '22 25 10 12', opened: -200, thread: [
      ['client', 'Le maire souhaite une visite avant la réception provisoire.', -14],
      ['afi', 'Avec plaisir. Nous proposons mardi 10 h. La situation n°2 reste à régler, merci de nous dire où en est le mandat.', -14],
      ['client', 'Le mandat est à la signature du receveur, paiement attendu sous deux semaines.', -9],
    ] },
    { code: 'KC-05', contact: 'Sœur Marie-Claire', email: 'direction@saintegrace.example.test', phone: '92 40 18 61', opened: -38, thread: [
      ['client', 'Nous avons vu l’eau dans les fouilles, est-ce grave ?', -3],
      ['mawuli', 'Non, c’est fréquent en saison des pluies. Nous pompons et reprenons dès que le sol est sec ; aucun impact sur la qualité.', -3],
    ] },
    { code: 'KC-07', contact: 'Ablavi Kossi', email: 'ablavi.kossi@example.test', phone: '91 45 67 89', opened: -190, thread: [
      ['afi', 'Madame, nous sommes contraints de suspendre le chantier faute de paiement des situations n°2 et n°3.', -40],
      ['client', 'Je comprends, j’attends le déblocage de mon prêt. Je vous tiens informée.', -33],
    ] },
    { code: 'KC-04', contact: 'Pierre Agbodjan', email: 'achats@logistique-golfe.example.test', phone: '22 27 33 90', opened: -140, thread: [
      ['client', 'Pouvez-vous nous envoyer le planning de pose de la couverture ?', -8],
      ['jean', 'Le planning est à jour dans votre espace, onglet Planning. Fin de couverture prévue dans 25 jours.', -8],
    ] },
  ];
  const portalUrls: string[] = [];
  const baseUrl = ctx.baseUrl;
  const portals: { code: string; contact: string; token: string; requireCode: boolean }[] = [];
  for (const portal of PORTALS) {
    const link = await core.createPortalLink(app, boss, ids[portal.code]!, portal.contact);
    if (ctx.seal) await core.sealPortalToken(app, boss, link.id, ctx.seal(link.token));
    portalUrls.push(`${portal.code.padEnd(6)} ${portal.contact.padEnd(40)} ${baseUrl}/portal/${link.token}${['KC-01', 'KC-04'].includes(portal.code) ? '' : '   (code e-mail requis)'}`);
    portals.push({ code: portal.code, contact: portal.contact, token: link.token, requireCode: !['KC-01', 'KC-04'].includes(portal.code) });
    await core.updatePortalLink(app, boss, link.id, {
      // Fictional addresses cannot receive the access code: two spaces open without it for the demo.
      contactName: portal.contact, contactEmail: portal.email, contactPhone: portal.phone, requireCode: !['KC-01', 'KC-04'].includes(portal.code),
      showPhotos: true, showPlanning: true, showFinance: true, showDocuments: true, showMessages: true, invited: true,
    });
    await owner.query('update portal_link set created_at = $2, invited_at = $2, first_opened_at = $3 where id = $1', [link.id, at(portal.opened - 1, 11), at(portal.opened, 19)]);
    await owner.query(`insert into journal (org_id, at, command, target, actor, door) values ($1, $2, 'portal.device_verified', $3, $4, 'portal')`,
      [orgId, at(portal.opened, 19), link.id, `portal:${link.id}`]);
    for (const [who, text, offset] of portal.thread) {
      if (who === 'client') await core.portalPostMessage(app, link.token, text);
      else await core.postTeamMessage(app, actors[who], ids[portal.code]!, text);
      const time = at(offset, who === 'client' ? 20 : 8, between(0, 59));
      await owner.query('update message set created_at = $2 where id = (select id from message where project_id = $1 order by created_at desc limit 1)', [ids[portal.code], time]);
      if (who === 'client') {
        await owner.query(`update journal set at = $2 where id = (select id from journal where org_id = $1 and door = 'portal' and command = 'message.post' order by id desc limit 1)`, [orgId, time]);
      }
    }
    // The client signed in their space the milestones that asked for it and are reached.
    if (portal.code === 'KC-01') {
      const signatureId = randomUUID();
      const key = `org/${orgId}/signatures/${signatureId}`;
      await storage.put(key, new Uint8Array(readFileSync(path.join(ctx.assetsDir, 'signatures/sig2.png'))), 'image/png');
      await core.portalSignMilestone(app, link.token, { milestoneId: msIds['KC-01']![3]!, signer: 'Kodjo Amegah', verdict: 'conform', reserve: null }, signatureId, key).catch(() => false);
      await owner.query(`update journal set at = $2 where org_id = $1 and door = 'portal' and command like 'milestone.%'`, [orgId, at(-21, 18)]);
    }
  }
  log(`client spaces: ${PORTALS.length}`);

  // ---------------------------------------------------------------- tasks and internal threads (spec 046)
  const TASKS: [string, string, Person, number, 'low' | 'normal' | 'urgent', 'todo' | 'doing' | 'done'][] = [
    ['KC-01', 'Commander les gouttières restantes', 'jean', 2, 'normal', 'doing'],
    ['KC-01', 'Préparer le PV de réception partielle', 'jean', 9, 'normal', 'todo'],
    ['KC-02', 'Relancer le bureau de contrôle pour la dalle R+3', 'mawuli', -2, 'urgent', 'todo'],
    ['KC-02', 'Vérifier les réservations électricité avant coulage', 'yao', 1, 'urgent', 'doing'],
    ['KC-03', 'Faire réparer la fuite de la citerne', 'komi', 0, 'urgent', 'doing'],
    ['KC-03', 'Photos des portes posées pour la commune', 'komi', 3, 'normal', 'todo'],
    ['KC-04', 'Confirmer la livraison de la charpente métallique', 'mawuli', 5, 'normal', 'todo'],
    ['KC-05', 'Planifier le passage du plombier', 'edem', 4, 'low', 'todo'],
    ['KC-05', 'Relancer la situation n°2 de la clinique', 'akossiwa', -1, 'urgent', 'todo'],
    ['KC-01', 'Envoyer la situation n°3 au client', 'akossiwa', -6, 'normal', 'done'],
  ];
  for (const [code, title, who, due, priority, status] of TASKS) {
    if (!ids[code]) continue;
    const { id } = await core.createTask(app, actors.jean, { projectId: ids[code], title, assigneeId: userIds[who], dueOn: day(due), priority });
    if (status !== 'todo') await core.updateTask(app, actors.jean, id, { status });
  }
  const THREADS: [string, Person, string, number][] = [
    ['KC-02', 'mawuli', 'Le bureau de contrôle passe jeudi pour la dalle R+3 : on ne coule pas avant son visa.', -3],
    ['KC-02', 'yao', 'Ferraillage prêt, il manque 6 barres de 12 : commandées ce matin.', -2],
    ['KC-03', 'komi', 'Fuite sur la citerne côté classe 4, le plombier vient demain 8 h.', -1],
    ['KC-03', 'afi', 'OK pour le plombier. Prévenez la commune que la visite de vendredi est maintenue.', -1],
    ['KC-01', 'jean', 'Le client veut voir les gouttières avant de signer l’étape couverture.', -4],
  ];
  for (const [code, who, body, offset] of THREADS) {
    if (!ids[code]) continue;
    const { id } = await core.postNote(app, actors[who], { projectId: ids[code], body });
    await owner.query('update project_note set created_at = $2 where id = $1', [id, at(offset, 17, between(0, 59))]);
  }
  log(`tasks: ${TASKS.length}, internal notes: ${THREADS.length}`);

  // ---------------------------------------------------------------- change orders, document families (spec 048)
  await owner.query(`update project_document set family = 'technical' where org_id = $1 and title ~* '(plan|coupe|fa[cç]ade|[ée]tude|calcul|ferraill)'`, [orgId]);
  const CHANGES: [string, string, string, number, number, 'accepted' | 'sent' | 'draft'][] = [
    ['KC-01', 'Mur de clôture supplémentaire', 'Mur en agglos de 20 cm sur 42 m, enduit deux faces, portail non compris.', 2_400_000, 6, 'accepted'],
    ['KC-01', 'Carrelage grand format au salon', 'Remplacement du 40×40 prévu par du 60×120, pose comprise.', 950_000, 2, 'sent'],
    ['KC-02', 'Renfort des poteaux du R+4', 'Demande du bureau de contrôle : section portée à 30×30 sur 8 poteaux.', 3_100_000, 5, 'accepted'],
    ['KC-05', 'Local technique climatisation', 'Dalle et abri pour les groupes extérieurs.', 1_200_000, 4, 'draft'],
  ];
  for (const [site, title, description, amount, days, status] of CHANGES) {
    if (!ids[site]) continue;
    const { id } = await core.createChangeOrder(app, actors.jean, { projectId: ids[site], title, description, amountMinor: amount, daysAdded: days });
    if (status !== 'draft') await core.sendChangeOrder(app, actors.jean, id);
    if (status === 'accepted') await core.decideChangeOrder(app, actors.jean, id, { accept: true, decidedBy: site === 'KC-01' ? 'Kodjo Amegah' : 'SCI Les Cocotiers' });
  }
  log(`change orders: ${CHANGES.length}`);
  // Spec 053: the bank balance the owner gave, and supplier bills to pay.
  await core.setCashBalance(app, boss, { amountMinor: 96_500_000, on: day(-3) });
  if (ids['KC-01']) {
    await core.createSupplierBill(app, boss, { projectId: ids['KC-01'], supplier: 'Cimenterie Exemple', label: 'Ciment, livraison du 14', reference: 'FA-3391', category: 'materials', amountMinor: 2_150_000, issuedOn: day(-20), dueOn: day(-2) });
    await core.createSupplierBill(app, boss, { projectId: ids['KC-01'], supplier: 'Tuiles & Toitures (fictif)', label: 'Tuiles et faîtières', category: 'materials', amountMinor: 4_800_000, issuedOn: day(-5), dueOn: day(12) });
  }
  await core.createSupplierBill(app, boss, { supplier: 'Location engins (fictif)', label: 'Mini-pelle, novembre', category: 'equipment', amountMinor: 1_350_000, issuedOn: day(-8), dueOn: day(20) });
  await core.createSupplierBill(app, boss, { supplier: 'Assurance (fictif)', label: 'Prime décennale, échéance trimestrielle', category: 'fees', amountMinor: 3_200_000, issuedOn: day(-2), dueOn: day(35) });

  // Spec 052: the KC-01 site lead asks for material and writes to the office; the office answers.
  if (ids['KC-01']) {
    const cement = randomUUID();
    await core.createMaterialRequest(app, actors.komi, { id: cement, projectId: ids['KC-01'], item: 'Ciment', quantity: '40 sacs', neededOn: day(2), note: 'Pour le chaînage du pan sud.' });
    const tiles = randomUUID();
    await core.createMaterialRequest(app, actors.komi, { id: tiles, projectId: ids['KC-01'], item: 'Tuiles de rive', quantity: '60', neededOn: day(5), note: null });
    await core.updateMaterialRequest(app, actors.jean, tiles, { status: 'ordered', officeNote: 'Livraison prévue jeudi matin.' });
    await core.postNote(app, actors.komi, { projectId: ids['KC-01'], body: 'La pluie de ce matin a retardé la pose des liteaux, on reprend cet après-midi.' });
    await core.postNote(app, actors.jean, { projectId: ids['KC-01'], body: 'Bien noté. Je passe demain à 9 h pour la toiture.' });
  }

  // Spec 051: the KC-01 client reports a transfer on an open invoice; the accountant confirms it.
  {
    const kc01 = portals.find((portal) => portal.code === 'KC-01');
    const { rows: open } = await owner.query<{ id: string; balance: number }>(
      'select invoice_id as id, balance_minor::float8 as balance from invoice_balance where project_id = $1 and balance_minor > 0 order by due_on limit 1', [ids['KC-01']]);
    if (kc01 && open[0]) {
      await core.portalDeclarePayment(owner, kc01.token, { invoiceId: open[0].id, amountMinor: Math.round(open[0].balance / 2), paidOn: day(-1), method: 'transfer', reference: 'VIR-20481', note: 'Premier versement, le solde suit la semaine prochaine.' });
    }
  }

  // Specs 049–050: last week's client report, written and sent to the KC-01 client; this week's
  // draft waiting for the office's reading.
  if (ids['KC-01']) {
    const sent = await core.createClientReportDraft(app, actors.jean, { projectId: ids['KC-01'], from: day(-7), to: day(-1) });
    await core.updateClientReportDraft(app, actors.jean, sent.id, {
      note: 'Les gouttières sont posées côté nord ; la couverture avance comme prévu.',
      sections: {
        summary: 'Une bonne semaine sur votre chantier : la couverture avance comme prévu et les gouttières côté nord sont posées. Les intempéries n’ont pas ralenti l’équipe.',
        done: ['Pose des tuiles sur le pan nord.', 'Pose des gouttières et des descentes d’eau côté nord.', 'Vérification de l’étanchéité après la pluie de jeudi : rien à signaler.'].join('\n'),
        next: 'La couverture du pan sud, puis la pose des menuiseries extérieures.',
        ask: '',
      },
    });
    await core.sendClientReportDraft(app, actors.jean, sent.id, 'client.demo@struo.test');
    const draft = await core.createClientReportDraft(app, actors.jean, { projectId: ids['KC-01'], from: day(-6), to: day(0) });
    await core.updateClientReportDraft(app, actors.jean, draft.id, {
      sections: {
        summary: 'Cette semaine, la couverture du pan sud a commencé. Le chantier avance au rythme prévu.',
        done: ['Mise en place des liteaux sur le pan sud.', 'Début de la pose des tuiles.'].join('\n'),
        next: 'Fin de la couverture, puis les menuiseries extérieures.',
        ask: '',
      },
    });
  }

  // ---------------------------------------------------------------- crew, presences, subcontractors (spec 047)
  const CREW: [string, string, number, string][] = [
    ['Kossi Amouzou', 'Maçon', 6000, 'KC-01'], ['Yawo Dossou', 'Maçon', 6000, 'KC-01'], ['Komlan Ahiaku', 'Manœuvre', 3500, 'KC-01'],
    ['Edem Kpogli', 'Ferrailleur', 6500, 'KC-02'], ['Mawuena Togbe', 'Ferrailleur', 6500, 'KC-02'], ['Sena Akakpo', 'Maçon', 6000, 'KC-02'],
    ['Folly Adjovi', 'Manœuvre', 3500, 'KC-02'], ['Kodjo Atsu', 'Coffreur', 6500, 'KC-02'], ['Elom Sossou', 'Manœuvre', 3500, 'KC-03'],
    ['Dela Agbodjan', 'Carreleur', 7000, 'KC-03'], ['Afi Lawson', 'Peintre', 5500, 'KC-03'], ['Kafui Mensah', 'Menuisier', 7000, 'KC-03'],
    ['Messan Ekoue', 'Soudeur', 7500, 'KC-04'], ['Agbeko Tete', 'Manœuvre', 3500, 'KC-04'], ['Selom Gbedey', 'Maçon', 6000, 'KC-05'],
    ['Ayité Fiagan', 'Plombier', 7000, 'KC-05'], ['Kokou Djondo', 'Électricien', 7000, 'KC-05'], ['Amavi Kuevi', 'Manœuvre', 3500, 'KC-05'],
  ];
  const workerIds: Record<string, { id: string; site: string }> = {};
  for (const [name, trade, rate, site] of CREW) {
    const { id } = await core.saveWorker(app, boss, null, { name, trade, dayRateMinor: rate, phone: `90 ${between(10, 99)} ${between(10, 99)} ${between(10, 99)}` });
    workerIds[name] = { id, site };
  }
  let presences = 0;
  for (let offset = -20; offset <= 0; offset++) {
    const date = new Date(); date.setDate(date.getDate() + offset);
    if (date.getDay() === 0) continue;
    for (const [name, { id, site }] of Object.entries(workerIds)) {
      if (!ids[site] || rnd() < 0.12) continue;
      // Some ironworkers help on the school when the slab is poured.
      const where = name.startsWith('Mawuena') && offset % 5 === 0 && ids['KC-03'] ? 'KC-03' : site;
      await owner.query(
        `insert into worker_attendance (org_id, project_id, worker_id, day, recorded_by) values ($1, $2, $3, $4, $5) on conflict do nothing`,
        [orgId, ids[where], id, day(offset), userIds.komi]);
      presences++;
    }
  }
  const SUBS: [string, string, string, number, number, number][] = [
    ['KC-02', 'Électricité Lumière SARL', 'Électricien', 4_800_000, 35, 1_200_000],
    ['KC-02', 'Tâcheron Akouété (étanchéité)', 'Étanchéité', 1_500_000, 0, 0],
    ['KC-01', 'Plomberie Agbo', 'Plombier', 2_200_000, 60, 1_100_000],
    ['KC-05', 'Climatisation Golfe Froid', 'Frigoriste', 6_500_000, 20, 1_950_000],
  ];
  for (const [site, name, trade, agreed, progress, paid] of SUBS) {
    if (!ids[site]) continue;
    const { id } = await core.createSubcontract(app, actors.jean, { projectId: ids[site], name, trade, agreedMinor: agreed });
    if (progress) await core.updateSubcontract(app, actors.jean, id, { progressPct: progress });
    if (paid) await core.paySubcontract(app, actors.akossiwa, id, { amountMinor: paid });
  }
  log(`crew: ${CREW.length} workers, ${presences} presences, ${SUBS.length} subcontracts`);

  // ---------------------------------------------------------------- the journal follows the real dates
  await owner.query(
    `update journal j set at = x.at from (
       select id::text as target, created_at as at from site_report where org_id = $1
       union all select id::text, created_at from incident where org_id = $1
       union all select id::text, created_at from delivery where org_id = $1
       union all select id::text, signed_at from signature where org_id = $1
       union all select id::text, issued_on::timestamptz + interval '9 hours' from invoice where org_id = $1
       union all select id::text, created_at from expense where org_id = $1
     ) x where j.org_id = $1 and j.target = x.target and j.door <> 'portal'`, [orgId]);
  await owner.query(`update journal set at = at - interval '1 day' * (random() * 300) where org_id = $1 and at > now() - interval '1 minute' and door <> 'portal'`, [orgId]);

  return {
    orgId,
    users: PEOPLE.map(([key, name, email, role]) => ({ key, name, email: options.email(key, email), role, id: userIds[key] })),
    portals,
  };
}
