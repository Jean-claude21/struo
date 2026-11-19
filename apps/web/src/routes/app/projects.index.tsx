import { can } from '@struo/core/permissions';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Badge, DialogButton, Empty, ErrorText, Field, FormButtons, formData, orNull, parseMoney, Progress, useAction } from '@/components/ui.tsx';
import { createClient, createProject, getProjects, importProjects } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

type Search = { q?: string; status?: string };

export const Route = createFileRoute('/app/projects/')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    status: typeof search.status === 'string' ? search.status : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getProjects({ data: deps }),
  component: Projects,
});

const STATUSES = ['pending', 'active', 'suspended', 'done'] as const;

function Projects() {
  const { t, locale } = useI18n();
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: '/app/projects/' });
  const canWrite = can(data.role, 'projects.write');
  return (
    <div className="stack">
      <div className="topbar">
        <h1>{t('projects.title')}</h1>
        {canWrite ? (
          <div className="row">
            <ImportDialog />
            <NewProjectDialog data={data} />
          </div>
        ) : null}
      </div>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          const v = formData(event.currentTarget);
          void navigate({ search: { q: v.q || undefined, status: v.status || undefined } });
        }}
      >
        <input name="q" defaultValue={search.q ?? ''} placeholder={t('app.search')} style={{ maxWidth: 320 }} />
        <select name="status" defaultValue={search.status ?? ''} style={{ maxWidth: 200 }}>
          <option value="">{t('app.all')}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>
        <button className="btn secondary">{t('app.search').replace('…', '')}</button>
      </form>
      {data.projects.length ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('projects.code')}</th>
                <th>{t('projects.name')}</th>
                <th>{t('projects.type')}</th>
                <th>{t('projects.client')}</th>
                <th>{t('app.status')}</th>
                <th>{t('projects.progress')}</th>
                <th>{t('projects.collected')}</th>
                <th>{t('projects.health')}</th>
                <th className="right">{t('projects.budget')}</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link to="/app/projects/$projectId" params={{ projectId: project.id }}>
                      <strong>{project.code}</strong>
                    </Link>
                  </td>
                  <td>
                    <Link to="/app/projects/$projectId" params={{ projectId: project.id }}>
                      {project.name}
                    </Link>
                    {project.location ? <div className="muted small">{project.location}</div> : null}
                  </td>
                  <td>{project.typeName ?? '—'}</td>
                  <td>{project.clientName ?? '—'}</td>
                  <td>
                    <Badge tone={project.status}>{t(`status.${project.status}`)}</Badge>
                  </td>
                  <td style={{ minWidth: 120 }}>
                    <Progress value={project.progressPct} />
                  </td>
                  <td>{project.collectedPct} %</td>
                  <td>
                    <Badge tone={project.health}>{t(`status.${project.health}`)}</Badge>
                  </td>
                  <td className="right nowrap">
                    {new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { style: 'currency', currency: project.currencyCode, maximumFractionDigits: 0 }).format(project.budgetMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <Empty text={t('projects.noProjects')} />
        </div>
      )}
    </div>
  );
}

type ProjectsData = Awaited<ReturnType<typeof getProjects>>;

function NewProjectDialog({ data }: { data: ProjectsData }) {
  const { t } = useI18n();
  const { run, error, busy, setError } = useAction();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState('');
  return (
    <DialogButton label={t('projects.new')} title={t('projects.new')}>
      {(close) => (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const v = formData(event.currentTarget);
            const budgetMinor = v.budget ? parseMoney(v.budget, data.currency) : 0;
            if (budgetMinor === null) return setError(t('errors.invalid_amount'));
            let client = orNull(clientId);
            if (clientId === '__new' && v.newClient) {
              const created = await run(() => createClient({ data: { name: v.newClient } }), { reload: false });
              if (!created) return;
              client = created.id;
            } else if (clientId === '__new') client = null;
            const result = await run(() =>
              createProject({
                data: {
                  code: v.code || undefined, name: v.name, typeId: orNull(v.typeId), clientId: client, managerId: orNull(v.managerId),
                  location: orNull(v.location), startDate: orNull(v.startDate), endDate: orNull(v.endDate), status: v.status, budgetMinor,
                },
              }),
            );
            if (result) {
              close();
              void navigate({ to: '/app/projects/$projectId', params: { projectId: result.id } });
            }
          }}
        >
          <div className="form-grid">
            <Field label={t('projects.name')}>
              <input name="name" required maxLength={200} />
            </Field>
            <Field label={t('projects.code')} hint={t('projects.codeAuto')}>
              <input name="code" maxLength={30} />
            </Field>
            <Field label={t('projects.type')}>
              <select name="typeId" defaultValue={data.configuration.projectTypes[0]?.id ?? ''}>
                <option value="">{t('app.none')}</option>
                {data.configuration.projectTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('projects.client')}>
              <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
                <option value="">{t('app.none')}</option>
                {data.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
                <option value="__new">+ {t('projects.newClient')}</option>
              </select>
            </Field>
            {clientId === '__new' ? (
              <Field label={t('projects.newClient')}>
                <input name="newClient" maxLength={200} />
              </Field>
            ) : null}
            <Field label={t('projects.manager')}>
              <select name="managerId" defaultValue="">
                <option value="">{t('app.none')}</option>
                {data.members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('app.status')}>
              <select name="status" defaultValue="active">
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`status.${status}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`${t('projects.budget')} (${data.currency})`}>
              <input name="budget" inputMode="decimal" />
            </Field>
            <Field label={t('projects.location')}>
              <input name="location" maxLength={200} />
            </Field>
            <Field label={t('projects.start')}>
              <input name="startDate" type="date" />
            </Field>
            <Field label={t('projects.end')}>
              <input name="endDate" type="date" />
            </Field>
          </div>
          <ErrorText error={error} />
          <FormButtons onCancel={close} busy={busy} submitLabel={t('app.create')} />
        </form>
      )}
    </DialogButton>
  );
}

function ImportDialog() {
  const { t } = useI18n();
  const { run, error, busy } = useAction();
  const [result, setResult] = useState<{ created: number; errors: { line: number; code: string }[] } | null>(null);
  return (
    <DialogButton label={t('projects.import')} title={t('projects.import')} secondary>
      {(close) => (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const file = (event.currentTarget.elements.namedItem('file') as HTMLInputElement).files?.[0];
            if (!file) return;
            const csv = await file.text();
            const done = await run(() => importProjects({ data: { csv } }));
            if (done) setResult(done);
          }}
        >
          <p className="small muted">{t('projects.importHelp')}</p>
          <input name="file" type="file" accept=".csv,text/csv" required />
          {result ? (
            <div className="notice ok">
              {t('projects.imported', { n: result.created })}
              {result.errors.length ? (
                <div className="error">{t('projects.importErrors', { lines: result.errors.map((e) => `${e.line} (${t(`errors.${e.code as 'generic'}`)})`).join(', ') })}</div>
              ) : null}
            </div>
          ) : null}
          <ErrorText error={error} />
          <FormButtons onCancel={close} busy={busy} submitLabel={t('projects.import')} />
        </form>
      )}
    </DialogButton>
  );
}
