// Real product screens for the website (spec 079): the demo company of each role, on a computer and
// a phone, captured as they are. Run on demand only (CAPTURE=1); kept in e2e/shots/<device>/cap-*.png.
import { test, type Page } from '@playwright/test';
import { isMobile, shot } from './helpers.ts';

test.skip(!process.env.CAPTURE, 'captures run on demand (CAPTURE=1)');

/** Opens the demo of a role (its own private copy) and hides the demo banner for a clean screen. */
async function openDemo(page: Page, role: string) {
  await page.goto(`/api/demo/start?role=${role}`);
  await page.waitForLoadState('networkidle');
  if (page.url().includes('error=')) throw new Error(`demo refused: ${page.url()}`);
  await page.addStyleTag({ content: '.demo-bar{display:none!important} .push-prompt{display:none!important}' });
}

async function capture(page: Page, info: Parameters<typeof shot>[1], path: string, name: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.addStyleTag({ content: '.demo-bar{display:none!important} .push-prompt{display:none!important}' });
  await page.waitForTimeout(1500);
  await shot(page, info, `cap-${name}`);
}

test('owner screens', async ({ page }, info) => {
  test.skip(isMobile(info), 'office screens on a computer');
  await openDemo(page, 'owner');
  await capture(page, info, '/app', 'owner-today');
  await capture(page, info, '/app/finance', 'owner-finance');
  await capture(page, info, '/app/indicators', 'owner-indicators');
  await capture(page, info, '/app/projects', 'owner-sites');
  await capture(page, info, '/app/documents', 'owner-documents');
});

test('engineer screens', async ({ page }, info) => {
  test.skip(isMobile(info), 'office screens on a computer');
  await openDemo(page, 'engineer');
  await capture(page, info, '/app/field', 'engineer-field');
  await capture(page, info, '/app/planning', 'engineer-planning');
});

test('accountant screens', async ({ page }, info) => {
  test.skip(isMobile(info), 'office screens on a computer');
  await openDemo(page, 'accountant');
  await capture(page, info, '/app/finance', 'accountant-finance');
});

test('site lead on the phone', async ({ page }, info) => {
  test.skip(!isMobile(info), 'the field app on a phone');
  await openDemo(page, 'site_lead');
  await page.waitForTimeout(3000);
  await shot(page, info, 'cap-field-home');
  await page.locator('.field-tabs button').filter({ hasText: 'Bureau' }).click().catch(() => undefined);
  await page.waitForTimeout(1500);
  await shot(page, info, 'cap-field-office');
});

test('client on the phone', async ({ page }, info) => {
  test.skip(!isMobile(info), 'the client space on a phone');
  await openDemo(page, 'client');
  await page.waitForTimeout(2500);
  await shot(page, info, 'cap-client-home');
});
