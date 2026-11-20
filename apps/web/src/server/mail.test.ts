import { describe, expect, it } from 'vitest';
import { invitationMail, localeOfRequest, renderMail } from './mail.server.ts';

describe('account e-mails (spec 040)', () => {
  it('renders HTML and text, escapes what people typed, and keeps the link readable', () => {
    const { html, text } = renderMail('fr', {
      preheader: 'Aperçu', title: 'Bonjour <b>Ama</b>', paragraphs: ['Texte & suite'],
      button: { label: 'Ouvrir', url: 'https://struo.example/reset?token=a"b' }, footnote: 'Ignorez sinon.',
    }, 'https://struo.example');
    expect(html).toContain('Bonjour &lt;b&gt;Ama&lt;/b&gt;');
    expect(html).toContain('Texte &amp; suite');
    expect(html).toContain('token=a&quot;b');
    expect(text).toContain('Ouvrir : https://struo.example/reset?token=a"b');
    expect(text).toContain('L’équipe Struo');
  });

  it('writes the invitation with who invites, the role and the expiry, in the right language', () => {
    const fr = invitationMail('fr', { to: 'kossi@example.test', org: 'Kekeli', inviter: 'Ama', role: 'site_lead', url: 'https://x/invite/1' }, 'https://x');
    expect(fr.subject).toBe('Invitation à rejoindre Kekeli sur Struo');
    expect(fr.text).toContain('Ama vous invite à rejoindre Kekeli en tant que');
    expect(fr.text).toContain('7 jours');
    const en = invitationMail('en', { to: 'kossi@example.test', org: 'Kekeli', inviter: 'Ama', role: 'engineer', url: 'https://x/invite/1' }, 'https://x');
    expect(en.subject).toBe('Invitation to join Kekeli on Struo');
  });

  it('takes the language from the cookie, then from the browser', () => {
    expect(localeOfRequest(new Request('https://x', { headers: { cookie: 'struo_lang=en' } }))).toBe('en');
    expect(localeOfRequest(new Request('https://x', { headers: { 'accept-language': 'en-GB,en;q=0.9' } }))).toBe('en');
    expect(localeOfRequest(undefined)).toBe('fr');
  });
});

describe('reserved test domains (spec 041)', () => {
  it('recognises addresses that cannot exist', async () => {
    const { RESERVED_DOMAIN } = await import('./adapters.server.ts');
    for (const address of ['komi@struo.test', 'a@example.com', 'x@foo.example', 'b@site.invalid', 'c@localhost']) expect(RESERVED_DOMAIN.test(address)).toBe(true);
    for (const address of ['ama@gmail.com', 'chef@kekeli.tg', 'x@testing.com', 'y@mytest.org']) expect(RESERVED_DOMAIN.test(address)).toBe(false);
  });
});
