// Chariow, the store where the platform sells its subscriptions as licences (spec 038).
// GET /v1/licenses/{key} reads a licence, POST /v1/licenses/{key}/activate activates it
// (scopes licenses.read and licenses.write). The key never leaves the server, nor is it logged.
import { DomainError } from '@struo/core';

const API = 'https://api.chariow.com/v1';

export interface ChariowLicense {
  status: 'pending_activation' | 'active' | 'expired' | 'revoked' | string;
  productId: string;
  maskedKey: string;
  customerEmail: string | null;
  canActivate: boolean;
  isActive: boolean;
  isExpired: boolean;
}

type Raw = {
  status?: string; is_active?: boolean; is_expired?: boolean; can_activate?: boolean;
  product?: { id?: string }; license?: { key?: string; masked_key?: string }; customer?: { email?: string };
};

const read = (raw: Raw): ChariowLicense => ({
  status: raw.status ?? 'unknown', productId: raw.product?.id ?? '', maskedKey: raw.license?.masked_key ?? '••••',
  customerEmail: raw.customer?.email ?? null, canActivate: Boolean(raw.can_activate), isActive: Boolean(raw.is_active), isExpired: Boolean(raw.is_expired),
});

async function call(apiKey: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response) throw new DomainError('license_store_unreachable', 409);
  const body = (await response.json().catch(() => ({}))) as { data?: Raw; message?: string };
  return { status: response.status, body };
}

export function createChariow(apiKey: string) {
  return {
    configured: Boolean(apiKey),
    async license(key: string): Promise<ChariowLicense> {
      if (!apiKey) throw new DomainError('license_store_off', 409);
      const { status, body } = await call(apiKey, `/licenses/${encodeURIComponent(key.trim())}`);
      if (status === 404) throw new DomainError('license_invalid', 422);
      if (status === 401 || status === 403) throw new DomainError('license_store_off', 409);
      if (status >= 400 || !body.data) throw new DomainError('license_store_unreachable', 409);
      return read(body.data);
    },
    /** Activates the licence for this company (device identifier `struo:<org>`). */
    async activate(key: string, deviceIdentifier: string): Promise<ChariowLicense> {
      const { status, body } = await call(apiKey, `/licenses/${encodeURIComponent(key.trim())}/activate`, { method: 'POST', body: JSON.stringify({ device_identifier: deviceIdentifier }) });
      if (status === 404) throw new DomainError('license_invalid', 422);
      if (status === 400) {
        const message = (body.message ?? '').toLowerCase();
        throw new DomainError(message.includes('revoked') ? 'license_revoked' : message.includes('expired') ? 'license_expired' : message.includes('limit') ? 'license_already_used' : 'license_invalid', 422);
      }
      if (status >= 400 || !body.data) throw new DomainError('license_store_unreachable', 409);
      return read(body.data);
    },
  };
}
