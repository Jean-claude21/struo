import { paymentClaimProof } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest, serveFile } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

/** Spec 051: the proof a client attached to a declared payment (finance roles only). */
export const Route = createFileRoute('/api/files/claim/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await actorFromRequest(request, 'web');
          const proof = await paymentClaimProof(runtime().db, actor, params.id);
          if (!proof) return Response.json({ error: 'not_found' }, { status: 404 });
          return serveFile(proof.key, proof.mediaType);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
