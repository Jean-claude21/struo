import { DomainError, recordDelivery } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest, ALLOWED_IMAGE_TYPES } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** A delivery received on site (multipart: `delivery` JSON + optional `photo`). Idempotent on its id. */
export const Route = createFileRoute('/api/field/deliveries')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'field', 'field.report');
          const form = await request.formData();
          const meta = JSON.parse(String(form.get('delivery') ?? '{}')) as { id?: string };
          if (typeof meta.id !== 'string' || !UUID.test(meta.id)) throw new DomainError('invalid_input', 422);
          let key: string | null = null;
          const photo = form.get('photo');
          if (photo instanceof File && photo.size > 0) {
            if (photo.size > 15 * 1024 * 1024) throw new DomainError('file_too_large', 422);
            const type = ALLOWED_IMAGE_TYPES.has(photo.type) ? photo.type : 'image/jpeg';
            key = `org/${actor.orgId}/deliveries/${meta.id}`;
            await runtime().storage.put(key, new Uint8Array(await photo.arrayBuffer()), type);
          }
          const result = await recordDelivery(runtime().db, actor, meta, key);
          return Response.json(result, { status: result.created ? 201 : 200 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
