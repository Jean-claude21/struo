// Spec 069/070: the store's Pulses (Chariow signed webhooks). On `license.issued` the licence is applied
// to the buyer's company by itself — the buyer pastes nothing. The buyer is matched by e-mail (owner
// or admin of a real company; the « Buy » link pre-fills that e-mail). Every delivery is kept for the
// founder's console; a retry of the same delivery changes nothing.
import { companyForBuyer, listLicenseProducts, recordStorePulse, resolveActor, settleStorePulse, type DomainError } from '@struo/core';
import { createFileRoute } from '@tanstack/react-router';
import { translate } from '@/i18n/index.tsx';
import { applyLicenceKey, pulseSignatureValid } from '@/server/licence.server.ts';
import { reportError } from '@/server/monitor.server.ts';
import { runtime, type Runtime } from '@/server/runtime.server.ts';

type Pulse = {
  event?: string;
  license?: { key?: string };
  product?: { id?: string; name?: string };
  customer?: { email?: string; name?: string };
};

async function tellFounder(rt: Runtime, subject: string, lines: string[]) {
  if (!rt.env.PLATFORM_ADMIN_EMAILS.length) return;
  await rt.mailer.send({ to: rt.env.PLATFORM_ADMIN_EMAILS, subject, text: [...lines, '', `${rt.env.APP_BASE_URL}/console`].join('\n') })
    .catch((error: unknown) => reportError(error, { where: 'pulse-mail' }));
}

async function handle(request: Request): Promise<Response> {
  const rt = runtime();
  const secrets = rt.env.CHARIOW_PULSE_SECRET.split(',').map((item) => item.trim()).filter(Boolean);
  if (!secrets.length) return Response.json({ error: 'not_configured' }, { status: 503 });
  const raw = await request.text();
  if (!pulseSignatureValid(raw, request.headers.get('x-chariow-signature'), secrets)) return Response.json({ error: 'invalid_signature' }, { status: 401 });
  let pulse: Pulse;
  try { pulse = JSON.parse(raw) as Pulse; } catch { return Response.json({ error: 'invalid_input' }, { status: 422 }); }
  const event = String(pulse.event ?? request.headers.get('x-pulse-event') ?? 'unknown');
  const deliveryId = request.headers.get('x-pulse-delivery-id') ?? `${event}:${pulse.license?.key ? pulse.license.key.slice(-6) : Date.now()}`;
  const email = pulse.customer?.email?.trim().toLowerCase() ?? null;
  const fresh = await recordStorePulse(rt.owner, { deliveryId, event, buyerEmail: email, productId: pulse.product?.id ?? null });
  if (!fresh) return Response.json({ ok: true, duplicate: true });

  // Only a licence being issued moves anything; the other events are kept for the console.
  if (event !== 'license.issued' || !pulse.license?.key) {
    await settleStorePulse(rt.owner, deliveryId, 'ignored');
    return Response.json({ ok: true });
  }
  // One Pulse can cover the whole store (several platforms): a product not linked to a Struo offer
  // (Console › Licences) belongs to another platform and is left alone, without alerting anyone.
  const productId = pulse.product?.id ?? '';
  if (!(await listLicenseProducts(rt.owner)).some((product) => product.productId === productId)) {
    await settleStorePulse(rt.owner, deliveryId, 'ignored', { text: 'Product not linked to a Struo offer (another platform, or a test).' });
    return Response.json({ ok: true });
  }
  const company = email ? await companyForBuyer(rt.owner, email) : null;
  if (!company) {
    await settleStorePulse(rt.owner, deliveryId, 'unmatched', { text: 'No company where this e-mail is owner or admin: the buyer can paste the key in Settings › Licence.' });
    await tellFounder(rt, translate('fr', 'pulse.mail.unmatchedSubject', { email: email ?? '?' }), [
      translate('fr', 'pulse.mail.unmatched', { email: email ?? '?', product: pulse.product?.name ?? pulse.product?.id ?? '?' }),
    ]);
    return Response.json({ ok: true });
  }
  try {
    const actor = await resolveActor(rt.db, company.userId, company.orgId, 'system');
    if (!actor) throw new Error('buyer is no longer a member');
    const result = await applyLicenceKey(rt, actor, pulse.license.key);
    await settleStorePulse(rt.owner, deliveryId, 'applied', { companyName: company.name, text: `${result.planCode} until ${result.paidUntil.slice(0, 10)}` });
    const locale = (await rt.owner.query<{ locale: 'fr' | 'en' }>('select locale from org_settings where org_id = $1', [company.orgId])).rows[0]?.locale ?? 'fr';
    const until = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'long' }).format(new Date(result.paidUntil));
    await rt.mailer.send({
      to: email!,
      subject: translate(locale, 'pulse.mail.appliedSubject', { company: company.name }),
      text: [translate(locale, 'pulse.mail.applied', { company: company.name, until }), '', `${rt.env.APP_BASE_URL}/app`].join('\n'),
    }).catch((error: unknown) => reportError(error, { where: 'pulse-mail' }));
  } catch (error) {
    const code = (error as DomainError)?.code;
    if (code === 'license_already_used') {
      await settleStorePulse(rt.owner, deliveryId, 'already', { companyName: company.name, text: 'The key had already been entered by hand.' });
    } else {
      await settleStorePulse(rt.owner, deliveryId, 'failed', { companyName: company.name, text: String(code ?? (error as Error)?.message ?? error) });
      reportError(error, { where: 'pulse' });
      await tellFounder(rt, translate('fr', 'pulse.mail.failedSubject', { company: company.name }), [translate('fr', 'pulse.mail.failed', { company: company.name, reason: String(code ?? 'error') })]);
    }
  }
  // Always 200 once the delivery is recorded: the store must not retry what Struo has already handled.
  return Response.json({ ok: true });
}

export const Route = createFileRoute('/api/payments/chariow')({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
