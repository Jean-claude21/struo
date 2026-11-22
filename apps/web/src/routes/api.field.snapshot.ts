import { can, companyAccess, fieldSnapshot, getSettings, listChecklistRuns, listChecklistTemplates, listDocuments, listIncidents, listMaterialRequests, listNotes, listReports } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';
import { forecast, RAIN_LIMIT } from '@/server/weather.server.ts';

/**
 * What the field app keeps on the phone to work offline (spec 025): the open sites with their
 * phases, weather and plans, the checklists to fill, today's done checklists, open incidents and the
 * reports the office sent back for details.
 */
export const Route = createFileRoute('/api/field/snapshot')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'field');
          const { db, reader } = runtime();
          const [snapshot, settings, user, templates, runs, documents, incidents, reports] = await Promise.all([
            fieldSnapshot(db, actor),
            getSettings(db, actor),
            db.query<{ name: string }>('select name from "user" where id = $1', [actor.userId]),
            listChecklistTemplates(db, actor),
            listChecklistRuns(db, actor, { limit: 100 }),
            listDocuments(db, actor),
            listIncidents(db, actor, {}),
            listReports(db, actor, { status: 'rejected', limit: 30 }),
          ]);
          const today = new Date().toISOString().slice(0, 10);
          const requests = await listMaterialRequests(db, actor, { limit: 60 });
          const projects = await Promise.all(snapshot.projects.map(async (project) => ({
            ...project,
            // Spec 052: the site's thread with the office, and the material asked for.
            notes: (await listNotes(db, actor, project.id)).slice(0, 30).map((note) => ({ id: note.id, authorName: note.authorName, mine: note.authorId === actor.userId, body: note.body, at: new Date(note.createdAt).toISOString() })),
            requests: requests.filter((item) => item.projectId === project.id).slice(0, 20).map((item) => ({ id: item.id, item: item.item, quantity: item.quantity, neededOn: item.neededOn, status: item.status, officeNote: item.officeNote, mine: item.requestedBy === actor.userId })),
            weather: project.status === 'active' && project.latitude !== null && project.longitude !== null ? await forecast(project.latitude, project.longitude) : [],
            // Spec 048: the field works only with the technical documents (drawings, studies).
            plans: documents.filter((document) => document.projectId === project.id && document.hasFile && document.family === 'technical').map((document) => ({ id: document.id, title: document.title })),
            openIncidents: incidents.filter((incident) => incident.projectId === project.id && incident.status !== 'resolved').length,
            checklistsToday: runs.filter((run) => run.projectId === project.id && run.doneAt.slice(0, 10) === today).map((run) => ({ name: run.name, completed: run.completed })),
          })));
          return Response.json(
            {
              ...snapshot,
              projects,
              templates,
              rainLimit: RAIN_LIMIT,
              scanAvailable: reader.configured,
              // What to redo: this person's reports rejected in the last 14 days, the 3 latest.
              toFix: reports.filter((report) => report.authorId === actor.userId && Date.now() - new Date(report.takenAt).getTime() < 14 * 86_400_000)
                .slice(0, 3).map((report) => ({
                id: report.id, projectCode: report.projectCode, note: report.note, reviewNote: report.reviewNote, takenAt: report.takenAt,
              })),
              user: { id: actor.userId, name: user.rows[0]?.name ?? '', role: actor.role, canReport: can(actor.role, 'field.report') },
              company: { name: settings.name },
              // Spec 060: the end of the trial or licence, shown on the phone too.
              access: await companyAccess(runtime().owner, actor.orgId),
            },
            { headers: { 'cache-control': 'no-store' } },
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
