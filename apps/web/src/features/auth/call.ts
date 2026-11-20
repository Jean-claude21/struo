/** Calls an endpoint of the accounts library from the browser; returns its error code when it refuses. */
export async function authCall(path: string, body?: Record<string, unknown>, method: 'POST' | 'GET' = 'POST'): Promise<{ ok: boolean; code?: string; data?: unknown }> {
  try {
    const response = await fetch(`/api/auth${path}`, {
      method,
      credentials: 'same-origin',
      headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });
    const data = (await response.json().catch(() => ({}))) as { code?: string } | null;
    return response.ok ? { ok: true, data } : { ok: false, code: data?.code ?? (response.status === 429 ? 'TOO_MANY_REQUESTS' : 'UNKNOWN') };
  } catch {
    return { ok: false, code: 'NETWORK' };
  }
}

/** The message key for an accounts-library error code. */
export function authErrorKey(code?: string): string {
  switch (code) {
    case 'INVALID_TOKEN': return 'account.err.invalidToken';
    case 'INVALID_PASSWORD': case 'INVALID_EMAIL_OR_PASSWORD': return 'account.err.wrongPassword';
    case 'PASSWORD_TOO_SHORT': return 'account.err.tooShort';
    case 'PASSWORD_TOO_LONG': return 'account.err.tooLong';
    case 'USER_ALREADY_EXISTS': case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL': return 'account.err.exists';
    case 'EMAIL_IS_THE_SAME': return 'account.err.sameEmail';
    case 'TOO_MANY_REQUESTS': return 'account.err.tooMany';
    case 'NETWORK': return 'account.err.network';
    default: return 'account.err.generic';
  }
}
