import { attachDocumentFile, DomainError } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest, ALLOWED_DOCUMENT_TYPES } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const MAX = 25 * 1024 * 1024;

export const Route = createFileRoute('/api/documents/$id/file')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await actorFromRequest(request, 'web', 'documents.write');
          const file = (await request.formData()).get('file');
          if (!(file instanceof File)) throw new DomainError('invalid_input', 422);
          if (file.size > MAX) throw new DomainError('file_too_large', 422);
          if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) throw new DomainError('unsupported_file', 422);
          const key = `org/${actor.orgId}/documents/${params.id}/${crypto.randomUUID()}`;
          await runtime().storage.put(key, new Uint8Array(await file.arrayBuffer()), file.type);
          await attachDocumentFile(runtime().db, actor, params.id, { storageKey: key, mediaType: file.type, sizeBytes: file.size });
          return Response.json({ ok: true });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
