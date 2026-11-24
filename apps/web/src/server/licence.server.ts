// Spec 038 → 069: applying a licence key, the same way whether the company pastes it or the store
// sends it by itself (Chariow Pulse). The key never leaves the server, nor is it logged.
import { createHmac, timingSafeEqual } from 'node:crypto';
import * as core from '@struo/core';
import { createChariow } from './chariow.server.ts';
import type { Runtime } from './runtime.server.ts';

export async function applyLicenceKey(rt: Runtime, actor: core.Actor, key: string): Promise<{ planCode: string; paidUntil: string }> {
  const { owner, env } = rt;
  if (key.length < 6 || key.length > 200) throw new core.DomainError('license_invalid', 422);
  const store = createChariow(env.CHARIOW_API_KEY);
  const license = await store.license(key);
  if (license.status === 'revoked') throw new core.DomainError('license_revoked', 422);
  if (license.isExpired || license.status === 'expired') throw new core.DomainError('license_expired', 422);
  await core.licenseProductFor(owner, license.productId);
  if (await core.licenseAlreadyUsed(owner, key)) throw new core.DomainError('license_already_used', 409);
  const activated = license.status === 'pending_activation' || license.canActivate ? await store.activate(key, `struo:${actor.orgId}`) : license;
  return core.redeemLicense(owner, actor, { key, maskedKey: activated.maskedKey || license.maskedKey, productId: license.productId, customerEmail: license.customerEmail });
}

/**
 * A Pulse is genuine when `x-chariow-signature` is `sha256=` + the HMAC-SHA256 (hex) of the raw body
 * with the Pulse's own signing secret (`whsec_…`). Several secrets may be configured (comma-separated)
 * so a secret can be rotated without losing deliveries.
 */
export function pulseSignatureValid(rawBody: string, header: string | null, secrets: string[]): boolean {
  const given = (header ?? '').trim().toLowerCase();
  if (!/^sha256=[0-9a-f]{64}$/u.test(given)) return false;
  return secrets.some((secret) => {
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  });
}
