import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { productHealth, type Actor } from '../src/index.ts';
import { createTestCompany, setupDatabase, type TestDb } from './helpers.ts';

let db: TestDb;
let real: Actor;
let demo: Actor;
beforeAll(async () => {
  db = await setupDatabase();
  real = await createTestCompany(db, 'Entreprise Réelle');
  demo = await createTestCompany(db, 'Démo');
  await db.owner.query('update org_settings set is_demo = true where org_id = $1', [demo.orgId]);
});
afterAll(async () => db.close());

describe('product health (spec 041)', () => {
  it('counts real companies only and gives twelve weeks of the north-star figure', async () => {
    const before = await productHealth(db.owner);
    await db.owner.query('update org_settings set is_demo = false where org_id = $1', [demo.orgId]);
    const withDemo = await productHealth(db.owner);
    expect(withDemo.conversion.companies).toBe(before.conversion.companies + 1);
    await db.owner.query('update org_settings set is_demo = true where org_id = $1', [demo.orgId]);
    expect(before.weeks).toHaveLength(12);
    expect(before.cohortSize).toBeGreaterThanOrEqual(1);
    expect(before.activation.firstReport48hPct).not.toBeUndefined();
    expect(real.orgId).toBeTruthy();
  });
});
