import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { asActor, ensure, journal, parse, resolveActor } from './access.ts';
import type { Actor, Db } from './db.ts';
import { notFound } from './errors.ts';
import { hashToken } from './portal.ts';

const PREFIX = 'struo_sk_';

/** Creates an API/MCP key acting as its creator in this company. The key is shown once. */
export async function createApiKey(db: Db, actor: Actor, name: unknown): Promise<{ id: string; key: string }> {
  ensure(actor, 'apikeys.manage');
  const label = parse(z.string().trim().min(1).max(80), name);
  const key = `${PREFIX}${randomBytes(24).toString('base64url')}`;
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'insert into api_key (org_id, name, prefix, key_hash, user_id) values ($1, $2, $3, $4, $5) returning id',
      [actor.orgId, label, key.slice(0, PREFIX.length + 4), hashToken(key), actor.userId],
    );
    await journal(tx, actor, 'apikey.create', rows[0]!.id, null, { name: label });
    return { id: rows[0]!.id, key };
  });
}

export async function listApiKeys(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select k.id, k.name, k.prefix, u.name as "ownerName", k.created_at as "createdAt", k.last_used_at as "lastUsedAt",
              k.revoked_at as "revokedAt"
         from api_key k join "user" u on u.id = k.user_id where k.org_id = $1 order by k.created_at desc`,
      [actor.orgId],
    );
    return rows as { id: string; name: string; prefix: string; ownerName: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }[];
  });
}

export async function revokeApiKey(db: Db, actor: Actor, id: string): Promise<void> {
  ensure(actor, 'apikeys.manage');
  await asActor(db, actor, async (tx) => {
    const { rowCount } = await tx.query('update api_key set revoked_at = now() where id = $1 and org_id = $2 and revoked_at is null', [id, actor.orgId]);
    if (!rowCount) throw notFound();
    await journal(tx, actor, 'apikey.revoke', id, null, null);
  });
}

/** The actor a bearer key stands for (its creator, in its company, with their current role). */
export async function actorFromApiKey(db: Db, key: string, door: 'api' | 'mcp'): Promise<Actor | null> {
  if (!key.startsWith(PREFIX)) return null;
  const { rows } = await db.query<{ org_id: string; user_id: string }>('select * from struo_api_key_owner($1)', [hashToken(key)]);
  const owner = rows[0];
  if (!owner) return null;
  return resolveActor(db, owner.user_id, owner.org_id, door);
}
