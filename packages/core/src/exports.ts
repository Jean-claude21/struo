import { asActor, ensure, journal } from './access.ts';
import type { Actor, Db } from './db.ts';
import { DomainError } from './errors.ts';
import { fromMinor } from './money.ts';

export const ACCOUNTING_EXPORTS = ['invoices', 'payments', 'expenses'] as const;
export type AccountingExport = (typeof ACCOUNTING_EXPORTS)[number];

const cell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[";\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
/** CSV for spreadsheets set to French: `;` separator, decimal comma, BOM so accents open right. */
const csv = (header: string[], rows: unknown[][]) =>
  `﻿${[header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n')}\r\n`;
const amount = (minor: number, currency: string) => String(fromMinor(minor, currency)).replace('.', ',');

/**
 * Accounting export (spec 018) for the accountant's software: invoices, payments or expenses of a
 * period, one line each, amounts in currency units. Figures come from the database.
 */
export async function accountingExport(
  db: Db,
  actor: Actor,
  kind: AccountingExport,
  period: { from?: string; to?: string } = {},
): Promise<{ filename: string; content: string }> {
  ensure(actor, 'finance.read');
  if (!ACCOUNTING_EXPORTS.includes(kind)) throw new DomainError('invalid_input', 422, { field: 'kind', detail: '' });
  const from = period.from && /^\d{4}-\d{2}-\d{2}$/u.test(period.from) ? period.from : '1900-01-01';
  const to = period.to && /^\d{4}-\d{2}-\d{2}$/u.test(period.to) ? period.to : '2999-12-31';
  return asActor(db, actor, async (tx) => {
    if (kind === 'invoices') {
      const { rows } = await tx.query(
        `select i.number, i.kind, i.status, i.issued_on, i.due_on, p.code, p.name as project, c.name as client, i.currency_code,
                i.amount_minor, i.vat_bps, i.vat_minor, i.total_minor, i.retention_minor, i.deduction_minor, i.net_minor,
                coalesce(b.paid_minor, 0) as paid_minor, coalesce(b.balance_minor, 0) as balance_minor
           from invoice i join project p on p.id = i.project_id left join client c on c.id = p.client_id
           left join invoice_balance b on b.invoice_id = i.id
          where i.org_id = $1 and i.issued_on between $2 and $3 order by i.issued_on, i.number`,
        [actor.orgId, from, to],
      );
      return {
        filename: `factures_${from}_${to}.csv`,
        content: csv(
          ['numero', 'type', 'statut', 'date', 'echeance', 'projet_code', 'projet', 'client', 'devise', 'montant_ht', 'tva_pct',
            'tva', 'total_ttc', 'retenue', 'deduction', 'net', 'paye', 'reste_du'],
          rows.map((r) => [r.number, r.kind, r.status, r.issued_on, r.due_on, r.code, r.project, r.client, r.currency_code,
            amount(r.amount_minor, r.currency_code), String(r.vat_bps / 100).replace('.', ','), amount(r.vat_minor, r.currency_code),
            amount(r.total_minor, r.currency_code), amount(r.retention_minor, r.currency_code), amount(r.deduction_minor, r.currency_code),
            amount(r.net_minor, r.currency_code), amount(r.paid_minor, r.currency_code), amount(r.balance_minor, r.currency_code)]),
        ),
      };
    }
    if (kind === 'payments') {
      const { rows } = await tx.query(
        `select pa.received_on, p.code, p.name as project, i.number, pa.method, pa.reference, pa.currency_code, pa.amount_minor
           from payment pa join project p on p.id = pa.project_id left join invoice i on i.id = pa.invoice_id
          where pa.org_id = $1 and pa.received_on between $2 and $3 order by pa.received_on`,
        [actor.orgId, from, to],
      );
      return {
        filename: `encaissements_${from}_${to}.csv`,
        content: csv(
          ['date', 'projet_code', 'projet', 'facture', 'mode', 'reference', 'devise', 'montant'],
          rows.map((r) => [r.received_on, r.code, r.project, r.number, r.method, r.reference, r.currency_code, amount(r.amount_minor, r.currency_code)]),
        ),
      };
    }
    const { rows } = await tx.query(
      `select e.spent_on, p.code, p.name as project, e.category, e.supplier, e.label, e.currency_code, e.amount_minor
         from expense e join project p on p.id = e.project_id
        where e.org_id = $1 and e.spent_on between $2 and $3 order by e.spent_on`,
      [actor.orgId, from, to],
    );
    return {
      filename: `depenses_${from}_${to}.csv`,
      content: csv(
        ['date', 'projet_code', 'projet', 'categorie', 'fournisseur', 'libelle', 'devise', 'montant'],
        rows.map((r) => [r.spent_on, r.code, r.project, r.category, r.supplier, r.label, r.currency_code, amount(r.amount_minor, r.currency_code)]),
      ),
    };
  });
}

/** The company's tables, in the order they are exported (each read under row-level security). */
const COMPANY_TABLES = [
  'org_settings', 'project_type', 'phase_template', 'doc_type', 'client', 'project', 'project_phase', 'site_report',
  'report_photo', 'incident', 'invoice', 'payment', 'reminder', 'expense', 'project_document', 'milestone', 'message',
  'journal',
] as const;

/**
 * Everything of a company (spec 018): its tables as JSON and the storage keys of its files, so the
 * door can build a zip. Owners and admins only. Secrets (payment keys, API key hashes, portal token
 * hashes) are never exported.
 */
export async function companyExport(db: Db, actor: Actor) {
  ensure(actor, 'org.manage');
  return asActor(db, actor, async (tx) => {
    const tables: Record<string, unknown[]> = {};
    for (const table of COMPANY_TABLES) {
      const { rows } = await tx.query(`select * from ${table} where org_id = $1`, [actor.orgId]);
      tables[table] = rows;
    }
    const members = await tx.query(
      `select u.name, u.email, m.role, m."createdAt" as joined_at from member m join "user" u on u.id = m."userId"
        where m."organizationId" = $1`,
      [actor.orgId],
    );
    tables.members = members.rows;
    const files = [
      ...(tables.report_photo as { id: string; storage_key: string; media_type: string }[]).map((row) => ({
        key: row.storage_key, path: `photos/${row.id}.${row.media_type.split('/')[1] ?? 'bin'}`,
      })),
      ...(tables.project_document as { id: string; storage_key: string | null; media_type: string | null; title: string }[])
        .filter((row) => row.storage_key)
        .map((row) => ({ key: row.storage_key!, path: `documents/${row.id}-${row.title.replace(/[^\w.-]+/gu, '_').slice(0, 60)}.${row.media_type === 'application/pdf' ? 'pdf' : (row.media_type ?? 'bin/bin').split('/')[1]}` })),
      ...(tables.site_report as { id: string; audio_key: string | null; audio_media_type: string | null }[])
        .filter((row) => row.audio_key)
        .map((row) => ({ key: row.audio_key!, path: `audio/${row.id}.${(row.audio_media_type ?? 'audio/webm').split('/')[1]}` })),
    ];
    await journal(tx, actor, 'company.export', actor.orgId, null, { tables: Object.keys(tables).length, files: files.length });
    return { exportedAt: new Date().toISOString(), orgId: actor.orgId, tables, files };
  });
}

/**
 * Erases a company for good (spec 018): the organization and, by cascade, every row of it. Only an
 * owner, who must type the company's exact name. Returns the storage prefix to empty.
 */
export async function eraseCompany(db: Db, actor: Actor, confirmName: string): Promise<{ storagePrefix: string }> {
  if (actor.role !== 'owner') throw new DomainError('forbidden', 403);
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ name: string }>('select name from organization where id = $1', [actor.orgId]);
    if (!rows[0] || rows[0].name.trim() !== confirmName.trim()) throw new DomainError('erase_name_mismatch', 422);
    await tx.query('delete from mcp_grant where org_id = $1', [actor.orgId]);
    await tx.query('delete from organization where id = $1', [actor.orgId]);
    return { storagePrefix: `org/${actor.orgId}/` };
  });
}
