import { randomUUID } from 'node:crypto';
import { DomainError, portalAccess, portalDeclarePayment } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError } from '@/server/context.server.ts';
import { notifyClaimDeclared } from '@/server/notify.server.ts';
import { runtime } from '@/server/runtime.server.ts';
import { portalDevice } from './api.portal.$token.file.$id.ts';

const PROOF_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

/**
 * Spec 051 — « I paid »: the client declares a payment on one of their invoices (multipart:
 * `invoiceId`, `amountMinor`, `paidOn`, `method`, `reference`, `note`, optional `proof` image or PDF).
 * Only from a confirmed device. The company confirms it; nothing is recorded as paid before that.
 */
export const Route = createFileRoute('/api/portal/$token/claim')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const rt = runtime();
          const link = await portalAccess(rt.db, params.token, portalDevice(request, params.token));
          if (!link || !link.verified || !link.show.finance) throw new DomainError('portal_link_invalid', 404);
          const form = await request.formData();
          const proofFile = form.get('proof');
          let proof: { key: string; mediaType: string } | null = null;
          if (proofFile instanceof File && proofFile.size > 0) {
            if (!PROOF_TYPES.has(proofFile.type) || proofFile.size > 8 * 1024 * 1024) throw new DomainError('unsupported_file', 422);
            const key = `org/${link.orgId}/claims/${randomUUID()}`;
            await rt.storage.put(key, new Uint8Array(await proofFile.arrayBuffer()), proofFile.type);
            proof = { key, mediaType: proofFile.type };
          }
          const text = (name: string) => { const value = form.get(name); return typeof value === 'string' && value.trim() ? value.trim() : null; };
          const claim = await portalDeclarePayment(rt.owner, params.token, {
            invoiceId: text('invoiceId'), amountMinor: Number(text('amountMinor')), paidOn: text('paidOn'), method: text('method'),
            reference: text('reference'), note: text('note'),
          }, proof);
          await notifyClaimDeclared(rt, claim.orgId, claim.projectId);
          return Response.json({ ok: true, id: claim.id });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
