import { createAuthClient } from 'better-auth/react';

/** Accounts API (Better Auth) called from the browser; same origin. */
export const authClient = createAuthClient({ basePath: '/api/auth' });
