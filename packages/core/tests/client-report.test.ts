import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMilestone, clientReport, createPortalLink, createProject, listClientReports, portalClientReport, portalClientReports, portalContact,
  saveClientReport, sealPortalToken, updateInvoiceSettings, weeklyReportTargets, type Actor,
} from '../src/index.ts';
import { addMember, createTestCompany, setupDatabase, today, type TestDb } from './helpers.ts';

let db: TestDb;
let owner: Actor;
let lead: Actor;
let projectId: string;
let token: string;
let linkId: string;
beforeAll(async () => {
  db = await setupDatabase();
  owner = await createTestCompany(db);
  await db.owner.query(`update org_settings set plan_code = 'pro' where org_id = $1`, [owner.orgId]);
  lead = await addMember(db, owner.orgId, 'site_lead');
  projectId = (await createProject(db.app, owner, { name: 'Villa rapport', status: 'active', budgetMinor: 5_000_000 })).id;
  await addMilestone(db.app, owner, { projectId, name: 'Toiture', plannedOn: today(20) });
  ({ token, id: linkId } = await createPortalLink(db.app, owner, projectId));
  await db.owner.query(`update portal_link set contact_email = 'client@example.test', contact_name = 'M. Client' where id = $1`, [linkId]);
});
afterAll(async () => db.close());

describe('client report (spec 049)', () => {
  it('is built from the site, in the company look, and never carries costs', async () => {
    await updateInvoiceSettings(db.app, owner, { reportIntro: 'Voici votre semaine.', reportShowChanges: false });
    const report = await clientReport(db.app, owner, projectId, { from: today(-7), to: today(0) });
    expect(report).toMatchObject({ intro: 'Voici votre semaine.', changes: null, project: { name: 'Villa rapport' } });
    expect(report.upcoming?.[0]?.name).toBe('Toiture');
    expect(JSON.stringify(report)).not.toMatch(/budget|spent|margin|expense/iu);
    await expect(clientReport(db.app, owner, projectId, { from: today(0), to: today(-3) })).rejects.toThrow();
  });
  it('reaches the client only once sent, through their own link', async () => {
    expect(await portalClientReports(db.owner, token)).toHaveLength(0);
    const { id } = await saveClientReport(db.app, owner, { projectId, from: today(-7), to: today(0), note: 'Dalle coulée.', sentTo: 'client@example.test' });
    expect((await listClientReports(db.app, owner, projectId))[0]).toMatchObject({ id, note: 'Dalle coulée.' });
    expect((await portalClientReports(db.owner, token)).map((row) => row.id)).toEqual([id]);
    expect((await portalClientReport(db.owner, token, id))?.note).toBe('Dalle coulée.');
    expect(await portalClientReport(db.owner, 'not-a-token', id)).toBeNull();
    await expect(saveClientReport(db.app, lead, { projectId, from: today(-7), to: today(0) })).rejects.toThrow();
  });
  it('keeps the link sealed for later messages, and lists the weekly targets', async () => {
    await sealPortalToken(db.app, owner, linkId, 'sealed-value');
    expect(await portalContact(db.app, owner, projectId)).toMatchObject({ contactEmail: 'client@example.test', tokenEnc: 'sealed-value' });
    expect((await weeklyReportTargets(db.owner)).some((row) => row.projectId === projectId)).toBe(false);
    await updateInvoiceSettings(db.app, owner, { reportWeekly: true });
    expect((await weeklyReportTargets(db.owner)).find((row) => row.projectId === projectId)).toMatchObject({ email: 'client@example.test', tokenEnc: 'sealed-value' });
  });
});
