import { DomainError, getSettings } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest, ALLOWED_IMAGE_TYPES } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

/**
 * Reads a photographed delivery note (multipart `photo`) and answers the fields it could read; the
 * site lead checks and corrects them before saving. Needs the network: offline, the form is typed.
 */
export const Route = createFileRoute('/api/field/scan')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'field', 'field.report');
          const { reader, db } = runtime();
          if (!reader.configured) throw new DomainError('reader_unavailable', 422);
          const form = await request.formData();
          const photo = form.get('photo');
          if (!(photo instanceof File) || photo.size === 0 || photo.size > 15 * 1024 * 1024) throw new DomainError('unsupported_file', 422);
          const mediaType = ALLOWED_IMAGE_TYPES.has(photo.type) ? photo.type : 'image/jpeg';
          const { locale } = await getSettings(db, actor);
          const fields = await reader.readDeliveryNote({ body: new Uint8Array(await photo.arrayBuffer()), mediaType }, locale);
          return Response.json(fields);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
