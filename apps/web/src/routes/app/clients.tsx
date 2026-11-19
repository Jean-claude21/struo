import { can } from '@struo/core/permissions';
import { createFileRoute, Link } from '@tanstack/react-router';
import { DialogButton, Empty, ErrorText, Field, FormButtons, formData, orNull, useAction } from '@/components/ui.tsx';
import { createClient, getClients, updateClient } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/clients')({
  loader: () => getClients(),
  component: Clients,
});

const KINDS = ['individual', 'company', 'public'] as const;
type ClientRow = Awaited<ReturnType<typeof getClients>>['clients'][number];

function ClientForm({ client, onDone, onCancel }: { client?: ClientRow; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const { run, error, busy } = useAction();
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const v = formData(event.currentTarget);
        const payload = { name: v.name, kind: v.kind, email: orNull(v.email), phone: orNull(v.phone), address: orNull(v.address), notes: orNull(v.notes) };
        const done = await run(async () => {
          if (client) await updateClient({ data: { id: client.id, patch: payload } });
          else await createClient({ data: payload });
        });
        if (done) onDone();
      }}
    >
      <div className="form-grid">
        <Field label={t('app.name')}>
          <input name="name" defaultValue={client?.name} required maxLength={200} />
        </Field>
        <Field label={t('clients.kind')}>
          <select name="kind" defaultValue={client?.kind ?? 'individual'}>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`clients.kinds.${kind}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('app.email')} hint={t('app.optional')}>
          <input name="email" type="email" defaultValue={client?.email ?? ''} />
        </Field>
        <Field label={t('app.phone')} hint="+228…">
          <input name="phone" type="tel" defaultValue={client?.phone ?? ''} />
        </Field>
      </div>
      <Field label={t('clients.address')} hint={t('app.optional')}>
        <input name="address" defaultValue={client?.address ?? ''} />
      </Field>
      <Field label={t('app.note')} hint={t('app.optional')}>
        <textarea name="notes" defaultValue={client?.notes ?? ''} />
      </Field>
      <ErrorText error={error} />
      <FormButtons onCancel={onCancel} busy={busy} />
    </form>
  );
}

function Clients() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const canWrite = can(data.role, 'clients.write');
  return (
    <div className="stack">
      <div className="topbar">
        <h1>{t('clients.title')}</h1>
        {canWrite ? <DialogButton label={t('clients.new')} title={t('clients.new')}>{(close) => <ClientForm onDone={close} onCancel={close} />}</DialogButton> : null}
      </div>
      <section className="card table-wrap">
        {data.clients.length ? (
          <table>
            <thead>
              <tr>
                <th>{t('app.name')}</th>
                <th>{t('clients.kind')}</th>
                <th>{t('app.email')}</th>
                <th>{t('app.phone')}</th>
                <th>{t('clients.projects')}</th>
                {canWrite ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {data.clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <Link to="/app/projects" search={{ q: client.name }}>
                      <strong>{client.name}</strong>
                    </Link>
                  </td>
                  <td>{t(`clients.kinds.${client.kind}`)}</td>
                  <td>{client.email ?? '—'}</td>
                  <td>{client.phone ?? '—'}</td>
                  <td>{client.projects}</td>
                  {canWrite ? (
                    <td className="right">
                      <DialogButton label={t('app.edit')} title={client.name} secondary small>
                        {(close) => <ClientForm client={client} onDone={close} onCancel={close} />}
                      </DialogButton>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty text={t('clients.noClients')} />
        )}
      </section>
    </div>
  );
}
