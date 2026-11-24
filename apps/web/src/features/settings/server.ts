import * as core from '@struo/core';
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { createServerFn } from '@tanstack/react-start';
import { translate } from '@/i18n/index.tsx';
import { monerooGateway, simulatorGateway } from '@/server/adapters.server.ts';
import { applyLicenceKey } from '@/server/licence.server.ts';
import { invitationMail, mailMessage } from '@/server/mail.server.ts';
import { chooseCompany, guarded, loadViewer, requestCountry, requestLocale, requireActor, requirePlatformAdmin } from '@/server/context.server.ts';
import { COUNTRIES } from './countries.ts';
import { outboundAllowed } from '@/server/demo.server.ts';
import { reportError } from '@/server/monitor.server.ts';
import { runtime } from '@/server/runtime.server.ts';

const act = <T>(work: (actor: core.Actor) => Promise<T>, permission?: core.Permission) =>
  guarded(async () => work(await requireActor(permission)));

// ---------------------------------------------------------------- onboarding and invitations

export const createCompany = createServerFn({ method: 'POST' })
  .validator((input: Record<string, unknown>) => input)
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await loadViewer();
      if (!viewer) throw new core.DomainError('not_signed_in', 401);
      const { internal, ...input } = data as Record<string, unknown> & { internal?: boolean };
      const { orgId } = await core.createCompany(runtime().db, viewer.userId, input);
      // Spec 074: a platform admin creating a company from the console makes an internal one (tests).
      if (internal && viewer.platformAdmin) await core.setCompanyInternal(runtime().owner, viewer.userId, orgId, true);
      else await core.recordPlatformEvent(runtime().owner, { kind: 'signup', orgId });
      chooseCompany(orgId);
      return { orgId };
    }),
  );

export const readInvitation = createServerFn({ method: 'GET' })
  .validator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await loadViewer();
      if (!viewer) return { signedIn: false as const, invitation: null };
      return { signedIn: true as const, invitation: await core.readInvitation(runtime().db, viewer.userId, data.id), email: viewer.email };
    }),
  );

export const acceptInvitation = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await loadViewer();
      if (!viewer) throw new core.DomainError('not_signed_in', 401);
      const { orgId } = await core.acceptInvitation(runtime().db, viewer.userId, data.id);
      chooseCompany(orgId);
      return { orgId };
    }),
  );

// ---------------------------------------------------------------- settings page

export const getSettingsPage = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { db, env } = runtime();
    const [settings, configuration, members, invitations, keys, subscription, connections, subscriptionPayments] = await Promise.all([
      core.getSettings(db, actor),
      core.getConfiguration(db, actor),
      core.listMembers(db, actor),
      core.can(actor.role, 'members.manage') ? core.listInvitations(db, actor) : Promise.resolve([]),
      core.can(actor.role, 'apikeys.manage') ? core.listApiKeys(db, actor) : Promise.resolve([]),
      core.getSubscription(db, actor),
      core.listMcpConnections(db, actor),
      core.listSubscriptionPayments(db, actor),
    ]);
    // Spec 045: plans priced in the company's own currency.
    const plans = await core.listPlansIn(db, settings.currencyCode);
    const journal = core.can(actor.role, 'org.manage') ? await core.recentActivity(db, actor, 200) : [];
    return {
      role: actor.role, userId: actor.userId, settings, configuration, members, invitations, keys, subscription, connections, subscriptionPayments, plans, journal,
      platformPayment: platformGatewayCode(),
      baseUrl: env.APP_BASE_URL, orgId: actor.orgId, simulatorAvailable: env.PAYMENTS_SIMULATOR,
    };
  }),
);

export const updateSettings = createServerFn({ method: 'POST' })
  .validator((input: Record<string, unknown>) => input)
  .handler(({ data }) => act((actor) => core.updateSettings(runtime().db, actor, data)));

export const addConfigurationItem = createServerFn({ method: 'POST' })
  .validator((input: Record<string, unknown>) => input)
  .handler(({ data }) => act((actor) => core.addConfigurationItem(runtime().db, actor, data)));

/** The trade configuration of the company just created (onboarding step 2). */
export const getConfiguration = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => core.getConfiguration(runtime().db, actor)),
);

export const removeConfigurationItem = createServerFn({ method: 'POST' })
  .validator((input: { kind: 'projectType' | 'phase' | 'docType'; id: string }) => input)
  .handler(({ data }) => act((actor) => core.removeConfigurationItem(runtime().db, actor, data.kind, data.id)));

export const inviteMember = createServerFn({ method: 'POST' })
  .validator((input: { email: string; role: string }) => input)
  .handler(({ data }) =>
    act(async (actor) => {
      const { db, mailer, env } = runtime();
      const invitation = await core.inviteMember(db, actor, data);
      const settings = await core.getSettings(db, actor);
      const url = `${env.APP_BASE_URL}/invite/${invitation.id}`;
      const locale = settings.locale;
      const inviter = (await loadViewer())?.name ?? settings.name;
      if (await outboundAllowed(runtime(), actor.orgId)) await mailer
        .send(invitationMail(locale, { to: invitation.email, org: settings.name, inviter, role: data.role, url }, env.APP_BASE_URL))
        .catch((error: unknown) => console.error('[mail] invitation', error));
      return { url };
    }),
  );

/** The team page (spec 024): members with their last activity, pending invitations. */
export const getTeamPage = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { db, env } = runtime();
    const [members, invitations, settings, last] = await Promise.all([
      core.listMembers(db, actor),
      core.can(actor.role, 'members.manage') ? core.listInvitations(db, actor) : Promise.resolve([]),
      core.getSettings(db, actor),
      core.memberActivity(db, actor),
    ]);
    return {
      role: actor.role, userId: actor.userId, companyName: settings.name, baseUrl: env.APP_BASE_URL, invitations,
      members: members.map((member) => ({ ...member, lastActivity: last.get(member.userId) ?? null })),
    };
  }),
);

export const revokeInvitation = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(({ data }) => act((actor) => core.revokeInvitation(runtime().db, actor, data.id)));

export const setMemberRole = createServerFn({ method: 'POST' })
  .validator((input: { memberId: string; role: string }) => input)
  .handler(({ data }) => act((actor) => core.setMemberRole(runtime().db, actor, data.memberId, data.role)));

export const removeMember = createServerFn({ method: 'POST' })
  .validator((input: { memberId: string }) => input)
  .handler(({ data }) => act((actor) => core.removeMember(runtime().db, actor, data.memberId)));

export const createApiKey = createServerFn({ method: 'POST' })
  .validator((input: { name: string }) => input)
  .handler(({ data }) => act((actor) => core.createApiKey(runtime().db, actor, data.name)));

export const revokeApiKey = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(({ data }) => act((actor) => core.revokeApiKey(runtime().db, actor, data.id)));

// ---------------------------------------------------------------- public: plans, console

export const getPlans = createServerFn({ method: 'GET' }).handler(() =>
  guarded(async () => {
    // Spec 045: the public prices are those of the visitor's country currency, never converted.
    const { country, detected } = requestCountry();
    const currency = COUNTRIES[country]!.currency;
    // Spec 062: until the founder turns public prices on, every plan is « on quote ».
    const { db } = runtime();
    const [plans, pricesOn, trial] = await Promise.all([core.listPlansIn(db, currency), core.publicPrices(db), core.trialSettings(db)]);
    return { plans: pricesOn ? plans : plans.map((plan) => ({ ...plan, priceMinor: 0 })), pricesOn, trial, country, currency, detected, locale: requestLocale() };
  }),
);

export const getConsole = createServerFn({ method: 'GET' }).handler(() =>
  guarded(async () => {
    await requirePlatformAdmin();
    const { owner, db, env } = runtime();
    const [companies, plans, revenue, products, redemptions, journal] = await Promise.all([
      core.platformOverview(owner), core.listPlans(db), core.platformRevenue(owner), core.listLicenseProducts(owner),
      core.listAllRedemptions(owner), core.platformJournalList(owner)]);
    const [prices, leads] = await Promise.all([core.listPlanPrices(owner), core.listContactRequests(owner)]);
    const health = await core.productHealth(owner);
    // Spec 055: true money, who to call today, where companies stand, whether the platform runs,
    // the plans as edited, announcements and what users report.
    const [money, todo, onboarding, runs, editablePlans, announcements, feedback] = await Promise.all([
      core.founderMoney(owner), core.founderTodo(owner), core.onboardingSteps(owner), core.platformRuns(owner),
      core.listEditablePlans(owner), core.listAnnouncements(owner), core.listFeedback(owner)]);
    const [platformKeys, grants, oauthConnections, licenceSettings, publicPrices, pulses] = await Promise.all([core.listPlatformKeys(owner), core.featureGrants(owner), core.listPlatformMcpGrants(owner), core.licenceSettings(owner), core.publicPrices(owner), core.listStorePulses(owner)]);
    const [trial, demoLimit] = await Promise.all([core.trialSettings(owner), core.demoPerDay(owner)]);
    return { companies, plans, prices, leads, revenue, products, redemptions, journal, health, money, todo, onboarding, runs, editablePlans, announcements, feedback, platformKeys, grants, oauthConnections, licenceSettings, publicPrices, trial, demoLimit, pulses, pulseUrl: `${env.APP_BASE_URL}/api/payments/chariow`, pulseConfigured: Boolean(env.CHARIOW_PULSE_SECRET), mcpUrl: `${env.APP_BASE_URL}/mcp/platform`, sentryOn: Boolean(env.SENTRY_DSN), chariowConfigured: Boolean(env.CHARIOW_API_KEY), monitoring: { errors: Boolean(env.SENTRY_DSN), audience: Boolean(env.UMAMI_WEBSITE_ID) } };
  }),
);

/** Spec 072: how many demos one address may open per day (0: no limit), and lifting today's counts. */
export const saveDemoLimit = createServerFn({ method: 'POST' })
  .validator((input: { perDay: number }) => ({ perDay: Number(input.perDay) }))
  .handler(({ data }) => guarded(async () => {
    const viewer = await requirePlatformAdmin();
    return core.setDemoPerDay(runtime().owner, viewer.userId, data.perDay);
  }));

export const resetDemoLimits = createServerFn({ method: 'POST' }).handler(() => guarded(async () => {
  const viewer = await requirePlatformAdmin();
  return core.resetDemoLimits(runtime().owner, viewer.userId);
}));

/** Spec 072: the free trial's length and whether the public site offers it. */
export const saveTrialSettings = createServerFn({ method: 'POST' })
  .validator((input: { days: number; public: boolean }) => ({ days: Number(input.days), public: Boolean(input.public) }))
  .handler(({ data }) => guarded(async () => {
    const viewer = await requirePlatformAdmin();
    return core.setTrialSettings(runtime().owner, viewer.userId, data);
  }));

/** Spec 062: show the prices on the public site, or « on quote » for every plan. */
export const savePublicPrices = createServerFn({ method: 'POST' })
  .validator((input: { on: boolean }) => ({ on: Boolean(input.on) }))
  .handler(({ data }) => guarded(async () => {
    const viewer = await requirePlatformAdmin();
    return core.setPublicPrices(runtime().owner, viewer.userId, data.on);
  }));

/** Spec 060: how early companies are warned, and how long the grace period lasts. */
export const saveLicenceSettings = createServerFn({ method: 'POST' })
  .validator((input: { warnDays: number; graceDays: number }) => ({ warnDays: Number(input.warnDays), graceDays: Number(input.graceDays) }))
  .handler(({ data }) => guarded(async () => {
    const viewer = await requirePlatformAdmin();
    return core.setLicenceSettings(runtime().owner, viewer.userId, data);
  }));

// ---------------------------------------------------------------- checklists (spec 048)

export const getChecklistSettings = createServerFn({ method: 'GET' }).handler(() =>
  guarded(async () => {
    const actor = await requireActor();
    const { db } = runtime();
    const [templates, configuration] = await Promise.all([core.listChecklistTemplates(db, actor), core.getConfiguration(db, actor)]);
    return { templates, phaseNames: [...new Set((configuration.phases as { name: string }[]).map((phase) => phase.name))], canWrite: core.can(actor.role, 'projects.write') };
  }),
);

export const saveChecklistTemplate = createServerFn({ method: 'POST' })
  .validator((input: { id: string | null; template: Record<string, unknown> }) => input)
  .handler(({ data }) => guarded(async () => core.saveChecklistTemplate(runtime().db, await requireActor(), data.id, data.template)));

export const archiveChecklistTemplate = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(({ data }) => guarded(async () => core.archiveChecklistTemplate(runtime().db, await requireActor(), data.id)));

/** Spec 045: a prospect asks to be called back (public, no account). A filled honeypot is dropped. */
export const sendContactRequest = createServerFn({ method: 'POST' })
  .validator((input: { name: string; company?: string | null; reach: string; activeSites: number | null; message: string; website?: string }) => input)
  .handler(({ data }) =>
    guarded(async () => {
      if (data.website) return { ok: true };
      const { country } = requestCountry();
      const rt = runtime();
      const created = await core.createContactRequest(rt.owner, { ...data, countryCode: country, locale: requestLocale() });
      // Spec 062: the founder hears about every new request at once, not only in the console.
      if (created && rt.env.PLATFORM_ADMIN_EMAILS.length) {
        const line = (key: string, value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? null : `${translate('fr', key)} : ${value}`);
        await rt.mailer.send({
          to: rt.env.PLATFORM_ADMIN_EMAILS,
          subject: translate('fr', 'leadMail.subject', { name: data.name, company: data.company || '—' }),
          text: [translate('fr', 'leadMail.intro'), '',
            line('leadMail.name', data.name), line('leadMail.company', data.company), line('leadMail.reach', data.reach),
            line('leadMail.sites', data.activeSites), line('leadMail.country', country), line('leadMail.message', data.message), '',
            translate('fr', 'leadMail.open', { url: `${rt.env.APP_BASE_URL}/console` })].filter((item) => item !== null).join('\n'),
        }).catch((error: unknown) => reportError(error, { where: 'lead-mail' }));
      }
      return { ok: true };
    }),
  );

export const markContactHandled = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await requirePlatformAdmin();
      await core.markContactHandled(runtime().owner, data.id, viewer.userId);
      return { ok: true };
    }),
  );

/** Spec 045: the operator sets a plan's price in one currency (null removes it). */
export const setPlanPrice = createServerFn({ method: 'POST' })
  .validator((input: { planCode: string; currencyCode: string; priceMinor: number | null }) => input)
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await requirePlatformAdmin();
      await core.setPlanPrice(runtime().owner, data, viewer.userId);
      return { ok: true };
    }),
  );

export const setCompanyPlan = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; planCode: string }) => input)
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await requirePlatformAdmin();
      await core.setCompanyPlan(runtime().owner, data.orgId, data.planCode, viewer.userId);
      await core.recordPlatformGesture(runtime().owner, viewer.userId, 'plan.set', data.orgId, { planCode: data.planCode });
    }),
  );

// ---------------------------------------------------------------- console (spec 038)

export const getConsoleCompany = createServerFn({ method: 'GET' })
  .validator((input: { orgId: string }) => input)
  .handler(({ data }) => guarded(async () => {
    await requirePlatformAdmin();
    const { owner } = runtime();
    const [company, notes, steps, grants] = await Promise.all([core.platformCompany(owner, data.orgId), core.companyNotes(owner, data.orgId), core.onboardingSteps(owner, data.orgId), core.featureGrants(owner, data.orgId)]);
    return { ...company, notes, steps: steps[data.orgId] ?? null, grants };
  }));

// ---------------------------------------------------------------- the founder's console (spec 055)

export const addCompanyNote = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; body: string; nextOn?: string | null; done?: boolean }) => input)
  .handler(({ data }) => guarded(async () => {
    const viewer = await requirePlatformAdmin();
    if (data.done) await core.clearNoteReminders(runtime().owner, data.orgId);
    if (data.body?.trim()) await core.addCompanyNote(runtime().owner, viewer.userId, data);
  }));

export const previewPlan = createServerFn({ method: 'POST' })
  .validator((input: Record<string, unknown>) => input)
  .handler(({ data }) => guarded(async () => { await requirePlatformAdmin(); return core.planImpact(runtime().owner, data); }));

export const savePlan = createServerFn({ method: 'POST' })
  .validator((input: { plan: Record<string, unknown>; confirmCode?: string; note?: string | null }) => input)
  .handler(({ data }) => guarded(async () => {
    const viewer = await requirePlatformAdmin();
    return core.savePlan(runtime().owner, viewer.userId, data.plan, { confirmCode: data.confirmCode, note: data.note ?? null });
  }));

export const getPlanRevisions = createServerFn({ method: 'GET' })
  .validator((input: { code: string }) => input)
  .handler(({ data }) => guarded(async () => {
    await requirePlatformAdmin();
    return (await core.planRevisions(runtime().owner, data.code)).map(({ snapshot, ...rest }) => ({ ...rest, name: String(snapshot.name ?? '') }));
  }));

export const restorePlan = createServerFn({ method: 'POST' })
  .validator((input: { id: number; confirmCode?: string }) => input)
  .handler(({ data }) => guarded(async () => {
    const viewer = await requirePlatformAdmin();
    await core.restorePlanRevision(runtime().owner, viewer.userId, data.id, data.confirmCode);
  }));

export const createAnnouncement = createServerFn({ method: 'POST' })
  .validator((input: { title: string; body?: string | null; level?: 'info' | 'warning'; endsOn?: string | null; email?: boolean }) => input)
  .handler(({ data }) => guarded(async () => {
    const viewer = await requirePlatformAdmin();
    const rt = runtime();
    const { id } = await core.createAnnouncement(rt.owner, viewer.userId, data);
    let emailed = 0;
    if (data.email) {
      for (const recipient of (await core.announcementRecipients(rt.owner, id)) ?? []) {
        await rt.mailer.send(mailMessage(recipient.locale, recipient.email, data.title, { preheader: data.title, title: data.title, paragraphs: data.body ? data.body.split('\n').map((line) => line.trim()).filter(Boolean) : [], button: { label: translate(recipient.locale, 'announce.open'), url: `${rt.env.APP_BASE_URL}/app` } }, rt.env.APP_BASE_URL))
          .then(() => { emailed++; }).catch(() => undefined);
      }
    }
    return { id, emailed };
  }));

export const endAnnouncement = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(({ data }) => guarded(async () => { const viewer = await requirePlatformAdmin(); await core.endAnnouncement(runtime().owner, viewer.userId, data.id); }));

export const handleFeedback = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(({ data }) => guarded(async () => { const viewer = await requirePlatformAdmin(); await core.handleFeedback(runtime().owner, viewer.userId, data.id); }));

/** Any member reports a problem or an idea from the app. */
export const sendFeedback = createServerFn({ method: 'POST' })
  .validator((input: { kind: 'problem' | 'idea'; body: string; page?: string | null }) => input)
  .handler(({ data }) => guarded(async () => { await core.submitFeedback(runtime().db, await requireActor(), data); return { ok: true }; }));

export const consoleCompanyAction = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; action: 'suspend' | 'reactivate' | 'trial' | 'paid' | 'internal' | 'external'; reason?: string; days?: number; months?: number }) => input)
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await requirePlatformAdmin();
      const { owner } = runtime();
      if (data.action === 'suspend' || data.action === 'reactivate') await core.setCompanySuspended(owner, viewer.userId, data.orgId, data.action === 'suspend', data.reason ?? null);
      if (data.action === 'trial') await core.extendTrial(owner, viewer.userId, data.orgId, data.days ?? 14);
      if (data.action === 'paid') await core.extendPaidPeriod(owner, viewer.userId, data.orgId, data.months ?? 1);
      if (data.action === 'internal' || data.action === 'external') await core.setCompanyInternal(owner, viewer.userId, data.orgId, data.action === 'internal');
      return { ok: true };
    }),
  );

export const saveLicenseProduct = createServerFn({ method: 'POST' })
  .validator((input: Record<string, unknown>) => input)
  .handler(({ data }) => guarded(async () => { const viewer = await requirePlatformAdmin(); await core.saveLicenseProduct(runtime().owner, viewer.userId, data); }));

export const removeLicenseProduct = createServerFn({ method: 'POST' })
  .validator((input: { productId: string }) => input)
  .handler(({ data }) => guarded(async () => { const viewer = await requirePlatformAdmin(); await core.removeLicenseProduct(runtime().owner, viewer.userId, data.productId); }));

/** A company pastes the licence key it bought on the store: checked, activated, applied (spec 038). */
export const redeemLicense = createServerFn({ method: 'POST' })
  .validator((input: { key: string }) => ({ key: String(input.key ?? '').trim() }))
  .handler(({ data }) =>
    act(async (actor) => {
      return applyLicenceKey(runtime(), actor, data.key);
    }, 'org.manage'),
  );

export const getLicenseOffer = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { owner, db, env } = runtime();
    const [products, redemptions, settings] = await Promise.all([core.listLicenseProducts(owner, true), core.myRedemptions(db, actor), core.getSettings(db, actor)]);
    // Spec 069: the store's page opens with the person's e-mail filled in, so the licence the store
    // issues comes back to this company by itself (Pulse).
    const me = (await owner.query<{ email: string; name: string }>('select email, name from "user" where id = $1', [actor.userId])).rows[0];
    const prefill = (url: string) => {
      if (!me) return url;
      const [first, ...rest] = me.name.trim().split(/\s+/u);
      const params = new URLSearchParams({ email: me.email, ...(first ? { first_name: first } : {}), ...(rest.length ? { last_name: rest.join(' ') } : {}) });
      return `${url}${url.includes('?') ? '&' : '?'}${params.toString()}`;
    };
    // Spec 055: each offer with its price in the company's currency (plan price × months) and its plan's words.
    const plans = await core.listPlansIn(db, settings.currencyCode);
    return {
      products: products.filter((product) => product.buyUrl).map((product) => {
        const plan = plans.find((candidate) => candidate.code === product.planCode);
        return { ...product, buyUrl: prefill(product.buyUrl!), priceMinor: plan && plan.priceMinor > 0 ? plan.priceMinor * product.months : null, plan: plan ?? null };
      }),
      currency: settings.currencyCode, redemptions, storeConfigured: Boolean(env.CHARIOW_API_KEY), automatic: Boolean(env.CHARIOW_PULSE_SECRET),
    };
  }),
);

// ---------------------------------------------------------------- OAuth consent (spec 016)

/** The consent page: who asks, whether the signed request is genuine, the person's companies. */
export const getConsent = createServerFn({ method: 'GET' })
  .validator((input: { query: string }) => ({ query: String(input.query ?? '').slice(0, 4000) }))
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await loadViewer();
      const params = new URLSearchParams(data.query);
      const clientId = params.get('client_id') ?? '';
      // Spec 056 bis: a request for the platform console (its own resource), not for a company.
      const platform = params.getAll('resource').some((resource) => resource.replace(/\/$/u, '').endsWith('/mcp/platform'));
      if (!viewer) return { signedIn: false as const, valid: false, clientId, clientName: clientId, companies: [], platform, platformAdmin: false };
      const { db, env } = runtime();
      const valid = data.query.length > 0 && (await verifyOAuthQueryParams(data.query, env.BETTER_AUTH_SECRET).catch(() => false));
      const { rows } = await db.query<{ name: string | null }>('select name from "oauthClient" where "clientId" = $1', [clientId]);
      return { signedIn: true as const, valid: Boolean(valid), clientId, clientName: rows[0]?.name || clientId, companies: viewer.companies, platform, platformAdmin: Boolean(viewer.platformAdmin) };
    }),
  );

/** Spec 056 bis: a platform admin connects an assistant to the console (read-only or not). */
export const grantMcpPlatform = createServerFn({ method: 'POST' })
  .validator((input: { clientId: string; readOnly: boolean }) => ({ clientId: String(input.clientId).slice(0, 200), readOnly: Boolean(input.readOnly) }))
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await requirePlatformAdmin();
      await core.grantPlatformMcp(runtime().owner, viewer.userId, data.clientId, data.readOnly);
    }),
  );

export const revokePlatformMcp = createServerFn({ method: 'POST' })
  .validator((input: { userId: string; clientId: string }) => input)
  .handler(({ data }) => guarded(async () => { const viewer = await requirePlatformAdmin(); await core.revokePlatformMcpGrant(runtime().owner, viewer.userId, data.userId, data.clientId); }));

export const grantMcpCompany = createServerFn({ method: 'POST' })
  .validator((input: { clientId: string; orgId: string }) => ({ clientId: String(input.clientId).slice(0, 200), orgId: String(input.orgId) }))
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await loadViewer();
      if (!viewer) throw new core.DomainError('not_signed_in', 401);
      await core.grantMcpCompany(runtime().db, viewer.userId, data.clientId, data.orgId);
    }),
  );

export const revokeMcpConnection = createServerFn({ method: 'POST' })
  .validator((input: { clientId: string }) => input)
  .handler(({ data }) => act((actor) => core.revokeMcpConnection(runtime().db, actor, data.clientId)));

// ---------------------------------------------------------------- subscription payment (spec 017)

/** The platform's own payment account: Moneroo when configured, the simulator in test, else none. */
function platformGatewayCode(): 'moneroo' | 'simulator' | null {
  const { env } = runtime();
  if (env.PLATFORM_MONEROO_SECRET_KEY) return 'moneroo';
  return env.PAYMENTS_SIMULATOR ? 'simulator' : null;
}

export const paySubscription = createServerFn({ method: 'POST' })
  .validator((input: { planCode: string; months: number }) => ({ planCode: String(input.planCode), months: Number(input.months) }))
  .handler(({ data }) =>
    act(async (actor) => {
      const { db, owner, env } = runtime();
      const code = platformGatewayCode();
      if (!code) throw new core.DomainError('payment_unavailable', 409);
      const payment = await core.startSubscriptionPayment(db, actor, { ...data, provider: code });
      const viewer = await loadViewer();
      const gateway =
        code === 'moneroo'
          ? monerooGateway(env.PLATFORM_MONEROO_SECRET_KEY, env.PLATFORM_MONEROO_WEBHOOK_SECRET)
          : { ...simulatorGateway(env.APP_BASE_URL), initiate: async () => ({ providerRef: `sim_${payment.id}`, checkoutUrl: `${env.APP_BASE_URL}/pay/subscription/${payment.id}` }) };
      const checkout = await gateway.initiate({
        amountMinor: payment.amountMinor,
        currencyCode: payment.currencyCode,
        reference: payment.id,
        description: `Struo ${payment.planName} — ${data.months}`,
        returnUrl: `${env.APP_BASE_URL}/app/settings`,
        customer: { email: viewer?.email ?? 'client@example.invalid', name: viewer?.name ?? 'Client' },
        metadata: { subscription_payment_id: payment.id },
      });
      await core.attachSubscriptionCheckout(owner, payment.id, checkout.providerRef, checkout.checkoutUrl);
      return { checkoutUrl: checkout.checkoutUrl };
    }),
  );

export const getSubscriptionCheckout = createServerFn({ method: 'GET' })
  .validator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(({ data }) =>
    guarded(async () => {
      const { owner, env } = runtime();
      if (!env.PAYMENTS_SIMULATOR) throw new core.DomainError('not_found', 404);
      const payment = await core.findSubscriptionPayment(owner, { id: data.id });
      if (!payment || payment.provider !== 'simulator') throw new core.DomainError('not_found', 404);
      return payment;
    }),
  );

export const settleSimulatedSubscription = createServerFn({ method: 'POST' })
  .validator((input: { id: string; outcome: string }) => ({
    id: String(input.id), outcome: input.outcome === 'succeeded' ? ('succeeded' as const) : ('failed' as const),
  }))
  .handler(({ data }) =>
    guarded(async () => {
      const { owner, env } = runtime();
      if (!env.PAYMENTS_SIMULATOR) throw new core.DomainError('not_found', 404);
      const payment = await core.findSubscriptionPayment(owner, { id: data.id });
      if (!payment || payment.provider !== 'simulator') throw new core.DomainError('not_found', 404);
      return core.settleSubscriptionPayment(owner, {
        id: data.id, status: data.outcome, amountMinor: payment.amountMinor, currencyCode: payment.currencyCode,
      });
    }),
  );

// ---------------------------------------------------------------- erasure (spec 018)

/** Erases the company for good (owner, exact name typed): rows by cascade, then its files. */
export const eraseCompany = createServerFn({ method: 'POST' })
  .validator((input: { confirmName: string }) => ({ confirmName: String(input.confirmName ?? '').slice(0, 200) }))
  .handler(({ data }) =>
    act(async (actor) => {
      const { db, storage } = runtime();
      const { storagePrefix } = await core.eraseCompany(db, actor, data.confirmName);
      await storage.removePrefix(storagePrefix).catch((error: unknown) => console.error('[erase] files', error));
      return { erased: true };
    }),
  );

// ---------------------------------------------------------------- the console through MCP (spec 056)

export const createPlatformKey = createServerFn({ method: 'POST' })
  .validator((input: { name: string; readOnly: boolean }) => input)
  .handler(({ data }) => guarded(async () => { const viewer = await requirePlatformAdmin(); return core.createPlatformKey(runtime().owner, viewer.userId, data); }));

export const revokePlatformKey = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(({ data }) => guarded(async () => { const viewer = await requirePlatformAdmin(); await core.revokePlatformKey(runtime().owner, viewer.userId, data.id); }));

export const grantFeature = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; feature: string; until?: string | null; reason?: string | null }) => input)
  .handler(({ data }) => guarded(async () => { const viewer = await requirePlatformAdmin(); await core.grantFeature(runtime().owner, viewer.userId, data); }));

export const revokeFeature = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; feature: string }) => input)
  .handler(({ data }) => guarded(async () => { const viewer = await requirePlatformAdmin(); await core.revokeFeatureGrant(runtime().owner, viewer.userId, data.orgId, data.feature); }));
