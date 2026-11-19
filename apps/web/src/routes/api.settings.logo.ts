import { randomBytes } from 'node:crypto';
import { DomainError, setCompanyLogo } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest, ALLOWED_IMAGE_TYPES } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const MAX_LOGO = 1_000_000;

/**
 * The company's logo (spec 036): PNG, JPEG or WebP up to 1 MB (no SVG: a drawing that runs scripts
 * has no place on an invoice). Printed on invoices and shown in client spaces.
 */
export const Route = createFileRoute('/api/settings/logo')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'web', 'finance.write');
          const form = await request.formData();
          const file = form.get('logo');
          if (!(file instanceof File)) throw new DomainError('invalid_input', 422);
          if (file.size > MAX_LOGO) throw new DomainError('file_too_large', 422);
          if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new DomainError('unsupported_file', 422);
          const key = `org/${actor.orgId}/branding/logo-${randomBytes(6).toString('hex')}`;
          await runtime().storage.put(key, new Uint8Array(await file.arrayBuffer()), file.type);
          await setCompanyLogo(runtime().db, actor, key, `/api/files/logo/${actor.orgId}`);
          return Response.json({ ok: true, url: `/api/files/logo/${actor.orgId}?v=${key.slice(-12)}` });
        } catch (error) {
          return jsonError(error);
        }
      },
      DELETE: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'web', 'finance.write');
          await setCompanyLogo(runtime().db, actor, null, null);
          return Response.json({ ok: true });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
