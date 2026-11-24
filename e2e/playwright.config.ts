// End-to-end simulation (spec 077): the real staging site, as visitors and the people of a test
// company would use it, on a computer, an iPhone and an Android phone, in light and dark. Every
// step leaves a screenshot (e2e/shots) for review.
//   E2E_BASE_URL=https://struo-staging.kete.digital E2E_PASSWORD=… npx playwright test -c e2e
// BROWSERSTACK=1 runs the same tests on BrowserStack's browsers (BROWSERSTACK_USERNAME/ACCESS_KEY).
import { defineConfig, devices } from '@playwright/test';

const base = process.env.E2E_BASE_URL ?? 'https://struo-staging.kete.digital';
const common = { baseURL: base, locale: 'fr-FR', timezoneId: 'Africa/Abidjan', trace: 'retain-on-failure' as const, screenshot: 'only-on-failure' as const };

const browserstack = (name: string, caps: Record<string, unknown>) => ({
  name,
  use: {
    ...common,
    connectOptions: {
      wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify({
        ...caps, 'browserstack.username': process.env.BROWSERSTACK_USERNAME, 'browserstack.accessKey': process.env.BROWSERSTACK_ACCESS_KEY,
        project: 'Struo', build: `struo-e2e-${new Date().toISOString().slice(0, 16)}`, name, 'browserstack.console': 'errors',
      }))}`,
    },
  },
});

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  projects: process.env.BROWSERSTACK
    ? [
        browserstack('bs-safari-macos', { browser: 'playwright-webkit', os: 'osx', os_version: 'Sonoma' }),
        browserstack('bs-edge-windows', { browser: 'edge', os: 'Windows', os_version: '11' }),
        browserstack('bs-firefox-windows', { browser: 'playwright-firefox', os: 'Windows', os_version: '11' }),
      ]
    : [
        { name: 'desktop', use: { ...devices['Desktop Chrome'], ...common, viewport: { width: 1440, height: 900 } } },
        { name: 'desktop-dark', use: { ...devices['Desktop Chrome'], ...common, viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }, grep: /@visual/ },
        { name: 'iphone', use: { ...devices['iPhone 13'], ...common } },
        { name: 'android', use: { ...devices['Pixel 7'], ...common } },
      ],
});
