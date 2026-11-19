import { createFileRoute, Link } from '@tanstack/react-router';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { ErrorText, useAction } from '@/components/ui.tsx';
import { acceptInvitation, readInvitation } from '@/features/settings/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/invite/$id')({
  loader: ({ params }) => readInvitation({ data: { id: params.id } }),
  component: Invite,
});

function Invite() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const { id } = Route.useParams();
  const { run, error, busy } = useAction();
  const next = `/invite/${id}`;
  const invitation = data.invitation;
  return (
    <div className="public">
      <PublicHeader signedIn={data.signedIn} />
      <div className="card auth-box">
        <h1>{t('invite.title')}</h1>
        {!data.signedIn ? (
          <>
            <p>{t('errors.not_signed_in')}</p>
            <div className="pair">
              <Link to="/login" search={{ next }} className="btn secondary">
                {t('auth.signIn')}
              </Link>
              <Link to="/signup" search={{ next }} className="btn">
                {t('auth.signUp')}
              </Link>
            </div>
          </>
        ) : !invitation || invitation.status !== 'pending' || invitation.expired ? (
          <p className="error">{t('errors.invitation_invalid')}</p>
        ) : (
          <>
            <p>
              {t('invite.body', {
                org: invitation.orgName,
                role: ['owner', 'admin', 'engineer', 'site_lead', 'accountant'].includes(invitation.role)
                  ? t(`roles.${invitation.role as 'owner'}`)
                  : invitation.role,
              })}
            </p>
            {'email' in data && invitation.email.toLowerCase() !== String(data.email).toLowerCase() ? (
              <p className="notice">{t('invite.signInFirst', { email: invitation.email })}</p>
            ) : null}
            <ErrorText error={error} />
            <button
              type="button"
              className="btn block"
              disabled={busy}
              onClick={async () => {
                const done = await run(() => acceptInvitation({ data: { id } }), { reload: false });
                if (done) window.location.href = '/app';
              }}
            >
              {t('invite.accept')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
