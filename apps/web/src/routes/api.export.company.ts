import { companyExport } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';
import { zip } from '@/server/zip.server.ts';

/**
 * Everything of the company as one zip (spec 018): data.json (every table, members, journal) and
 * the files (photos, documents, voice notes). Owners and admins only; no secret inside.
 */
export const Route = createFileRoute('/api/export/company')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'api', 'org.manage');
          const { db, storage } = runtime();
          const exported = await companyExport(db, actor);
          const files: { path: string; content: string | Uint8Array }[] = [
            { path: 'data.json', content: JSON.stringify({ exportedAt: exported.exportedAt, tables: exported.tables }, null, 2) },
            {
              path: 'LISEZMOI.txt',
              content:
                'Export complet Struo. data.json : toutes les tables de l’entreprise (montants en unités mineures de la devise).\n' +
                'photos/, documents/, audio/ : les fichiers. Full Struo export: data.json holds every table (amounts in minor units).\n',
            },
          ];
          for (const file of exported.files) {
            const stored = await storage.get(file.key);
            if (stored) files.push({ path: file.path, content: stored.body });
          }
          const date = exported.exportedAt.slice(0, 10);
          return new Response(zip(files) as unknown as BodyInit, {
            headers: {
              'content-type': 'application/zip',
              'content-disposition': `attachment; filename="struo-export-${date}.zip"`,
              'cache-control': 'no-store',
            },
          });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
