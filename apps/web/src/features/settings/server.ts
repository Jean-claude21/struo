import * as core from '@struo/core';
import { createServerFn } from '@tanstack/react-start';
import { translate } from '@/i18n/index.tsx';
import { chooseCompany, guarded, loadViewer, requestLocale, requireActor, requirePlatformAdmin } from '@/server/context.server.ts';
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
    const [settings, configuration, members, invitations, provider, keys, subscription] = await Promise.all([
      core.getSettings(db, actor),
      core.getConfiguration(db, actor),
      core.listMembers(db, actor),
      core.can(actor.role, 'members.manage') ? core.listInvitations(db, actor) : Promise.resolve([]),
      core.getPaymentProvider(db, actor),
      core.can(actor.role, 'apikeys.manage') ? core.listApiKeys(db, actor) : Promise.resolve([]),
      core.getSubscription(db, actor),
    ]);
    return {
      role: actor.role, userId: actor.userId, settings, configuration, members, invitations, provider, keys, subscription,
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
      await mailer
        .send({
          to: invitation.email,
          subject: translate(locale, 'digest.invitationSubject', { org: settings.name }),
          text: translate(locale, 'digest.invitationBody', { org: settings.name, url }),
        })
        .catch((error: unknown) => console.error('[mail] invitation', error));
      return { url };
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
  guarded(async () => ({ plans: await core.listPlans(runtime().db), locale: requestLocale() })),
);

export const getConsole = createServerFn({ method: 'GET' }).handler(() =>
  guarded(async () => {
    await requirePlatformAdmin();
    const { owner, db } = runtime();
    return { companies: await core.platformOverview(owner), plans: await core.listPlans(db) };
  }),
);

export const setCompanyPlan = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; planCode: string }) => input)
  .handler(({ data }) =>
    guarded(async () => {
      const viewer = await requirePlatformAdmin();
      await core.setCompanyPlan(runtime().owner, data.orgId, data.planCode, viewer.userId);
    }),
  );
