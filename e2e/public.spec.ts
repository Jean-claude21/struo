// The visitor: landing, estimate in their currency, demo, trial, call-back form, legal pages.
import { expect, test } from '@playwright/test';
import { fitsWidth, isMobile, shot } from './helpers.ts';

test('the landing reads well and fits the screen @visual', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('aussi bien que vos ouvrages');
  await shot(page, info, '01-landing-top');
  await fitsWidth(page);
  for (const id of ['probleme', 'calcul', 'piliers', 'equipe', 'offre', 'preuve', 'tarifs', 'questions', 'rappel']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await shot(page, info, `02-landing-${id}`);
  }
  // A phone's full page is taller than a screenshot can be: the sections above already show it.
  if (!isMobile(info)) await shot(page, info, '03-landing-full', true);
  expect(errors, 'JavaScript errors on the landing').toEqual([]);
});

test('the estimate follows the country chosen', async ({ page }, info) => {
  await page.goto('/#calcul');
  const select = page.locator('select.ed-country');
  await expect(select).toBeVisible();
  await select.selectOption('TG');
  await expect(page.locator('.ed-calc-result')).toContainText(/F\s?CFA|XOF/u);
  await shot(page, info, '04-estimate-xof');
  await select.selectOption('FR');
  await expect(page.locator('.ed-calc-result')).toContainText('€');
});

test('the main actions lead somewhere', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a[href="/signup"]').first()).toBeVisible();
  await expect(page.locator('a[href="#rappel"]').first()).toBeVisible();
  await expect(page.locator('a[href="/api/demo/start?role=owner"]')).toHaveCount(1);
  await page.goto('/demo');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).toContainText(/démo|Démo/u);
  for (const path of ['/signup', '/login']) {
    const response = await page.goto(path, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
  }
});

test('the call-back form asks only the name and a way to reach', async ({ page }, info) => {
  await page.goto('/#rappel');
  const form = page.locator('#rappel form');
  await expect(form.locator('label i')).toHaveCount(2);
  await form.locator('input[name="name"]').fill('Test automatique (E2E)');
  await form.locator('input[name="reach"]').fill(`e2e-${Date.now()}@interco.struo.test`);
  await shot(page, info, '05-callback-filled');
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('#rappel .h-sent')).toBeVisible();
  await shot(page, info, '06-callback-sent');
});

test('the legal pages open and fit @visual', async ({ page }, info) => {
  for (const path of ['/mentions-legales', '/confidentialite', '/cookies', '/conditions', '/traitement-donnees']) {
    await page.goto(path);
    await expect(page.locator('.ed-doc-hero h1')).toBeVisible();
    await expect(page.locator('body')).toContainText('contact@kete.digital');
    await fitsWidth(page);
  }
  await page.goto('/confidentialite');
  await shot(page, info, '07-legal-privacy');
});

test('the office installs like an app, in the person's language', async ({ request }) => {
  const fr = await (await request.get('/api/app/manifest', { headers: { 'accept-language': 'fr-FR' } })).json() as { start_url: string; display: string; lang: string; icons: unknown[] };
  expect(fr).toMatchObject({ start_url: '/app', display: 'standalone', lang: 'fr' });
  expect(fr.icons.length).toBeGreaterThan(1);
  const en = await (await request.get('/api/app/manifest', { headers: { 'accept-language': 'en-GB' } })).json() as { lang: string };
  expect(en.lang).toBe('en');
  expect((await request.get('/offline.html')).status()).toBe(200);
});
