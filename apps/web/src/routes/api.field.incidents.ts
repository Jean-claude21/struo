import { reportIncident } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { authorName, notifyTaskAssigned, notifyTeam } from '@/server/notify.server.ts';
import { runtime } from '@/server/runtime.server.ts';

export const Route = createFileRoute('/api/field/incidents')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'field', 'field.report');
          // The body is read once (reading it again after use threw, after the incident was saved).
          const input = (await request.json()) as { projectId?: string; description?: string };
          const result = await reportIncident(runtime().db, actor, input);
          // Spec 049: the site's manager is told the task that clears the incident is theirs.
          if (result.created) {
            const { rows } = await runtime().owner.query<{ id: string }>('select id from project_task where incident_id = $1 and org_id = $2', [result.id, actor.orgId]);
            if (rows[0]) await notifyTaskAssigned(runtime(), actor, rows[0].id);
            // Spec 052: and the office, whoever the task went to.
            void notifyTeam(runtime(), actor, String(input.projectId ?? ''), 'incident', { author: await authorName(runtime(), actor), text: String(input.description ?? '').slice(0, 140) });
          }
          return Response.json(result, { status: result.created ? 201 : 200 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
