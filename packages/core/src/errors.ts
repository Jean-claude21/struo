/**
 * A refusal the user can understand. `code` is an i18n key (`errors.<code>` in the catalogs);
 * `status` is the HTTP status the doors use.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 = 400,
    readonly params: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = 'DomainError';
  }
}

export const notFound = (what = 'not_found') => new DomainError(what, 404);
export const forbidden = () => new DomainError('forbidden', 403);
