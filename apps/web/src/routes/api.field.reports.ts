import { DomainError, getSettings, setReportTranscript, submitReport, type Actor } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { actorFromRequest, ALLOWED_IMAGE_TYPES } from '@/server/api.server.ts';
import { jsonError } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const MAX_PHOTO = 15 * 1024 * 1024;
const MAX_AUDIO = 25 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Receives a report from the field app (multipart: `report` JSON, `photos` JSON, one file per
 * photo). Photos are stored under keys derived from their device ids, then the report is saved;
 * sending the same report again is harmless (idempotency key = its id).
 */
export const Route = createFileRoute('/api/field/reports')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await actorFromRequest(request, 'field', 'field.report');
          const form = await request.formData();
          const report = JSON.parse(String(form.get('report') ?? '{}')) as Record<string, unknown>;
          const photosMeta = JSON.parse(String(form.get('photos') ?? '[]')) as {
            id: string; takenAt: string; latitude: number | null; longitude: number | null;
          }[];
          if (!Array.isArray(photosMeta) || photosMeta.length > 20) throw new DomainError('invalid_input', 422);
          const photos = [];
          for (const meta of photosMeta) {
            if (typeof meta.id !== 'string' || !UUID.test(meta.id)) throw new DomainError('invalid_input', 422);
            const file = form.get(`photo:${meta.id}`);
            if (!(file instanceof File)) throw new DomainError('invalid_input', 422);
            if (file.size > MAX_PHOTO) throw new DomainError('file_too_large', 422);
            const mediaType = ALLOWED_IMAGE_TYPES.has(file.type) ? file.type : 'image/jpeg';
            const key = `org/${actor.orgId}/photos/${meta.id}`;
            await runtime().storage.put(key, new Uint8Array(await file.arrayBuffer()), mediaType);
            photos.push({
              id: meta.id, storageKey: key, mediaType, sizeBytes: file.size, latitude: meta.latitude, longitude: meta.longitude, takenAt: meta.takenAt,
            });
          }
          let audio: { storageKey: string; mediaType: string; sizeBytes: number } | null = null;
          const audioFile = form.get('audio');
          if (audioFile instanceof File && audioFile.size > 0) {
            if (audioFile.size > MAX_AUDIO) throw new DomainError('file_too_large', 422);
            const mediaType = (audioFile.type || 'audio/webm').split(';')[0]!.toLowerCase();
            if (!/^audio\/[a-z0-9.+-]+$/u.test(mediaType)) throw new DomainError('unsupported_file', 422);
            const key = `org/${actor.orgId}/audio/${String(report.id)}`;
            await runtime().storage.put(key, new Uint8Array(await audioFile.arrayBuffer()), mediaType);
            audio = { storageKey: key, mediaType, sizeBytes: audioFile.size };
          }
          const result = await submitReport(runtime().db, actor, { ...report, photos, audio });
          if (result.hasAudio) void transcribeLater(actor, result.id, audio!);
          return Response.json(result, { status: result.created ? 201 : 200 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});

/** Transcribes a voice note after the answer is sent (never blocks the field app). */
async function transcribeLater(actor: Actor, reportId: string, audio: { storageKey: string; mediaType: string }) {
  const { db, storage, transcriber } = runtime();
  if (!transcriber.configured) return;
  try {
    const file = await storage.get(audio.storageKey);
    if (!file) throw new Error('audio missing');
    const { locale } = await getSettings(db, actor);
    const text = await transcriber.transcribe({ body: file.body, mediaType: audio.mediaType }, locale);
    await setReportTranscript(db, { ...actor, door: 'job' }, reportId, { status: 'done', text });
  } catch (error) {
    console.error('[transcribe]', error);
    await setReportTranscript(db, { ...actor, door: 'job' }, reportId, { status: 'failed' }).catch(() => undefined);
  }
}
