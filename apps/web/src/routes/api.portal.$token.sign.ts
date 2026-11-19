import { randomUUID } from 'node:crypto';
import { DomainError, portalAccess, portalSignMilestone } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';
import { portalDevice } from './api.portal.$token.file.$id.ts';

/**
 * The client validates a milestone by signing with their finger (multipart: `milestoneId`, `signer`,
 * `verdict`, `reserve`, `image` PNG). Only from a confirmed device, only a milestone open to the client.
 */
export const Route = createFileRoute('/api/portal/$token/sign')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const { db, storage } = runtime();
          const link = await portalAccess(db, params.token, portalDevice(request, params.token));
          if (!link || !link.verified) throw new DomainError('portal_link_invalid', 404);
          const form = await request.formData();
          const milestoneId = String(form.get('milestoneId') ?? '');
          if (!/^[0-9a-f-]{36}$/iu.test(milestoneId)) throw new DomainError('invalid_input', 422);
          const image = form.get('image');
          if (!(image instanceof File) || image.type !== 'image/png' || image.size > 2 * 1024 * 1024) throw new DomainError('unsupported_file', 422);
          const id = randomUUID();
          const key = `org/${link.orgId}/signatures/${id}.png`;
          await storage.put(key, new Uint8Array(await image.arrayBuffer()), 'image/png');
          const done = await portalSignMilestone(db, params.token, {
            milestoneId, signer: form.get('signer'), verdict: form.get('verdict') ?? 'conform', reserve: form.get('reserve') || null,
          }, id, key);
          if (!done) throw new DomainError('already_validated', 409);
          return Response.json({ ok: true });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
