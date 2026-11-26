// The people of a company, on staging's test company: the office, the field (offline then back
// online), the bell, the accountant, the client.
import { expect, test } from '@playwright/test';
import { fitsWidth, isMobile, shot, signIn } from './helpers.ts';

test('the owner opens the office, the bell and their notification choices', async ({ page }, info) => {
  await signIn(page, 'owner');
  await expect(page).toHaveURL(/\/app/u);
  await shot(page, info, '10-owner-today');
  await fitsWidth(page);
  const bell = page.locator('.notice-bell > button');
  await expect(bell).toBeVisible();
  // The page may still be starting: click again until the panel opens.
  await expect(async () => {
    if (!(await page.locator('.notice-panel').isVisible())) await bell.click();
    await expect(page.locator('.notice-panel')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await shot(page, info, '11-owner-bell');
  await page.goto('/app/account#notifications');
  await expect(page.locator('table.notice-prefs')).toBeVisible();
  await shot(page, info, '12-owner-notification-choices');
});

test('the site lead works offline, and it all leaves when the network is back', async ({ page, context }, info) => {
  test.skip(!isMobile(info), 'the field app is used on a phone');
  await signIn(page, 'site_lead');
  await page.goto('/field');
  await expect(page.locator('.field-header')).toContainText('Bonjour Chef', { timeout: 30_000 });
  await shot(page, info, '20-field-home');
  await fitsWidth(page);
  await page.locator('.field-tabs button').filter({ hasText: 'Bureau' }).click();
  await context.setOffline(true);
  await expect(page.locator('.sync-pill')).toContainText(/réseau|Hors|attente/iu);
  const item = `Ciment E2E ${Date.now()}`;
  await page.getByRole('button', { name: /Demander du matériel/u }).click();
  await page.locator('input[name="item"]').fill(item);
  await page.locator('input[name="quantity"]').fill('20 sacs');
  await page.getByRole('button', { name: /Envoyer la demande/u }).click();
  await expect(page.locator('body')).toContainText(item);
  await shot(page, info, '21-field-offline-waiting');
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.sync-pill')).not.toContainText(/attente|Hors/iu, { timeout: 45_000 });
  await shot(page, info, '22-field-back-online-sent');
  // The office was told: the request is in the owner's bell.
  const owner = await context.browser()!.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
  const office = await owner.newPage();
  await signIn(office, 'owner');
  const notices = await office.evaluate(async () => (await (await fetch('/api/notifications')).json()) as { items: { kind: string; body: string | null }[] });
  expect(notices.items.some((notice) => notice.kind === 'material' && (notice.body ?? '').includes('Ciment E2E'))).toBe(true);
  await owner.close();
});

test('the engineer sees the reports to review', async ({ page }, info) => {
  await signIn(page, 'engineer');
  await page.goto('/app/field');
  await expect(page.locator('main')).toBeVisible();
  await shot(page, info, '30-engineer-field-office');
  await fitsWidth(page);
});

test('the accountant opens the books, and is kept out of the field reports', async ({ page }, info) => {
  await signIn(page, 'accountant');
  await page.goto('/app/finance');
  await expect(page).toHaveURL(/\/app\/finance/u);
  await shot(page, info, '40-accountant-finance');
  await fitsWidth(page);
  // The app sends the accountant away at once: that redirect may interrupt the navigation itself.
  await page.goto('/app/field').catch((error: Error) => { if (!/interrupted by another navigation/u.test(error.message)) throw error; });
  await expect(page).not.toHaveURL(/\/app\/field$/u);
});

test('the client opens their space', async ({ page }, info) => {
  const url = process.env.E2E_PORTAL_URL;
  test.skip(!url, 'E2E_PORTAL_URL is not set');
  await page.goto(url!);
  await expect(page.locator('body')).toContainText('Villa Interconnexion');
  await shot(page, info, '50-client-home');
  await fitsWidth(page);
});
