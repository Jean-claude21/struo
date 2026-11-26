// Real e-mails, read in a testmail.app inbox: the owner invites someone, who receives the invitation,
// creates an account, confirms the address, forgets the password and sets a new one. Each step waits
// for the actual message and follows the link it holds, like the person would.
// Needs TESTMAIL_API_KEY and TESTMAIL_NAMESPACE; runs once (desktop), skipped without them.
import { expect, test, type Page } from '@playwright/test';
import { shot, signIn } from './helpers.ts';

const KEY = process.env.TESTMAIL_API_KEY;
const NAMESPACE = process.env.TESTMAIL_NAMESPACE;

interface Mail { subject: string; html: string; text: string; to: string; timestamp: number }

/** Waits (at most 3 minutes) for the next message sent to this tag after `since`. */
async function nextMail(tag: string, since: number, subject: RegExp): Promise<Mail> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const url = new URL('https://api.testmail.app/api/json');
    url.search = new URLSearchParams({ apikey: KEY!, namespace: NAMESPACE!, tag, timestamp_from: String(since) }).toString();
    const answer = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (answer?.ok) {
      const body = (await answer.json()) as { emails?: Mail[] };
      const found = (body.emails ?? []).find((mail) => subject.test(mail.subject));
      if (found) return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  throw new Error(`no e-mail « ${subject} » for ${tag}`);
}

/** The first link of the message that matches. */
function linkIn(mail: Mail, pattern: RegExp): string {
  const links = [...mail.html.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]!.replace(/&amp;/gu, '&'));
  const link = links.find((href) => pattern.test(href));
  if (!link) throw new Error(`no link ${pattern} in « ${mail.subject} »`);
  return link;
}

async function removeFromTeam(page: Page, email: string) {
  await page.goto('/app/team');
  const row = page.locator('tr').filter({ hasText: email });
  if (await row.count()) {
    await row.locator('button.icon-btn').click();
    await expect(page.locator('tr').filter({ hasText: email })).toHaveCount(0, { timeout: 15_000 });
  }
}

test('invitation, sign-up, address check and forgotten password arrive by e-mail', async ({ page, browser }, info) => {
  test.skip(!KEY || !NAMESPACE, 'TESTMAIL_API_KEY / TESTMAIL_NAMESPACE not set');
  test.skip(info.project.name !== 'desktop', 'one run is enough: the e-mails do not depend on the screen');
  test.setTimeout(10 * 60_000);
  page.setDefaultTimeout(30_000);
  const tag = `e2e${Date.now()}`;
  const email = `${NAMESPACE}.${tag}@inbox.testmail.app`;
  const first = `E2E-${Math.random().toString(36).slice(2)}a1`;
  const second = `E2E-${Math.random().toString(36).slice(2)}b2`;

  // 1. The owner invites an accountant by e-mail.
  await signIn(page, 'owner');
  await page.goto('/app/team');
  let since = Date.now() - 5_000;
  const modal = page.locator('.modal[role="dialog"]');
  // The page may still be starting: click again until the window opens.
  await expect(async () => {
    if (!(await modal.isVisible())) await page.getByRole('button', { name: /Inviter quelqu/u }).click();
    await expect(modal).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await modal.getByRole('button', { name: /Comptable/u }).first().click();
  await modal.getByRole('button', { name: /^E-mail$/u }).click();
  await modal.locator('input[type="email"]').fill(email);
  await shot(page, info, '60-mail-invite');
  await modal.getByRole('button', { name: /^Inviter$/u }).click();
  await expect(page.locator('body')).toContainText(email);

  try {
    const invitation = await nextMail(tag, since, /Invitation à rejoindre/u);
    expect(invitation.subject).toContain('Interconnexion');
    const join = linkIn(invitation, /\/invite\//u);

    // 2. The guest opens the link and creates an account, then joins.
    const guestContext = await browser.newContext({ ...info.project.use });
    const guest = await guestContext.newPage();
    guest.setDefaultTimeout(30_000);
    await guest.goto(join);
    await guest.waitForLoadState('networkidle');
    await guest.getByRole('link', { name: /Créer un compte/u }).click();
    await guest.waitForLoadState('networkidle');
    since = Date.now() - 5_000;
    await guest.locator('input[name="name"]').fill('Testeur E2E');
    await guest.locator('input[name="email"]').fill(email);
    await guest.locator('input[name="password"]').fill(first);
    await guest.locator('form button.btn').first().click();
    await guest.waitForURL(/\/invite\//u, { timeout: 30_000 });
    await guest.getByRole('button', { name: /Rejoindre l’entreprise/u }).click();
    await guest.waitForURL(/\/app/u, { timeout: 30_000 });
    await shot(guest, info, '61-mail-joined');

    // 3. The sign-up sent the address check: its link confirms the address.
    const verify = await nextMail(tag, since, /Confirmez votre adresse/u);
    await guest.goto(linkIn(verify, /verify-email|token=/u));
    await guest.waitForLoadState('networkidle');
    await guestContext.close();

    // 4. Forgotten password: the link, a new password, the « changed » notice, signing in again.
    const lost = await browser.newContext({ ...info.project.use });
    const person = await lost.newPage();
    person.setDefaultTimeout(30_000);
    await person.goto('/forgot-password');
    await person.waitForLoadState('networkidle');
    since = Date.now() - 5_000;
    await person.locator('input[name="email"]').fill(email);
    await person.getByRole('button', { name: /Recevoir le lien/u }).click();
    const reset = await nextMail(tag, since, /Réinitialiser votre mot de passe/u);
    await person.goto(linkIn(reset, /reset-password/u));
    await person.waitForLoadState('networkidle');
    await person.locator('input[name="password"]').fill(second);
    since = Date.now() - 5_000;
    await person.getByRole('button', { name: /Enregistrer le mot de passe/u }).click();
    await nextMail(tag, since, /mot de passe Struo a été modifié/u);
    await person.goto('/login');
    await person.waitForLoadState('networkidle');
    await person.locator('input[name="email"]').fill(email);
    await person.locator('input[name="password"]').fill(second);
    await person.locator('form button.btn').first().click();
    await person.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
    await shot(person, info, '62-mail-new-password');
    await lost.close();
  } finally {
    // The test company keeps its seats: the guest leaves, or the invitation is withdrawn.
    await removeFromTeam(page, email);
    const pending = page.locator('.row').filter({ hasText: email });
    if (await pending.count()) await pending.locator('button.icon-btn').click();
  }
});
