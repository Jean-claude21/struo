import { DomainError, recordSignature } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** A signature drawn on screen (multipart: `signature` JSON + `image` PNG). Idempotent on its id. */
export const Route = createFileRoute('/api/field/signatures')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const door = new URL(request.url).searchParams.get('via') === 'office' ? 'web' : 'field';
          const actor = await actorFromRequest(request, door, 'field.report');
          const form = await request.formData();
          const meta = JSON.parse(String(form.get('signature') ?? '{}')) as { id?: string };
          const image = form.get('image');
          if (typeof meta.id !== 'string' || !UUID.test(meta.id)) throw new DomainError('invalid_input', 422);
          if (!(image instanceof File) || image.type !== 'image/png' || image.size > 2 * 1024 * 1024) throw new DomainError('unsupported_file', 422);
          const key = `org/${actor.orgId}/signatures/${meta.id}.png`;
          await runtime().storage.put(key, new Uint8Array(await image.arrayBuffer()), 'image/png');
          const result = await recordSignature(runtime().db, actor, meta, key, door === 'web' ? 'office' : 'field');
          return Response.json(result, { status: result.created ? 201 : 200 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
