import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { LanguageSwitch } from '@/components/PublicHeader.tsx';
import { Badge, DateText, Empty, ErrorText, Money, useAction } from '@/components/ui.tsx';
import { getPortal, portalMessage, portalPay, portalValidate } from '@/features/portal/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/portal/$token')({
  loader: async ({ params }) => {
    try {
      return { view: await getPortal({ data: { token: params.token } }) };
    } catch {
      return { view: null };
    }
  },
  head: () => ({ meta: [{ name: 'robots', content: 'noindex' }] }),
  component: Portal,
});

function Portal() {
  const { t } = useI18n();
  const { view } = Route.useLoaderData();
  const { token } = Route.useParams();
  const { run, error, busy } = useAction();
  const [signer, setSigner] = useState('');
  if (!view) {
    return (
      <div className="public">
        <p className="notice">{t('portal.invalid')}</p>
      </div>
    );
  }
  const brand = view.company.brandColor ?? '#e8590c';
  const next = view.milestones.find((milestone) => !milestone.actualOn);
  const due = view.invoices.filter((invoice) => invoice.balance > 0);
  return (
    <div className="public" style={{ ['--brand' as string]: brand }}>
      <header className="portal-header">
        <strong style={{ fontSize: '1.3rem' }}>{view.company.name}</strong>
        <LanguageSwitch />
      </header>
      <h1>{t('portal.hello', { name: view.project.client ?? '' })}</h1>
      <div className="grid-2">
        <section className="card stack">
          <h2>{t('portal.yourProject', { name: view.project.name })}</h2>
          <div className="row" style={{ gap: '1.5rem' }}>
            <div className="ring" style={{ background: `conic-gradient(${brand} ${view.project.progress * 3.6}deg, #eee 0)` }}>
              <div className="ring" style={{ width: 110, height: 110, background: '#fff' }}>
                {view.project.progress} %
              </div>
            </div>
            <div className="stack grow">
              {view.phases.map((phase) => (
                <div key={phase.name}>
                  <div className="small">{phase.name}</div>
                  <div className="progress">
                    <span style={{ width: `${phase.progress}%`, background: brand }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {next ? (
            <p>
              {t('portal.nextMilestone')} : <strong>{next.name}</strong> — <DateText value={next.plannedOn} />
            </p>
          ) : null}
        </section>
        <section className="card stack">
          <h2>{t('portal.invoices')}</h2>
          {view.invoices.length ? (
            view.invoices.map((invoice) => (
              <div key={invoice.id} className="alert-row">
                <span className="grow">
                  <strong>{invoice.number}</strong> · <DateText value={invoice.issuedOn} />
                  <div className="small muted">
                    <Money minor={invoice.net} currency={invoice.currency} />
                  </div>
                </span>
                {invoice.balance > 0 ? (
                  <>
                    <strong>
                      <Money minor={invoice.balance} currency={invoice.currency} />
                    </strong>
                    {view.canPay ? (
                      <button
                        type="button"
                        className="btn small"
                        disabled={busy}
                        onClick={async () => {
                          const result = await run(() => portalPay({ data: { token, invoiceId: invoice.id } }), { reload: false });
                          if (result) window.location.href = result.checkoutUrl;
                        }}
                      >
                        {t('portal.pay')}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <Badge tone="ok">{t('portal.paid')}</Badge>
                )}
              </div>
            ))
          ) : (
            <Empty />
          )}
          {due.length && !view.canPay ? <p className="muted small">{t('portal.payUnavailable')}</p> : null}
          <ErrorText error={error} />
        </section>
      </div>
      <section className="card stack" style={{ marginTop: '1rem' }}>
        <h2>{t('portal.photos')}</h2>
        {view.photos.length ? (
          <div className="photo-grid">
            {view.photos.map((photo) => (
              <a key={photo.id} href={`/api/portal/${token}/file/${photo.id}`} target="_blank" rel="noreferrer">
                <img src={`/api/portal/${token}/file/${photo.id}`} alt={photo.note ?? ''} loading="lazy" />
              </a>
            ))}
          </div>
        ) : (
          <Empty text={t('portal.noPhotos')} />
        )}
      </section>
      <div className="grid-2" style={{ marginTop: '1rem' }}>
        <section className="card stack">
          <h2>{t('portal.milestones')}</h2>
          {view.milestones.map((milestone) => (
            <div key={milestone.id} className="alert-row">
              <span className="grow">
                {milestone.name}
                <div className="small muted">
                  <DateText value={milestone.actualOn ?? milestone.plannedOn} />
                </div>
              </span>
              {milestone.validatedAt ? (
                <Badge tone="ok">{t('portal.validated', { date: new Date(milestone.validatedAt).toLocaleDateString() })}</Badge>
              ) : milestone.clientValidation ? (
                <form
                  className="row"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await run(() => portalValidate({ data: { token, milestoneId: milestone.id, signer } }));
                  }}
                >
                  <input value={signer} onChange={(event) => setSigner(event.target.value)} placeholder={t('portal.signerName')} required minLength={2} style={{ maxWidth: 200 }} />
                  <button className="btn small" disabled={busy}>
                    {t('portal.validate')}
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </section>
        <section className="card stack">
          <h2>{t('portal.documents')}</h2>
          {view.documents.length ? (
            view.documents.map((document) => (
              <div key={document.id} className="alert-row">
                <span className="grow">{document.title}</span>
                {document.hasFile ? (
                  <a className="btn secondary small" href={`/api/portal/${token}/file/${document.id}`} target="_blank" rel="noreferrer">
                    {t('app.download')}
                  </a>
                ) : null}
              </div>
            ))
          ) : (
            <Empty text={t('portal.noDocuments')} />
          )}
        </section>
      </div>
      <section className="card stack" style={{ marginTop: '1rem' }}>
        <h2>{t('portal.messages')}</h2>
        {view.messages.map((message, index) => (
          <div key={index} className={`message ${message.authorKind === 'client' ? 'mine' : ''}`}>
            <div className="small muted">
              {message.authorName} · <DateText value={message.at} time />
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div>
          </div>
        ))}
        <form
          className="row"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const body = String(new FormData(form).get('body') ?? '');
            const done = await run(() => portalMessage({ data: { token, body } }));
            if (done) form.reset();
          }}
        >
          <input name="body" required placeholder={t('messages.placeholder')} style={{ flex: 1 }} />
          <button className="btn" disabled={busy}>
            {t('messages.send')}
          </button>
        </form>
      </section>
      <p className="muted small" style={{ textAlign: 'center', marginTop: '2rem' }}>
        {t('portal.poweredBy')}
      </p>
    </div>
  );
}
