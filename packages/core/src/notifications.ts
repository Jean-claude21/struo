import { z } from 'zod';
import { asActor, parse } from './access.ts';
import type { Actor, Db } from './db.ts';

/**
 * Spec 073: the kinds of notice a team member receives, with what reaches them by default. The bell
 * in the app always keeps them; the phone and e-mail follow each person's choices.
 */
export const NOTICE_KINDS = {
  report: { push: true, email: false },
  review: { push: true, email: false },
  incident: { push: true, email: true },
  material: { push: true, email: true },
  materialUpdate: { push: true, email: false },
  note: { push: true, email: false },
  task: { push: true, email: true },
  claim: { push: true, email: true },
} as const satisfies Record<string, { push: boolean; email: boolean }>;
export type NoticeKind = keyof typeof NOTICE_KINDS;
export const isNoticeKind = (value: unknown): value is NoticeKind => typeof value === 'string' && value in NOTICE_KINDS;

export interface Notice { id: string; kind: string; title: string; body: string | null; url: string | null; createdAt: string; read: boolean }
export interface NoticePref { kind: NoticeKind; push: boolean; email: boolean }

/** Keeps notices for their recipients (platform connection). */
export async function recordNotices(owner: Db, orgId: string, items: { userId: string; kind: NoticeKind; title: string; body?: string | null; url?: string | null }[]): Promise<void> {
  for (const item of items) {
    await owner.query('insert into notification (org_id, user_id, kind, title, body, url) values ($1, $2, $3, $4, $5, $6)',
      [orgId, item.userId, item.kind, item.title.slice(0, 200), item.body?.slice(0, 500) ?? null, item.url?.slice(0, 500) ?? null]);
  }
}

/** Each recipient's choice for one kind (their row, else the default). */
export async function noticeChoices(owner: Db, orgId: string, userIds: string[], kind: NoticeKind): Promise<Map<string, { push: boolean; email: boolean }>> {
  const { rows } = await owner.query<{ userId: string; push: boolean; email: boolean }>(
    'select user_id as "userId", push, email from notification_pref where org_id = $1 and kind = $2 and user_id = any($3::text[])', [orgId, kind, userIds]);
  const chosen = new Map(rows.map((row) => [row.userId, { push: row.push, email: row.email }]));
  return new Map(userIds.map((userId) => [userId, chosen.get(userId) ?? { ...NOTICE_KINDS[kind] }]));
}

export async function myNotices(db: Db, actor: Actor, limit = 40): Promise<{ items: Notice[]; unread: number }> {
  return asActor(db, actor, async (tx) => {
    const [items, unread] = await Promise.all([
      tx.query<Notice>(
        `select id, kind, title, body, url, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt", read_at is not null as read
           from notification where org_id = $1 and user_id = $2 order by created_at desc limit $3`, [actor.orgId, actor.userId, limit]),
      tx.query<{ n: number }>('select count(*)::int as n from notification where org_id = $1 and user_id = $2 and read_at is null', [actor.orgId, actor.userId]),
    ]);
    return { items: items.rows, unread: unread.rows[0]?.n ?? 0 };
  });
}

/** Marks some notices read, or all of them when no id is given. */
export async function markNoticesRead(db: Db, actor: Actor, ids?: string[]): Promise<number> {
  const value = ids ? parse(z.array(z.string().uuid()).max(200), ids) : null;
  return asActor(db, actor, async (tx) => {
    const { rowCount } = await tx.query(
      `update notification set read_at = now() where org_id = $1 and user_id = $2 and read_at is null and ($3::uuid[] is null or id = any($3::uuid[]))`,
      [actor.orgId, actor.userId, value]);
    return rowCount ?? 0;
  });
}

export async function myNoticePrefs(db: Db, actor: Actor): Promise<NoticePref[]> {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ kind: string; push: boolean; email: boolean }>('select kind, push, email from notification_pref where org_id = $1 and user_id = $2', [actor.orgId, actor.userId]);
    return (Object.keys(NOTICE_KINDS) as NoticeKind[]).map((kind) => {
      const row = rows.find((item) => item.kind === kind);
      return { kind, push: row?.push ?? NOTICE_KINDS[kind].push, email: row?.email ?? NOTICE_KINDS[kind].email };
    });
  });
}

export async function setMyNoticePref(db: Db, actor: Actor, input: unknown): Promise<NoticePref> {
  const value = parse(z.object({ kind: z.string().refine(isNoticeKind), push: z.boolean(), email: z.boolean() }), input) as NoticePref;
  return asActor(db, actor, async (tx) => {
    await tx.query(
      `insert into notification_pref (org_id, user_id, kind, push, email) values ($1, $2, $3, $4, $5)
       on conflict (org_id, user_id, kind) do update set push = excluded.push, email = excluded.email, updated_at = now()`,
      [actor.orgId, actor.userId, value.kind, value.push, value.email]);
    return value;
  });
}

/**
 * Who in the office hears about a site (spec 073): the owner and the admins always; the engineers
 * only when the site is theirs (its manager) — all engineers when the site has no manager.
 */
export async function siteOffice(owner: Db, orgId: string, projectId: string): Promise<{ userId: string; email: string; role: string }[]> {
  const { rows } = await owner.query<{ userId: string; email: string; role: string }>(
    `select u.id as "userId", u.email, m.role
       from member m join "user" u on u.id = m."userId" left join project p on p.id = $2 and p.org_id = $1
      where m."organizationId" = $1
        and (m.role in ('owner', 'admin') or (m.role = 'engineer' and (p.manager_id is null or p.manager_id = u.id)))`, [orgId, projectId]);
  return rows;
}
