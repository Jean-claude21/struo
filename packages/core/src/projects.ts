import { z } from 'zod';
import { asActor, ensure, journal, parse } from './access.ts';
import type { Actor, Db, Tx } from './db.ts';
import { DomainError, notFound } from './errors.ts';
import { toMinor } from './money.ts';
import { assertWithinLimit } from './saas.ts';

export const PROJECT_STATUSES = ['pending', 'active', 'suspended', 'done'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

// ---------------------------------------------------------------- clients

export interface Client {
  id: string;
  name: string;
  kind: 'individual' | 'company' | 'public';
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  projects: number;
}

const clientInput = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(['individual', 'company', 'public']).default('individual'),
  email: z.string().trim().toLowerCase().email().nullable().optional().or(z.literal('').transform(() => null)),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function listClients(db: Db, actor: Actor, q?: string): Promise<Client[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<Client>(
      `select c.id, c.name, c.kind, c.email, c.phone, c.address, c.notes,
              (select count(*)::int from project p where p.client_id = c.id and p.archived_at is null) as projects
         from client c
        where c.org_id = $1 and c.archived_at is null
          and ($2::text is null or unaccent(lower(c.name)) like '%' || unaccent(lower($2)) || '%')
        order by c.name`,
      [actor.orgId, q?.trim() || null],
    );
    return rows;
  });
}

export async function createClient(db: Db, actor: Actor, input: unknown): Promise<Client> {
  ensure(actor, 'clients.write');
  const data = parse(clientInput, input);
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into client (org_id, name, kind, email, phone, address, notes) values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [actor.orgId, data.name, data.kind, data.email ?? null, data.phone ?? null, data.address ?? null, data.notes ?? null],
    );
    const id = rows[0]!.id;
    await journal(tx, actor, 'client.create', id, null, data);
    return { id, projects: 0, email: null, phone: null, address: null, notes: null, ...data } as Client;
  });
}

export async function updateClient(db: Db, actor: Actor, id: string, input: unknown): Promise<void> {
  ensure(actor, 'clients.write');
  const data = parse(clientInput.partial(), input);
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('select * from client where id = $1 and org_id = $2', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    const entries = Object.entries(data).filter(([, value]) => value !== undefined);
    if (entries.length) {
      await tx.query(
        `update client set ${entries.map(([key], index) => `${key} = $${index + 3}`).join(', ')} where id = $1 and org_id = $2`,
        [id, actor.orgId, ...entries.map(([, value]) => value)],
      );
    }
    await journal(tx, actor, 'client.update', id, before, data);
  });
}

// ---------------------------------------------------------------- projects

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  typeId: string | null;
  typeName: string | null;
  clientId: string | null;
  clientName: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  budgetMinor: number;
  currencyCode: string;
  progressPct: number;
  collectedPct: number;
  health: 'healthy' | 'weak' | 'critical';
  managerName: string | null;
}

const PROJECT_SELECT = `
  select p.id, p.code, p.name, p.status, p.type_id as "typeId", t.name as "typeName",
         p.client_id as "clientId", c.name as "clientName", p.location, p.start_date as "startDate",
         p.end_date as "endDate", p.budget_minor as "budgetMinor", p.currency_code as "currencyCode",
         f.progress_pct as "progressPct", f.collected_pct as "collectedPct", f.health,
         u.name as "managerName"
    from project p
    join project_finance f on f.project_id = p.id
    left join project_type t on t.id = p.type_id
    left join client c on c.id = p.client_id
    left join "user" u on u.id = p.manager_id`;

export async function listProjects(
  db: Db,
  actor: Actor,
  filters: { q?: string; status?: string; typeId?: string; clientId?: string } = {},
): Promise<ProjectRow[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<ProjectRow>(
      `${PROJECT_SELECT}
        where p.org_id = $1 and p.archived_at is null
          and ($2::text is null or unaccent(lower(p.name || ' ' || p.code || ' ' || coalesce(p.location, '') || ' '
               || coalesce(c.name, ''))) like '%' || unaccent(lower($2)) || '%')
          and ($3::text is null or p.status = $3)
          and ($4::uuid is null or p.type_id = $4)
          and ($5::uuid is null or p.client_id = $5)
        order by case p.status when 'active' then 0 when 'pending' then 1 when 'suspended' then 2 else 3 end, p.code`,
      [actor.orgId, filters.q?.trim() || null, filters.status || null, filters.typeId || null, filters.clientId || null],
    );
    return rows;
  });
}

export interface PhaseRow {
  id: string;
  name: string;
  position: number;
  budgetMinor: number;
  progressPct: number;
}

export interface ProjectDetail extends ProjectRow {
  description: string | null;
  vatBps: number;
  retentionBps: number;
  managerId: string | null;
  latitude: number | null;
  longitude: number | null;
  phases: PhaseRow[];
  finance: {
    invoicedMinor: number;
    invoicedNetMinor: number;
    collectedMinor: number;
    retentionMinor: number;
    spentMinor: number;
    overdueMinor: number;
    cashMinor: number;
    invoicedPct: number;
  };
  compliancePct: number | null;
}

export async function getProject(db: Db, actor: Actor, id: string): Promise<ProjectDetail> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `${PROJECT_SELECT.replace('select p.id,', `select p.description, p.vat_bps as "vatBps", p.retention_bps as "retentionBps",
              p.manager_id as "managerId", p.latitude, p.longitude,
              f.invoiced_minor as "invoicedMinor", f.invoiced_net_minor as "invoicedNetMinor",
              f.collected_minor as "collectedMinor", f.retention_minor as "retentionMinor",
              f.spent_minor as "spentMinor", f.overdue_minor as "overdueMinor", f.cash_minor as "cashMinor",
              f.invoiced_pct as "invoicedPct", p.id,`)}
        where p.id = $1 and p.org_id = $2`,
      [id, actor.orgId],
    );
    const row = rows[0];
    if (!row) throw notFound();
    const phases = await tx.query<PhaseRow>(
      `select id, name, position, budget_minor as "budgetMinor", progress_pct as "progressPct"
         from project_phase where project_id = $1 order by position, name`,
      [id],
    );
    const compliance = await tx.query<{ pct: number | null }>(
      `select case when count(*) filter (where required) = 0 then null
                   else round(100.0 * count(*) filter (where required and status = 'valid')
                              / count(*) filter (where required))::int end as pct
         from document_status where project_id = $1`,
      [id],
    );
    const {
      invoicedMinor, invoicedNetMinor, collectedMinor, retentionMinor, spentMinor, overdueMinor, cashMinor, invoicedPct,
      ...project
    } = row;
    return {
      ...project,
      phases: phases.rows,
      finance: { invoicedMinor, invoicedNetMinor, collectedMinor, retentionMinor, spentMinor, overdueMinor, cashMinor, invoicedPct },
      compliancePct: compliance.rows[0]?.pct ?? null,
    } as ProjectDetail;
  });
}

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const projectInput = z.object({
  code: z.string().trim().max(30).optional(),
  name: z.string().trim().min(1).max(200),
  typeId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  managerId: z.string().nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  startDate: dateString.nullable().optional(),
  endDate: dateString.nullable().optional(),
  status: z.enum(PROJECT_STATUSES).default('pending'),
  budgetMinor: z.number().int().min(0).default(0),
  description: z.string().trim().max(4000).nullable().optional(),
  phases: z.array(z.object({ name: z.string().trim().min(1).max(80), budgetMinor: z.number().int().min(0).default(0) })).optional(),
});

/** An end before the start is refused in words, not by the database's bare check. */
function ensureDateOrder(start: string | null | undefined, end: string | null | undefined): void {
  if (start && end && end < start) throw new DomainError('end_before_start', 422);
}

/**
 * What would refuse this new project, checked without writing: dates in order, a free code, a client
 * of the company. Lets a door show the refusal on the preview rather than after the « yes ».
 */
async function checkNewProjectTx(tx: Tx, actor: Actor, data: z.infer<typeof projectInput>): Promise<void> {
  ensureDateOrder(data.startDate, data.endDate);
  const code = data.code?.trim();
  if (code) {
    const taken = await tx.query('select 1 from project where org_id = $1 and code = $2', [actor.orgId, code]);
    if (taken.rowCount) throw new DomainError('code_taken', 409, { code });
  }
  if (data.clientId) {
    const client = await tx.query('select 1 from client where id = $1 and org_id = $2', [data.clientId, actor.orgId]);
    if (!client.rowCount) throw notFound();
  }
}

export async function checkNewProject(db: Db, actor: Actor, input: unknown): Promise<void> {
  ensure(actor, 'projects.write');
  const data = parse(projectInput, input);
  await asActor(db, actor, (tx) => checkNewProjectTx(tx, actor, data));
}

async function createProjectTx(tx: Tx, actor: Actor, data: z.infer<typeof projectInput>): Promise<string> {
  await assertWithinLimit(tx, actor.orgId, 'projects');
  ensureDateOrder(data.startDate, data.endDate);
  const settings = (
    await tx.query<{ currency: string; vat: number; retention: number }>(
      'select currency_code as currency, vat_bps as vat, retention_bps as retention from org_settings where org_id = $1',
      [actor.orgId],
    )
  ).rows[0];
  if (!settings) throw notFound();
  let code = data.code?.trim();
  if (!code) {
    const { rows } = await tx.query<{ n: number }>("select struo_next_number($1, 'project') as n", [actor.orgId]);
    code = `P${String(rows[0]!.n).padStart(3, '0')}`;
  }
  let id: string;
  try {
    const { rows } = await tx.query<{ id: string }>(
      `insert into project (org_id, code, name, type_id, client_id, manager_id, location, latitude, longitude,
                            start_date, end_date, status, budget_minor, currency_code, vat_bps, retention_bps, description)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) returning id`,
      [actor.orgId, code, data.name, data.typeId ?? null, data.clientId ?? null, data.managerId ?? null,
        data.location ?? null, data.latitude ?? null, data.longitude ?? null, data.startDate ?? null,
        data.endDate ?? null, data.status, data.budgetMinor, settings.currency, settings.vat, settings.retention,
        data.description ?? null],
    );
    id = rows[0]!.id;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new DomainError('code_taken', 409, { code });
    throw error;
  }
  // Phases: given ones, else the company's template.
  if (data.phases?.length) {
    for (const [index, phase] of data.phases.entries()) {
      await tx.query(
        'insert into project_phase (org_id, project_id, name, position, budget_minor) values ($1, $2, $3, $4, $5)',
        [actor.orgId, id, phase.name, index + 1, phase.budgetMinor],
      );
    }
  } else {
    await tx.query(
      `insert into project_phase (org_id, project_id, name, position)
       select org_id, $2, name, position from phase_template where org_id = $1`,
      [actor.orgId, id],
    );
  }
  // One document row per document type: the compliance checklist starts « missing ».
  await tx.query(
    `insert into project_document (org_id, project_id, doc_type_id, title, status, family)
     select org_id, $2, id, name, 'missing',
            case when name ~* '(contrat|devis|march[ée]|avenant|contract|quote|agreement)' then 'contract'
                 when name ~* '(plan|coupe|fa[cç]ade|[ée]tude|note de calcul|ferraill|drawing|section)' then 'technical'
                 else 'admin' end
       from doc_type where org_id = $1`,
    [actor.orgId, id],
  );
  await journal(tx, actor, 'project.create', id, null, { ...data, code });
  return id;
}

export async function createProject(db: Db, actor: Actor, input: unknown): Promise<{ id: string }> {
  ensure(actor, 'projects.write');
  const data = parse(projectInput, input);
  return asActor(db, actor, async (tx) => ({ id: await createProjectTx(tx, actor, data) }));
}

const projectPatch = projectInput.omit({ phases: true }).partial();

export async function updateProject(db: Db, actor: Actor, id: string, input: unknown): Promise<void> {
  ensure(actor, 'projects.write');
  const data = parse(projectPatch, input);
  const columns: Record<string, string> = {
    code: 'code', name: 'name', typeId: 'type_id', clientId: 'client_id', managerId: 'manager_id', location: 'location',
    latitude: 'latitude', longitude: 'longitude', startDate: 'start_date', endDate: 'end_date', status: 'status',
    budgetMinor: 'budget_minor', description: 'description',
  };
  // A status explicitly sent is applied; zod's default must not overwrite it when absent.
  const raw = (input ?? {}) as Record<string, unknown>;
  const entries = Object.entries(data).filter(([key, value]) => value !== undefined && key in raw && columns[key]);
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('select * from project where id = $1 and org_id = $2 for update', [id, actor.orgId])).rows[0];
    if (!before) throw notFound();
    const patched = Object.fromEntries(entries) as { startDate?: string | null; endDate?: string | null };
    ensureDateOrder('startDate' in patched ? patched.startDate : before.start_date, 'endDate' in patched ? patched.endDate : before.end_date);
    if (entries.length) {
      try {
        await tx.query(
          `update project set ${entries.map(([key], index) => `${columns[key]} = $${index + 3}`).join(', ')}, updated_at = now()
            where id = $1 and org_id = $2`,
          [id, actor.orgId, ...entries.map(([, value]) => value)],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new DomainError('code_taken', 409);
        throw error;
      }
    }
    await journal(tx, actor, 'project.update', id, before, Object.fromEntries(entries));
  });
}

export async function archiveProject(db: Db, actor: Actor, id: string): Promise<void> {
  ensure(actor, 'projects.write');
  await asActor(db, actor, async (tx) => {
    const { rowCount } = await tx.query('update project set archived_at = now() where id = $1 and org_id = $2', [id, actor.orgId]);
    if (!rowCount) throw notFound();
    await journal(tx, actor, 'project.archive', id, null, null);
  });
}

const phaseInput = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  budgetMinor: z.number().int().min(0).optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
});

export async function updatePhase(db: Db, actor: Actor, phaseId: string, input: unknown): Promise<void> {
  ensure(actor, 'projects.write');
  const data = parse(phaseInput, input);
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('select * from project_phase where id = $1 and org_id = $2 for update', [phaseId, actor.orgId])).rows[0];
    if (!before) throw notFound();
    ensureDateOrder(data.startDate !== undefined ? data.startDate : before.start_date, data.endDate !== undefined ? data.endDate : before.end_date);
    await tx.query(
      `update project_phase set name = coalesce($3, name), budget_minor = coalesce($4, budget_minor),
              progress_pct = coalesce($5, progress_pct),
              start_date = case when $6 then $7::date else start_date end,
              end_date = case when $8 then $9::date else end_date end,
              updated_at = now() where id = $1 and org_id = $2`,
      [phaseId, actor.orgId, data.name ?? null, data.budgetMinor ?? null, data.progressPct ?? null,
        data.startDate !== undefined, data.startDate ?? null, data.endDate !== undefined, data.endDate ?? null],
    );
    await journal(tx, actor, 'phase.update', phaseId, before, data);
  });
}

export async function addPhase(db: Db, actor: Actor, projectId: string, input: unknown): Promise<void> {
  ensure(actor, 'projects.write');
  const data = parse(z.object({ name: z.string().trim().min(1).max(80), budgetMinor: z.number().int().min(0).default(0) }), input);
  await asActor(db, actor, async (tx) => {
    await tx.query(
      `insert into project_phase (org_id, project_id, name, position, budget_minor)
       select $1, $2, $3, coalesce(max(position), 0) + 1, $4 from project_phase where project_id = $2`,
      [actor.orgId, projectId, data.name, data.budgetMinor],
    );
    await journal(tx, actor, 'phase.add', projectId, null, data);
  });
}

export async function removePhase(db: Db, actor: Actor, phaseId: string): Promise<void> {
  ensure(actor, 'projects.write');
  await asActor(db, actor, async (tx) => {
    const before = (await tx.query('delete from project_phase where id = $1 and org_id = $2 returning *', [phaseId, actor.orgId])).rows[0];
    if (!before) throw notFound();
    await journal(tx, actor, 'phase.remove', phaseId, before, null);
  });
}

// ---------------------------------------------------------------- CSV import

/**
 * Imports projects from a CSV export of the company's spreadsheet. Header (any order, `;` or `,`):
 * code, name, type, client, status, budget, start, end, location. Unknown types and clients are
 * created. Returns what was created and, per line, what was refused. All or nothing per line.
 */
export async function importProjectsCsv(
  db: Db,
  actor: Actor,
  text: string,
): Promise<{ created: number; errors: { line: number; code: string }[] }> {
  ensure(actor, 'projects.write');
  const lines = text.replace(/^﻿/u, '').split(/\r?\n/u).filter((line) => line.trim());
  if (lines.length < 2) throw new DomainError('csv_empty', 422);
  const separator = (lines[0]!.match(/;/gu)?.length ?? 0) >= (lines[0]!.match(/,/gu)?.length ?? 0) ? ';' : ',';
  const split = (line: string) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === separator && !quoted) {
        cells.push(current.trim());
        current = '';
      } else current += char;
    }
    cells.push(current.trim());
    return cells;
  };
  const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().trim();
  const aliases: Record<string, string> = {
    code: 'code', numero: 'code', 'n°': 'code', name: 'name', nom: 'name', projet: 'name', type: 'type',
    client: 'client', status: 'status', statut: 'status', budget: 'budget', start: 'start', debut: 'start',
    'date debut': 'start', end: 'end', fin: 'end', 'date fin': 'end', location: 'location', lieu: 'location',
    localisation: 'location',
  };
  const header = split(lines[0]!).map((cell) => aliases[normalize(cell)] ?? '');
  if (!header.includes('name')) throw new DomainError('csv_no_name_column', 422);
  const statusOf = (value: string): ProjectStatus => {
    const v = normalize(value);
    if (v.startsWith('en cours') || v === 'active') return 'active';
    if (v.startsWith('suspendu') || v === 'suspended') return 'suspended';
    if (v.startsWith('achev') || v.startsWith('termin') || v === 'done') return 'done';
    return 'pending';
  };
  const dateOf = (value: string) => {
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
    if (iso) return value;
    const fr = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u);
    return fr ? `${fr[3]}-${fr[2]!.padStart(2, '0')}-${fr[1]!.padStart(2, '0')}` : null;
  };
  const currency = await asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ c: string }>('select currency_code as c from org_settings where org_id = $1', [actor.orgId]);
    return rows[0]?.c ?? 'XOF';
  });
  let created = 0;
  const errors: { line: number; code: string }[] = [];
  for (const [index, line] of lines.slice(1).entries()) {
    const cells = split(line);
    const cell = (name: string) => cells[header.indexOf(name)] ?? '';
    try {
      await asActor(db, actor, async (tx) => {
        let typeId: string | null = null;
        if (cell('type')) {
          const found = await tx.query<{ id: string }>(
            `insert into project_type (org_id, name, position) values ($1, $2, 99)
             on conflict (org_id, name) do update set archived_at = null returning id`,
            [actor.orgId, cell('type')],
          );
          typeId = found.rows[0]!.id;
        }
        let clientId: string | null = null;
        if (cell('client')) {
          const existing = await tx.query<{ id: string }>(
            'select id from client where org_id = $1 and lower(name) = lower($2) limit 1',
            [actor.orgId, cell('client')],
          );
          clientId =
            existing.rows[0]?.id ??
            (await tx.query<{ id: string }>('insert into client (org_id, name) values ($1, $2) returning id', [actor.orgId, cell('client')])).rows[0]!.id;
        }
        const budget = cell('budget') ? toMinor(cell('budget'), currency) : 0;
        if (budget === null) throw new DomainError('invalid_amount', 422);
        const data = parse(projectInput, {
          code: cell('code') || undefined,
          name: cell('name'),
          typeId,
          clientId,
          status: statusOf(cell('status')),
          budgetMinor: budget,
          startDate: dateOf(cell('start')),
          endDate: dateOf(cell('end')),
          location: cell('location') || null,
        });
        await createProjectTx(tx, actor, data);
      });
      created += 1;
    } catch (error) {
      errors.push({ line: index + 2, code: error instanceof DomainError ? error.code : 'invalid_input' });
    }
  }
  return { created, errors };
}
