import * as core from '@struo/core';
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { createServerFn } from '@tanstack/react-start';
import { translate } from '@/i18n/index.tsx';
import { monerooGateway, simulatorGateway } from '@/server/adapters.server.ts';
import { createChariow } from '@/server/chariow.server.ts';
import { invitationMail } from '@/server/mail.server.ts';
import { chooseCompany, guarded, loadViewer, requestCountry, requestLocale, requireActor, requirePlatformAdmin } from '@/server/context.server.ts';
import { COUNTRIES } from './countries.ts';
import { outboundAllowed } from '@/server/demo.server.ts';
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
      const { orgId } = await core.createCompany(runtime().db, viewer.userId, data);
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
    const [settings, configuration, members, invitations, provider, keys, subscription, connections, subscriptionPayments] = await Promise.all([
      core.getSettings(db, actor),
      core.getConfiguration(db, actor),
      core.listMembers(db, actor),
      core.can(actor.role, 'members.manage') ? core.listInvitations(db, actor) : Promise.resolve([]),
      core.getPaymentProvider(db, actor),
      core.can(actor.role, 'apikeys.manage') ? core.listApiKeys(db, actor) : Promise.resolve([]),
      core.getSubscription(db, actor),
      core.listMcpConnections(db, actor),
      core.listSubscriptionPayments(db, actor),
    ]);
    // Spec 045: plans priced in the company's own currency.
    const plans = await core.listPlansIn(db, settings.currencyCode);
    const journal = core.can(actor.role, 'org.manage') ? await core.recentActivity(db, actor, 200) : [];
    return {
      role: actor.role, userId: actor.userId, settings, configuration, members, invitations, provider, keys, subscription, connections, subscriptionPayments, plans, journal,
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

export const setPaymentProvider = createServerFn({ method: 'POST' })
  .validator((input: { provider: string; secretKey?: string; webhookSecret?: string; enabled: boolean }) => input)
  .handler(({ data }) =>
    act(async (actor) => {
      const { db, secrets, env } = runtime();
      const provider = data.provider === 'simulator' && env.PAYMENTS_SIMULATOR ? 'simulator' : 'moneroo';
      await core.setPaymentProvider(db, actor, {
        provider,
        secretEnc: data.secretKey?.trim() ? secrets.seal(data.secretKey.trim()) : null,
        webhookSecretEnc: data.webhookSecret?.trim() ? secrets.seal(data.webhookSecret.trim()) : null,
        enabled: Boolean(data.enabled),
      });
    }),
  );

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
    return { plans: await core.listPlansIn(runtime().db, currency), country, currency, detected, locale: requestLocale() };
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
    return { companies, plans, prices, leads, revenue, products, redemptions, journal, health, chariowConfigured: Boolean(env.CHARIOW_API_KEY), monitoring: { errors: Boolean(env.SENTRY_DSN), audience: Boolean(env.UMAMI_WEBSITE_ID) } };
  }),
);

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
  .validator((input: { name: string; company: string; reach: string; activeSites: number | null; message: string; website?: string }) => input)
  .handler(({ data }) =>
    guarded(async () => {
      if (data.website) return { ok: true };
      const { country } = requestCountry();
      await core.createContactRequest(runtime().owner, { ...data, countryCode: country, locale: requestLocale() });
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
  .handler(({ data }) => guarded(async () => { await requirePlatformAdmin(); return core.platformCompany(runtime().owner, data.orgId); }));

export const consoleCompanyAction = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; action: 'suspend' | 'reactivate' | 'trial' | 'paid'; reason?: string; days?: number; months?: number }) => input)
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await requirePlatformAdmin();
      const { owner } = runtime();
      if (data.action === 'suspend' || data.action === 'reactivate') await core.setCompanySuspended(owner, viewer.userId, data.orgId, data.action === 'suspend', data.reason ?? null);
      if (data.action === 'trial') await core.extendTrial(owner, viewer.userId, data.orgId, data.days ?? 14);
      if (data.action === 'paid') await core.extendPaidPeriod(owner, viewer.userId, data.orgId, data.months ?? 1);
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
      const { owner, env } = runtime();
      if (data.key.length < 6 || data.key.length > 200) throw new core.DomainError('license_invalid', 422);
      const store = createChariow(env.CHARIOW_API_KEY);
      const license = await store.license(data.key);
      if (license.status === 'revoked') throw new core.DomainError('license_revoked', 422);
      if (license.isExpired || license.status === 'expired') throw new core.DomainError('license_expired', 422);
      await core.licenseProductFor(owner, license.productId);
      if (await core.licenseAlreadyUsed(owner, data.key)) throw new core.DomainError('license_already_used', 409);
      const activated = license.status === 'pending_activation' || license.canActivate ? await store.activate(data.key, `struo:${actor.orgId}`) : license;
      return core.redeemLicense(owner, actor, { key: data.key, maskedKey: activated.maskedKey || license.maskedKey, productId: license.productId, customerEmail: license.customerEmail });
    }, 'org.manage'),
  );

export const getLicenseOffer = createServerFn({ method: 'GET' }).handler(() =>
  act(async (actor) => {
    const { owner, db, env } = runtime();
    const [products, redemptions] = await Promise.all([core.listLicenseProducts(owner, true), core.myRedemptions(db, actor)]);
    return { products: products.filter((product) => product.buyUrl), redemptions, storeConfigured: Boolean(env.CHARIOW_API_KEY) };
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
      if (!viewer) return { signedIn: false as const, valid: false, clientId, clientName: clientId, companies: [] };
      const { db, env } = runtime();
      const valid = data.query.length > 0 && (await verifyOAuthQueryParams(data.query, env.BETTER_AUTH_SECRET).catch(() => false));
      const { rows } = await db.query<{ name: string | null }>('select name from "oauthClient" where "clientId" = $1', [clientId]);
      return { signedIn: true as const, valid: Boolean(valid), clientId, clientName: rows[0]?.name || clientId, companies: viewer.companies };
    }),
  );

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
