// Team (spec 024, screen A5/05): members with their role and last activity, pending invitations, and
// an invitation that starts from the role (illustrated, one line each) then the channel.
import { can, ROLES, type Role } from '@struo/core/permissions';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { Calculator, Copy, Crown, HardHat, Link2, Mail, MessageCircle, Settings2, Trash2, UserPlus, Wrench, type LucideIcon } from 'lucide-react';
import { Avatar, Modal, PageHeader, Panel, useRelative, useToast } from '@/components/kit.tsx';
import { inviteMember, getTeamPage, removeMember, revokeInvitation, setMemberRole } from '@/features/settings/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/team')({
  validateSearch: (search: Record<string, unknown>): { invite?: string } => (typeof search.invite === 'string' ? { invite: search.invite } : {}),
  loader: () => getTeamPage(),
  component: Team,
});

const ROLE_ICON: Record<Role, LucideIcon> = { owner: Crown, admin: Settings2, engineer: Wrench, site_lead: HardHat, accountant: Calculator };
const ROLE_COLOR: Record<Role, string> = { owner: '#b9461e', admin: '#5c665d', engineer: '#2f5f8a', site_lead: '#a36a12', accountant: '#3d704e' };

function Team() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const toast = useToast();
  const ago = useRelative();
  const manage = can(data.role, 'members.manage');
  const [inviting, setInviting] = useState(Boolean(search.invite) && manage);
  const run = async (work: () => Promise<unknown>) => {
    try { await work(); await router.invalidate(); toast({ text: t('ui.saved') }); } catch { toast({ text: t('errors.generic'), kind: 'err' }); }
  };
  return (
    <div className="stack loose">
      <PageHeader title={t('shell.team')} text={t('team.subtitle', { company: data.companyName })}>
        {manage ? <button type="button" className="btn" onClick={() => setInviting(true)}><UserPlus size={16} />{t('team.invite')}</button> : null}
      </PageHeader>
      <Panel title={t('team.members', { n: data.members.length })} flush>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('clientInvite.contactName')}</th><th>{t('settings.role')}</th><th>{t('team.lastActivity')}</th>{manage ? <th /> : null}</tr></thead>
          <tbody>{data.members.map((member) => (
            <tr key={member.memberId}>
              <td><span className="row nowrap"><Avatar name={member.name} size="md" /><span><b>{member.name}</b>{member.userId === data.userId ? <span className="faint small"> · {t('team.you')}</span> : null}<br /><span className="muted small">{member.email}</span></span></span></td>
              <td>
                {manage && member.userId !== data.userId ? (
                  <select value={member.role} onChange={(event) => void run(() => setMemberRole({ data: { memberId: member.memberId, role: event.target.value } }))} style={{ maxWidth: 200 }}>
                    {ROLES.map((role) => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}
                  </select>
                ) : <span className="badge" style={{ color: ROLE_COLOR[member.role] }}>{t(`roles.${member.role}`)}</span>}
              </td>
              <td className="muted">{member.lastActivity ? ago(member.lastActivity) : t('team.never')}</td>
              {manage ? <td className="right">{member.userId !== data.userId ? (
                <button type="button" className="icon-btn" aria-label={t('app.remove')} onClick={() => void run(() => removeMember({ data: { memberId: member.memberId } }))}><Trash2 size={15} /></button>
              ) : null}</td> : null}
            </tr>
          ))}</tbody>
        </table></div>
      </Panel>
      {manage && data.invitations.length ? (
        <Panel title={t('team.pending')} flush>
          {data.invitations.map((invitation) => (
            <div key={invitation.id} className="row nowrap" style={{ padding: '.6rem 1rem', borderBottom: '1px solid var(--divider)' }}>
              <Mail size={16} style={{ color: 'var(--ink-faint)' }} />
              <span className="grow trunc">{invitation.email} · {t(`roles.${invitation.role}`)}</span>
              <button type="button" className="btn ghost small" onClick={() => void navigator.clipboard.writeText(`${data.baseUrl}/invite/${invitation.id}`).then(() => toast({ text: t('ui.copied') }))}><Copy size={14} />{t('team.copy')}</button>
              <button type="button" className="icon-btn" aria-label={t('app.remove')} onClick={() => void run(() => revokeInvitation({ data: { id: invitation.id } }))}><Trash2 size={15} /></button>
            </div>
          ))}
        </Panel>
      ) : null}
      {inviting ? <InviteModal company={data.companyName} onClose={() => setInviting(false)} /> : null}
    </div>
  );
}

function InviteModal({ company, onClose }: { company: string; onClose: () => void }) {
  const { t, errorText } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [role, setRole] = useState<Role>('site_lead');
  const [channel, setChannel] = useState<'whatsapp' | 'email' | 'link'>('whatsapp');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setError(null);
    const tab = channel === 'whatsapp' ? window.open('', '_blank') : null;
    try {
      const { url } = await inviteMember({ data: { email, role } });
      const message = t('team.message', { company, role: t(`roles.${role}`), url });
      if (channel === 'whatsapp' && tab) tab.location.href = `https://wa.me/${phone.replace(/[^\d]/gu, '')}?text=${encodeURIComponent(message)}`;
      if (channel === 'link') await navigator.clipboard.writeText(url).catch(() => undefined);
      toast({ text: channel === 'link' ? t('ui.copied') : t('team.sent') });
      onClose();
      await router.invalidate();
    } catch (caught) {
      tab?.close(); setError(errorText(caught));
    } finally { setBusy(false); }
  };
  const roles: Role[] = ['site_lead', 'engineer', 'accountant', 'admin', 'owner'];
  return (
    <Modal open wide onClose={onClose} title={t('team.inviteTitle', { company })}
      footer={(<><button type="button" className="btn secondary" onClick={onClose}>{t('app.cancel')}</button>
        <button type="button" className="btn" disabled={busy || !/^\S+@\S+\.\S+$/u.test(email) || (channel === 'whatsapp' && phone.replace(/\D/gu, '').length < 8)} onClick={() => void send()}>
          <UserPlus size={16} />{t('settings.invite')}</button></>)}>
      <div className="stack loose">
        <div className="stack" style={{ gap: '.5rem' }}>
          <b>{t('team.roleStep')}</b>
          <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.6rem' }}>
            {roles.map((value) => {
              const Icon = ROLE_ICON[value];
              return (
                <button key={value} type="button" className={`tile ${role === value ? 'selected' : ''}`} style={{ alignItems: 'flex-start', textAlign: 'left', minHeight: 96 }} onClick={() => setRole(value)}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${ROLE_COLOR[value]} 14%, var(--surface))`, color: ROLE_COLOR[value] }}><Icon size={18} /></span>
                  <b>{t(`roles.${value}`)}</b>
                  <span className="small muted" style={{ fontWeight: 400 }}>{t(`team.roleHelp.${value}`)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="stack" style={{ gap: '.5rem' }}>
          <b>{t('team.howStep')}</b>
          <div className="tiles three">
            {([['whatsapp', 'WhatsApp', MessageCircle], ['email', 'E-mail', Mail], ['link', t('team.copy'), Link2]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" className={`tile ${channel === value ? 'selected' : ''}`} style={{ minHeight: 70 }} onClick={() => setChannel(value)}><Icon size={20} />{label}</button>
            ))}
          </div>
          <div className="form-grid">
            <label className="field">{t('team.email')}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></label>
            {channel === 'whatsapp' ? <label className="field">{t('team.phone')}<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="+228 90 00 00 00" /></label> : null}
          </div>
          <span className="faint small">{t('team.expires')}</span>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
    </Modal>
  );
}
