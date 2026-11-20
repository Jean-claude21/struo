// Account and team e-mails (spec 040): one branded layout, in HTML and in plain text, in the
// person's language. Every message says why it was sent and what to do if it was not expected.
import type { MailMessage } from '@struo/core';
import { LOCALE_COOKIE, translate, type Locale } from '@/i18n/index.tsx';

export interface MailContent {
  /** Short line shown by mail apps next to the subject. */
  preheader: string;
  title: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Small print under the button: expiry, « not you? ». */
  footnote?: string;
}

const escape = (value: string) => value.replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

/** Builds the HTML and text versions of a message. */
export function renderMail(locale: Locale, content: MailContent, appUrl: string): { html: string; text: string } {
  const button = content.button
    ? `<tr><td style="padding:8px 0 24px"><a href="${escape(content.button.url)}" style="display:inline-block;background:#b9461e;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:6px">${escape(content.button.label)}</a></td></tr>
       <tr><td style="font-size:12px;color:#515c52;padding-bottom:16px">${escape(translate(locale, 'mail.linkFallback'))}<br><a href="${escape(content.button.url)}" style="color:#515c52;word-break:break-all">${escape(content.button.url)}</a></td></tr>`
    : '';
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(content.title)}</title></head>
<body style="margin:0;background:#f8f7f1;font-family:'DM Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#202820">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(content.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f1;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 14px;font-weight:800;font-size:22px;letter-spacing:-1px;color:#202820"><span style="display:inline-block;width:22px;height:22px;background:#d94d20;border-radius:6px;margin-right:8px;vertical-align:-4px"></span>Struo</td></tr>
<tr><td style="background:#ffffff;border-radius:10px;padding:28px 26px;border:1px solid #d7d9d0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font-size:24px;font-weight:700;line-height:1.2;letter-spacing:-.5px;padding-bottom:14px">${escape(content.title)}</td></tr>
${content.paragraphs.map((paragraph) => `<tr><td style="font-size:15px;line-height:1.6;padding-bottom:14px">${escape(paragraph)}</td></tr>`).join('')}
${button}
${content.footnote ? `<tr><td style="font-size:13px;line-height:1.5;color:#515c52;border-top:1px solid #e7e8e0;padding-top:14px">${escape(content.footnote)}</td></tr>` : ''}
</table></td></tr>
<tr><td style="font-size:12px;color:#515c52;padding:16px 4px;line-height:1.5">${escape(translate(locale, 'mail.signature'))} · <a href="${escape(appUrl)}" style="color:#515c52">${escape(appUrl.replace(/^https?:\/\//u, ''))}</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    content.title, '',
    ...content.paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(content.button ? [`${content.button.label} : ${content.button.url}`, ''] : []),
    ...(content.footnote ? [content.footnote, ''] : []),
    `— ${translate(locale, 'mail.signature')} · ${appUrl}`,
  ].join('\n');
  return { html, text };
}

/** A complete message, ready for the mailer. */
export function mailMessage(locale: Locale, to: string, subject: string, content: MailContent, appUrl: string): MailMessage {
  return { to, subject, ...renderMail(locale, content, appUrl) };
}

/** The language of a request: the language cookie, then Accept-Language, then French. */
export function localeOfRequest(request?: Request): Locale {
  const cookie = request?.headers.get('cookie') ?? '';
  const chosen = cookie.match(new RegExp(`${LOCALE_COOKIE}=(fr|en)`, 'u'))?.[1];
  if (chosen === 'fr' || chosen === 'en') return chosen;
  const accept = request?.headers.get('accept-language') ?? '';
  return /^en/iu.test(accept.trim()) ? 'en' : 'fr';
}

/** The invitation to join a company (team page, assistant, MCP): who invites, which role, until when. */
export function invitationMail(locale: Locale, input: { to: string; org: string; inviter: string; role: string; url: string }, appUrl: string): MailMessage {
  const role = translate(locale, `roles.${input.role}`);
  return mailMessage(locale, input.to, translate(locale, 'mail.invite.subject', { org: input.org }), {
    preheader: translate(locale, 'mail.invite.preheader', { inviter: input.inviter, org: input.org }),
    title: translate(locale, 'mail.invite.title', { org: input.org }),
    paragraphs: [translate(locale, 'mail.invite.body', { inviter: input.inviter, org: input.org, role }), translate(locale, 'mail.invite.what')],
    button: { label: translate(locale, 'mail.invite.button'), url: input.url },
    footnote: translate(locale, 'mail.invite.footnote', { email: input.to }),
  }, appUrl);
}
