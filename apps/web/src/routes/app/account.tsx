// My account (spec 040): every member, whatever the role, manages their name, address, password
// and open sessions here. The accounts library does the work; this page only asks and explains.
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';
import { useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, LogOut, MailWarning } from 'lucide-react';
import { PageHeader, Panel } from '@/components/kit.tsx';
import { PushToggle } from '@/components/PushToggle.tsx';
import { ErrorText, Field } from '@/components/ui.tsx';
import { authCall, authErrorKey } from '@/features/auth/call.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

type Search = { verified?: string; email?: string };
export const Route = createFileRoute('/app/account')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(typeof search.verified === 'string' ? { verified: search.verified } : {}),
    ...(typeof search.email === 'string' ? { email: search.email } : {}),
  }),
  component: Account,
});
const app = getRouteApi('/app');

/** One form with its own state: busy, error, success message. */
function useForm() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const submit = (handler: (form: FormData) => Promise<{ ok: boolean; code?: string; message?: string; doneKey?: MessageKey }>) => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    setBusy(true); setError(null); setDone(null);
    const result = await handler(new FormData(element));
    setBusy(false);
    if (result.ok) { setDone(result.doneKey ? t(result.doneKey) : null); element.reset(); } else setError(result.message ?? t(authErrorKey(result.code) as MessageKey));
  };
  return { busy, error, done, submit };
}

const Done = ({ children }: { children: ReactNode }) => <p className="notice ok small row tight"><CheckCircle2 size={15} />{children}</p>;

function Account() {
  const { t } = useI18n();
  const { viewer } = app.useLoaderData();
  const search = Route.useSearch();
  const profile = useForm();
  const email = useForm();
  const password = useForm();
  const [verifySent, setVerifySent] = useState(false);
  const [sessionsClosed, setSessionsClosed] = useState(false);

  return (
    <div className="stack loose" style={{ maxWidth: 760 }}>
      <PageHeader title={t('account.title')} text={t('account.subtitle')} />
      {search.verified ? <Done>{t('account.verifiedNow')}</Done> : null}
      {search.email ? <Done>{t('account.emailChangedNow')}</Done> : null}

      <Panel title={t('teamPush.title')}><PushToggle /></Panel>

      <Panel title={t('account.addressTitle')}>
        <div className="stack">
          <div className="row" style={{ flexWrap: 'wrap', gap: '.6rem' }}>
            <b>{viewer.email}</b>
            {viewer.emailVerified
              ? <span className="badge ok"><CheckCircle2 size={13} />{t('account.verified')}</span>
              : <span className="badge warn"><MailWarning size={13} />{t('account.notVerified')}</span>}
          </div>
          {!viewer.emailVerified ? (
            <div className="row tight" style={{ flexWrap: 'wrap' }}>
              <span className="muted small">{t('account.verifyWhy')}</span>
              <button type="button" className="btn small secondary" disabled={verifySent} onClick={async () => {
                const result = await authCall('/send-verification-email', { email: viewer.email, callbackURL: '/app/account?verified=1' });
                if (result.ok) setVerifySent(true);
              }}>{verifySent ? t('account.verifySent') : t('account.verifyResend')}</button>
            </div>
          ) : null}
          <form className="stack" onSubmit={email.submit(async (form) => {
            const result = await authCall('/change-email', { newEmail: String(form.get('newEmail')).trim(), callbackURL: '/app/account?email=1' });
            return { ...result, doneKey: viewer.emailVerified ? 'account.emailChangeSentOld' : 'account.emailChangeSentNew' };
          })}>
            <Field label={t('account.newEmail')} hint={viewer.emailVerified ? t('account.newEmailHint') : t('account.newEmailHintUnverified')}>
              <input name="newEmail" type="email" autoComplete="email" required />
            </Field>
            <ErrorText error={email.error} />
            {email.done ? <Done>{email.done}</Done> : null}
            <button className="btn secondary" disabled={email.busy} style={{ alignSelf: 'flex-start' }}>{t('account.changeEmail')}</button>
          </form>
        </div>
      </Panel>

      <Panel title={t('account.nameTitle')}>
        <form className="stack" onSubmit={profile.submit(async (form) => {
          const result = await authCall('/update-user', { name: String(form.get('name')).trim() });
          if (result.ok) setTimeout(() => window.location.reload(), 600);
          return { ...result, doneKey: 'account.saved' };
        })}>
          <Field label={t('auth.yourName')}><input name="name" defaultValue={viewer.name} required minLength={2} maxLength={80} autoComplete="name" /></Field>
          <ErrorText error={profile.error} />
          {profile.done ? <Done>{profile.done}</Done> : null}
          <button className="btn secondary" disabled={profile.busy} style={{ alignSelf: 'flex-start' }}>{t('app.save')}</button>
        </form>
      </Panel>

      <Panel title={t('account.passwordTitle')}>
        <form className="stack" onSubmit={password.submit(async (form) => {
          const next = String(form.get('newPassword'));
          if (next !== String(form.get('confirm'))) return { ok: false, message: t('account.err.mismatch') };
          const result = await authCall('/change-password', { currentPassword: String(form.get('currentPassword')), newPassword: next, revokeOtherSessions: true });
          return { ...result, doneKey: 'account.passwordChanged' };
        })}>
          <Field label={t('account.currentPassword')}><input name="currentPassword" type="password" autoComplete="current-password" required /></Field>
          <Field label={t('account.newPassword')} hint={t('auth.passwordHint')}><input name="newPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></Field>
          <Field label={t('account.confirmPassword')}><input name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></Field>
          <ErrorText error={password.error} />
          {password.done ? <Done>{password.done}</Done> : null}
          <div className="row" style={{ flexWrap: 'wrap', gap: '.8rem' }}>
            <button className="btn" disabled={password.busy}>{t('account.changePassword')}</button>
            <Link to="/forgot-password" search={{ email: viewer.email }} className="small">{t('account.forgot.link')}</Link>
          </div>
        </form>
      </Panel>

      <Panel title={t('account.sessionsTitle')}>
        <div className="stack">
          <p className="muted small">{t('account.sessionsBody')}</p>
          {sessionsClosed ? <Done>{t('account.sessionsClosed')}</Done> : null}
          <button type="button" className="btn secondary" style={{ alignSelf: 'flex-start' }} onClick={async () => {
            const result = await authCall('/revoke-other-sessions', {});
            if (result.ok) setSessionsClosed(true);
          }}><LogOut size={15} />{t('account.closeOthers')}</button>
        </div>
      </Panel>
    </div>
  );
}
