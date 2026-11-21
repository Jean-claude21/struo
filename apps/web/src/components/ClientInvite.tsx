// The « Client » tab of a site (spec 022, screen C1): who the client is, whether they were invited and
// opened their space, and the invitation itself — channel, what they will see, a live preview.
import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { Copy, Eye, Lock, Mail, MessageCircle, Send, UserRound } from 'lucide-react';
import { Avatar, Modal, Panel, StatusChip, useRelative, useToast } from './kit.tsx';
import { inviteClient, revokePortalLink } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

type Link = {
  id: string; revokedAt: string | null; lastSeenAt: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  showPhotos: boolean; showPlanning: boolean; showFinance: boolean; showDocuments: boolean; showMessages: boolean; showFieldReports: boolean; invitedAt: string | null; firstOpenedAt: string | null;
};

export function ClientTab({ projectId, projectName, companyName, client, links, canManage }: {
  projectId: string; projectName: string; companyName: string;
  client: { name: string; email: string | null; phone: string | null } | null;
  links: Link[]; canManage: boolean;
}) {
  const { t } = useI18n();
  const ago = useRelative();
  const router = useRouter();
  const toast = useToast();
  const active = links.find((link) => !link.revokedAt) ?? null;
  const [open, setOpen] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const name = active?.contactName ?? client?.name ?? '';
  const status = !active ? { shape: 'todo' as const, label: t('clientInvite.notInvited') }
    : active.firstOpenedAt ? { shape: 'done' as const, label: t('clientInvite.opened', { when: ago(active.firstOpenedAt) }) }
    : { shape: 'progress' as const, label: t('clientInvite.invited', { when: ago(active.invitedAt ?? '') }) };

  return (
    <div className="grid-main">
      <Panel title={t('clientInvite.yourClient')}>
        <div className="stack loose">
          <div className="row nowrap">
            <Avatar name={name || '?'} size="lg" />
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 650, fontSize: '1.05rem' }}>{name || '—'}</div>
              <div className="muted small">{active?.contactPhone ?? client?.phone ?? ''}{(active?.contactEmail ?? client?.email) ? ` · ${active?.contactEmail ?? client?.email}` : ''}</div>
            </div>
          </div>
          <StatusChip shape={status.shape} label={status.label} />
          {active?.lastSeenAt ? <span className="muted small">{t('clientInvite.lastSeen', { when: ago(active.lastSeenAt) })}</span> : null}
          {lastUrl ? (
            <div className="notice ok stack" style={{ gap: '.4rem' }}>
              <div className="secret small">{lastUrl}</div>
              <div className="row tight">
                <button type="button" className="btn secondary small" onClick={() => void navigator.clipboard.writeText(lastUrl)}><Copy size={14} />{t('clientInvite.copyLink')}</button>
                <a className="btn ghost small" href={lastUrl} target="_blank" rel="noreferrer"><Eye size={14} />{t('ui.open')}</a>
              </div>
            </div>
          ) : null}
          {active ? (
            <div className="chips">
              {[['showPhotos', 'seePhotos'], ['showPlanning', 'seePlanning'], ['showFinance', 'seeFinance'], ['showDocuments', 'seeDocuments'], ['showMessages', 'seeMessages'], ['showFieldReports', 'seeFieldReports']]
                .filter(([key]) => active[key as keyof Link]).map(([key, label]) => <span key={key} className="badge"><Eye size={12} />{t(`clientInvite.${label}` as 'clientInvite.seePhotos')}</span>)}
            </div>
          ) : null}
          {canManage ? (
            <div className="row">
              <button type="button" className="btn" onClick={() => setOpen(true)}><Send size={16} />{active ? t('clientInvite.reinvite') : t('clientInvite.invite')}</button>
              {active ? (
                <button type="button" className="btn danger small" onClick={async () => {
                  await revokePortalLink({ data: { id: active.id } }); toast({ text: t('clientInvite.revoked') }); await router.invalidate();
                }}><Lock size={14} />{t('clientInvite.revoke')}</button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Panel>
      <Panel title={t('clientInvite.preview')}>
        <PhonePreview text={t('clientInvite.message', { name, project: projectName, company: companyName, url: 'struo.kete.digital/portal/…' })} company={companyName} />
      </Panel>
      {open ? (
        <InviteModal projectId={projectId} projectName={projectName} companyName={companyName} onClose={() => setOpen(false)} onSent={setLastUrl}
          defaults={{ name, email: active?.contactEmail ?? client?.email ?? '', phone: active?.contactPhone ?? client?.phone ?? '' }} />
      ) : null}
    </div>
  );
}

function PhonePreview({ text, company }: { text: string; company: string }) {
  return (
    <div style={{ maxWidth: 300, margin: '0 auto', border: '8px solid var(--ink)', borderRadius: 28, overflow: 'hidden', background: 'var(--surface-2)' }}>
      <div style={{ background: '#128c7e', color: '#fff', padding: '.6rem .9rem', fontWeight: 600, fontSize: '.9rem' }}>{company}</div>
      <div style={{ padding: '1rem .75rem 1.5rem', minHeight: 220 }}>
        <div style={{ background: 'var(--surface)', borderRadius: '4px 12px 12px 12px', padding: '.6rem .75rem', fontSize: '.86rem', boxShadow: '0 1px 1px rgba(0,0,0,.1)' }}>{text}</div>
      </div>
    </div>
  );
}

function InviteModal({ projectId, projectName, companyName, defaults, onClose, onSent }: {
  projectId: string; projectName: string; companyName: string; defaults: { name: string; email: string; phone: string }; onClose: () => void; onSent: (url: string) => void;
}) {
  const { t, errorText } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [channel, setChannel] = useState<'whatsapp' | 'email' | 'link'>(defaults.phone ? 'whatsapp' : 'email');
  const [contact, setContact] = useState(defaults);
  const [show, setShow] = useState({ photos: true, planning: true, finance: true, documents: true, messages: true, fieldReports: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const message = t('clientInvite.message', { name: contact.name, project: projectName, company: companyName, url: '…' });
  const send = async () => {
    setBusy(true); setError(null);
    // Opened before the request so the browser lets the WhatsApp tab open.
    const tab = channel === 'whatsapp' ? window.open('', '_blank') : null;
    try {
      const result = await inviteClient({ data: { projectId, channel, contactName: contact.name, contactEmail: contact.email, contactPhone: contact.phone, show } });
      if (channel === 'whatsapp' && result.whatsappUrl && tab) { tab.location.href = result.whatsappUrl; toast({ text: t('clientInvite.sentWhatsapp') }); }
      else { tab?.close(); }
      if (channel === 'email') toast({ text: t('clientInvite.sentEmail') });
      if (channel === 'link') { await navigator.clipboard.writeText(result.url).catch(() => undefined); toast({ text: t('clientInvite.linkCopied') }); }
      onSent(result.url);
      onClose();
      await router.invalidate();
    } catch (caught) {
      tab?.close();
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };
  const channels = [
    { value: 'whatsapp' as const, label: 'WhatsApp', icon: MessageCircle },
    { value: 'email' as const, label: 'E-mail', icon: Mail },
    { value: 'link' as const, label: t('clientInvite.copyLink'), icon: Copy },
  ];
  const toggles: [keyof typeof show, string][] = [['photos', 'seePhotos'], ['planning', 'seePlanning'], ['finance', 'seeFinance'], ['documents', 'seeDocuments'], ['messages', 'seeMessages'], ['fieldReports', 'seeFieldReports']];
  return (
    <Modal open wide onClose={onClose} title={t('clientInvite.title', { name: contact.name || '…' })}
      footer={(<><button type="button" className="btn secondary" onClick={onClose}>{t('app.cancel')}</button>
        <button type="button" className="btn" disabled={busy || !contact.email.trim() || (channel === 'whatsapp' && !contact.phone.trim())} onClick={() => void send()}>
          <Send size={16} />{t('clientInvite.send')}</button></>)}>
      <div className="grid-2">
        <div className="stack loose">
          <div className="stack" style={{ gap: '.4rem' }}>
            <b className="small">{t('clientInvite.sendBy')}</b>
            <div className="tiles three">
              {channels.map((item) => (
                <button key={item.value} type="button" className={`tile ${channel === item.value ? 'selected' : ''}`} style={{ minHeight: 72 }} onClick={() => setChannel(item.value)}>
                  <item.icon size={20} />{item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="form-grid">
            <label className="field"><span className="row tight"><UserRound size={14} />{t('clientInvite.contactName')}</span>
              <input value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} maxLength={120} /></label>
            <label className="field">{t('clientInvite.contactPhone')}
              <input value={contact.phone} onChange={(event) => setContact({ ...contact, phone: event.target.value })} inputMode="tel" placeholder="+228 90 00 00 00" maxLength={40} /></label>
          </div>
          <label className="field">{t('clientInvite.contactEmail')}
            <input type="email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} required maxLength={254} />
            <span className="faint xsmall" style={{ fontWeight: 400 }}>{t('clientInvite.emailNeeded')}</span></label>
          <div className="stack" style={{ gap: '.35rem' }}>
            <b className="small">{t('clientInvite.sees')}</b>
            {toggles.map(([key, label]) => (
              <label key={key} className="check" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--divider)', padding: '.35rem 0' }}>
                <span>{t(`clientInvite.${label}` as 'clientInvite.seePhotos')}</span>
                <input type="checkbox" checked={show[key]} onChange={() => setShow({ ...show, [key]: !show[key] })} />
              </label>
            ))}
            <label className="check faint" style={{ justifyContent: 'space-between', padding: '.35rem 0' }}>
              <span className="row tight"><Lock size={13} />{t('clientInvite.neverSeen')}</span><input type="checkbox" checked={false} disabled />
            </label>
          </div>
          {error ? <p className="error" role="alert">{error}</p> : null}
        </div>
        <div className="stack">
          <b className="small">{t('clientInvite.preview')}</b>
          <PhonePreview text={message} company={companyName} />
          <span className="faint xsmall">{t('clientInvite.oldRevoked')}</span>
        </div>
      </div>
    </Modal>
  );
}
