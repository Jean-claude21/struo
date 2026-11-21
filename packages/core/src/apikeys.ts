import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { asActor, ensure, journal, parse, resolveActor } from './access.ts';
import { asUser, type Actor, type Db } from './db.ts';
import { DomainError, notFound } from './errors.ts';
import { assertFeature } from './founder.ts';
import { hashToken } from './portal.ts';

const PREFIX = 'struo_sk_';

/** Creates an API/MCP key acting as its creator in this company. The key is shown once. */
export async function createApiKey(db: Db, actor: Actor, name: unknown): Promise<{ id: string; key: string }> {
  ensure(actor, 'apikeys.manage');
  const label = parse(z.string().trim().min(1).max(80), name);
  const key = `${PREFIX}${randomBytes(24).toString('base64url')}`;
  return asActor(db, actor, async (tx) => {
    // Spec 055: API keys and MCP connections are a feature of the company's plan.
    await assertFeature(tx, actor.orgId, 'mcp');
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

// ---------------------------------------------------------------- OAuth MCP clients (spec 016)

/** Records which company an OAuth client (Claude.ai, ChatGPT…) may reach for this person. */
export async function grantMcpCompany(db: Db, userId: string, clientId: string, orgId: string): Promise<void> {
  const actor = await resolveActor(db, userId, orgId, 'mcp');
  if (!actor) throw new DomainError('forbidden', 403);
  await asActor(db, actor, async (tx) => {
    await tx.query(
      `insert into mcp_grant (user_id, client_id, org_id) values ($1, $2, $3)
       on conflict (user_id, client_id) do update set org_id = excluded.org_id, created_at = now()`,
      [userId, clientId, orgId],
    );
    await journal(tx, actor, 'mcp.grant', clientId, null, { orgId });
  });
}

/** The actor an OAuth token stands for: its person, in the company chosen at consent. */
export async function actorFromMcpGrant(db: Db, userId: string, clientId: string): Promise<Actor | null> {
  const orgId = await asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ org_id: string }>('select org_id from mcp_grant where user_id = $1 and client_id = $2', [userId, clientId]);
    return rows[0]?.org_id ?? null;
  });
  return orgId ? resolveActor(db, userId, orgId, 'mcp') : null;
}

/** The OAuth clients connected to this company, for its members to see and revoke their own. */
export async function listMcpConnections(db: Db, actor: Actor) {
  return asActor(db, actor, async (tx) => {
    const { rows } = await tx.query(
      `select g.client_id as "clientId", coalesce(c.name, g.client_id) as "clientName", u.name as "userName",
              g.user_id = $2 as mine, g.created_at as "createdAt"
         from mcp_grant g join "user" u on u.id = g.user_id left join "oauthClient" c on c."clientId" = g.client_id
        where g.org_id = $1 order by g.created_at desc`,
      [actor.orgId, actor.userId],
    );
    return rows as { clientId: string; clientName: string; userName: string; mine: boolean; createdAt: string }[];
  });
}

/** Revokes one's own OAuth connection: the grant and the consent go, the token stops working. */
export async function revokeMcpConnection(db: Db, actor: Actor, clientId: string): Promise<void> {
  await asActor(db, actor, async (tx) => {
    await tx.query('delete from mcp_grant where user_id = $1 and client_id = $2', [actor.userId, clientId]);
    await tx.query('delete from "oauthConsent" where "userId" = $1 and "clientId" = $2', [actor.userId, clientId]);
    await tx.query('update "oauthAccessToken" set revoked = now() where "userId" = $1 and "clientId" = $2 and revoked is null', [actor.userId, clientId]);
    await journal(tx, actor, 'mcp.revoke', clientId, null, null);
  });
}
