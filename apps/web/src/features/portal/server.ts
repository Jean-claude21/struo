import * as core from '@struo/core';
import { createServerFn } from '@tanstack/react-start';
import { getCookie, setCookie } from '@tanstack/react-start/server';
import { translate } from '@/i18n/index.tsx';
import { guarded } from '@/server/context.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const tokenOf = (input: unknown) => {
  const token = (input as { token?: unknown })?.token;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/u.test(token)) throw new Error('portal_link_invalid');
  return token;
};

/** The device cookie of a link (httpOnly, per link, scoped to the portal). */
const deviceCookie = (token: string) => `struo_pd_${core.hashToken(token).slice(0, 16)}`;

async function access(token: string) {
  const result = await core.portalAccess(runtime().db, token, getCookie(deviceCookie(token)) ?? null);
  if (!result) throw new core.DomainError('portal_link_invalid', 404);
  return result;
}

/**
 * The client's space. Before the device is confirmed by an e-mail code, only the gate (company,
 * project name, masked address) is returned; afterwards, what the link allows.
 */
export const getPortal = createServerFn({ method: 'GET' })
  .validator((input: { token: string }) => ({ token: tokenOf(input) }))
  .handler(({ data }) =>
    guarded(async () => {
      const { db } = runtime();
      const link = await core.portalAccess(db, data.token, getCookie(deviceCookie(data.token)) ?? null);
      if (!link) return null;
      const view = await core.portalView(db, data.token);
      if (!view) return null;
      if (link.requireCode && !link.verified) {
        return {
          gate: true as const,
          company: view.company,
          project: { name: view.project.name, location: view.project.location },
          contactName: link.contactName,
          maskedEmail: link.contactEmail ? core.maskEmail(link.contactEmail) : null,
        };
      }
      const reports = link.show.photos ? await core.portalReports(db, data.token) : [];
      // Spec 048: the change orders sent to the client, to accept or refuse.
      const changeOrders = link.show.finance ? await core.portalChangeOrders(db, data.token) : [];
      // Spec 049: the reports the company sent.
      const clientReports = await core.portalClientReports(runtime().owner, data.token);
      return {
        gate: false as const,
        show: link.show,
        contactName: link.contactName,
        view: {
          ...view,
          photos: link.show.photos ? view.photos : [],
          milestones: link.show.planning ? view.milestones : [],
          invoices: link.show.finance ? view.invoices : [],
          documents: link.show.documents ? view.documents : [],
          messages: link.show.messages ? view.messages : [],
        },
        reports,
        changeOrders,
        clientReports,
      };
    }),
  );

/** Sends a one-time code to the link's e-mail address. In test environments without mail, the code is shown. */
export const portalRequestCode = createServerFn({ method: 'POST' })
  .validator((input: { token: string }) => ({ token: tokenOf(input) }))
  .handler(({ data }) =>
    guarded(async () => {
      const { db, mailer, env } = runtime();
      const view = await core.portalView(db, data.token);
      if (!view) throw new core.DomainError('portal_link_invalid', 404);
      const { email, code } = await core.portalIssueCode(db, data.token);
      const locale = view.company.locale;
      await mailer.send({
        to: email,
        subject: translate(locale, 'clientPortal.codeSubject', { code, company: view.company.name }),
        text: translate(locale, 'clientPortal.codeBody', { code, company: view.company.name, project: view.project.name }),
      });
      return { maskedEmail: core.maskEmail(email), testCode: !mailer.configured && env.PAYMENTS_SIMULATOR ? code : null };
    }),
  );

export const portalVerifyCode = createServerFn({ method: 'POST' })
  .validator((input: { token: string; code: string }) => ({ token: tokenOf(input), code: String(input.code ?? '') }))
  .handler(({ data }) =>
    guarded(async () => {
      const device = await core.portalVerifyCode(runtime().db, data.token, data.code);
      if (!device) throw new core.DomainError('portal_code_invalid', 422);
      setCookie(deviceCookie(data.token), device, {
        path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, secure: runtime().env.APP_BASE_URL.startsWith('https://'),
      });
      return { ok: true };
    }),
  );

/** Spec 049: one client report, in the company's look (only on a confirmed device). */
export const getPortalReport = createServerFn({ method: 'GET' })
  .validator((input: { token: string; id: string }) => ({ token: tokenOf(input), id: String(input.id) }))
  .handler(({ data }) =>
    guarded(async () => {
      const link = await access(data.token);
      if (link.requireCode && !link.verified) return { locked: true as const };
      const report = await core.portalClientReport(runtime().owner, data.token, data.id);
      return report ? { report, orgId: link.orgId } : { missing: true as const };
    }),
  );

export const portalDecideChange = createServerFn({ method: 'POST' })
  .validator((input: { token: string; id: string; accept: boolean; signer: string }) => ({ token: tokenOf(input), id: String(input.id), accept: Boolean(input.accept), signer: String(input.signer) }))
  .handler(({ data }) =>
    guarded(async () => {
      const link = await access(data.token);
      if (!link.verified || !link.show.finance) throw new core.DomainError('forbidden', 403);
      return core.portalDecideChangeOrder(runtime().db, data.token, data);
    }),
  );

export const portalMessage = createServerFn({ method: 'POST' })
  .validator((input: { token: string; body: string }) => ({ token: tokenOf(input), body: String(input.body) }))
  .handler(({ data }) =>
    guarded(async () => {
      const link = await access(data.token);
      if (!link.verified || !link.show.messages) throw new core.DomainError('forbidden', 403);
      return core.portalPostMessage(runtime().db, data.token, data.body);
    }),
  );

