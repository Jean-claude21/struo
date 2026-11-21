import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addDocument, clientReport, createPortalLink, createProject, getProject, listDocuments, portalFile, portalView, reviewReport, submitReport, type Actor,
} from '../src/index.ts';
import { createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let projectId: string;
let token: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  projectId = (await createProject(db.app, owner, { name: 'Villa confiance', status: 'active' })).id;
  ({ token } = await createPortalLink(db.app, owner, projectId));
});
afterAll(async () => db.close());

describe('what reaches the client (spec 050, step 0)', () => {
  it('shows a field photo to the client only once its report is validated', async () => {
    const phase = (await getProject(db.app, owner, projectId)).phases[0]!;
    const photoId = randomUUID();
    const report = {
      id: randomUUID(), projectId, phaseId: phase.id, progressPct: 20, note: 'Fouilles', takenAt: new Date().toISOString(),
      photos: [{ id: photoId, storageKey: `org/${owner.orgId}/c.jpg`, mediaType: 'image/jpeg', sizeBytes: 1000, takenAt: new Date().toISOString() }],
    };
    await submitReport(db.app, owner, report);
    expect((await portalView(db.app, token))?.photos).toHaveLength(0);
    expect(await portalFile(db.app, token, photoId)).toBeNull();
    expect((await clientReport(db.app, owner, projectId, { from: today(-7), to: today(0) })).photos).toHaveLength(0);
    await reviewReport(db.app, owner, report.id, { decision: 'validated' });
    expect((await portalView(db.app, token))?.photos.map((photo) => photo.id)).toEqual([photoId]);
    expect(await portalFile(db.app, token, photoId)).toMatchObject({ mediaType: 'image/jpeg' });
    await db.owner.query('update report_photo set shared_with_client = false where id = $1', [photoId]);
    expect((await clientReport(db.app, owner, projectId, { from: today(-7), to: today(0) })).photos).toHaveLength(0);
  });

  it('files a signed quote as a contract document, in order from the start', async () => {
    const { id } = await addDocument(db.app, owner, { projectId, title: 'Devis signé v3', family: 'contract' });
    const { id: typed } = await addDocument(db.app, owner, { projectId, title: 'Permis', docTypeId: null, status: 'missing' });
    const documents = await listDocuments(db.app, owner, { projectId });
    expect(documents.find((doc) => doc.id === id)).toMatchObject({ family: 'contract', status: 'valid' });
    expect(documents.find((doc) => doc.id === typed)?.status).toBe('missing');
  });
});
