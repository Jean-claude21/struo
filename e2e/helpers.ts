import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';

/** The staging test company (fictional, « Interconnexion Test SARL »): one account per role. */
export const ACCOUNTS = {
  owner: 'gerante@interco.struo.test',
  engineer: 'ingenieur@interco.struo.test',
  site_lead: 'chef@interco.struo.test',
  accountant: 'comptable@interco.struo.test',
} as const;

export const password = () => {
  const value = process.env.E2E_PASSWORD;
  if (!value) throw new Error('E2E_PASSWORD is not set');
  return value;
};

/** A screenshot named after the step, per device: e2e/shots/<device>/<name>.png. */
export async function shot(page: Page, info: TestInfo, name: string, fullPage = false) {
  const dir = path.join(import.meta.dirname, 'shots', info.project.name);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage });
}

export async function signIn(page: Page, role: keyof typeof ACCOUNTS) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(ACCOUNTS[role]);
  await page.locator('input[name="password"]').fill(password());
  await page.locator('form button.btn').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

/** No horizontal scroll on the page: the layout fits the screen. */
export async function fitsWidth(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(1);
}

export const isMobile = (info: TestInfo) => info.project.name.includes('iphone') || info.project.name.includes('android');
