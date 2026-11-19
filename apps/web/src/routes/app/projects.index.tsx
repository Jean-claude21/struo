import { can } from '@struo/core/permissions';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { CalendarRange, FolderOpen, HardHat, Kanban, LayoutGrid, Table2 } from 'lucide-react';
import { EndHint } from '@/components/SiteBits.tsx';
import { Avatar, MenuItem, PageHeader, Progress as Bar, StatusChip, useToast, type Shape } from '@/components/kit.tsx';
import { Board } from '@/components/views/Board.tsx';
import { DataTable, type Column } from '@/components/views/DataTable.tsx';
import { applyView, useViewState, type FieldDef } from '@/components/views/engine.ts';
import { ViewToolbar } from '@/components/views/Toolbar.tsx';
import { useState } from 'react';
import { Badge, DateText, DialogButton, Empty, ErrorText, Field, FormButtons, formData, formatMoney, orNull, parseMoney, useAction } from '@/components/ui.tsx';
import { createClient, createProject, getProjects, importProjects, updateProject } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

type Search = { q?: string; status?: string; new?: string };

export const Route = createFileRoute('/app/projects/')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    status: typeof search.status === 'string' ? search.status : undefined,
    ...(typeof search.new === 'string' ? { new: search.new } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getProjects({ data: deps }),
  component: Projects,
});

const STATUSES = ['pending', 'active', 'suspended', 'done'] as const;

function Projects() {
  const { t, locale } = useI18n();
  const data = Route.useLoaderData();
  const router = useRouter();
  const toast = useToast();
  const canWrite = can(data.role, 'projects.write');
  const search = Route.useSearch();
  const view = useViewState('projects', { mode: 'grid' });
  const money = (minor: number, currency: string) => formatMoney(locale, minor, currency);
  const statusShape: Record<string, Shape> = { pending: 'todo', active: 'progress', suspended: 'blocked', done: 'done' };
  type Row = (typeof data.projects)[number];
  const fields: FieldDef<Row>[] = [
    { key: 'name', label: t('projects.name'), type: 'text', get: (row) => `${row.code} ${row.name}` },
    { key: 'status', label: t('app.status'), type: 'enum', groupable: true, get: (row) => row.status, options: STATUSES.map((status) => ({ value: status, label: t(`status.${status}`) })) },
    { key: 'type', label: t('projects.type'), type: 'enum', groupable: true, get: (row) => row.typeName ?? '' },
    { key: 'client', label: t('projects.client'), type: 'enum', groupable: true, get: (row) => row.clientName ?? '' },
    { key: 'health', label: t('projects.health'), type: 'enum', groupable: true, get: (row) => row.health, options: (['healthy', 'weak', 'critical'] as const).map((value) => ({ value, label: t(`status.${value}`) })) },
    { key: 'progress', label: t('projects.progress'), type: 'number', get: (row) => row.progressPct },
    { key: 'budget', label: t('projects.budget'), type: 'money', get: (row) => row.budgetMinor },
    { key: 'end', label: t('projects.end'), type: 'date', get: (row) => row.endDate, filterable: false },
  ];
  const rows = applyView(data.projects, fields, view.state);
  const open = (row: Row) => void router.navigate({ to: '/app/projects/$projectId', params: { projectId: row.id } });
  /** Saves a change made in the table, with « undo ». */
  const patch = async (row: Row, next: Record<string, unknown>, before: Record<string, unknown>) => {
    try {
      await updateProject({ data: { id: row.id, patch: next } });
      await router.invalidate();
      toast({ text: t('views.saved', { name: row.code }), action: { label: t('ui.undo'), run: async () => { await updateProject({ data: { id: row.id, patch: before } }); await router.invalidate(); } } });
    } catch { toast({ text: t('errors.generic'), kind: 'err' }); }
  };
  const columns: Column<Row>[] = [
    { key: 'name', label: t('projects.name'), width: 280, cell: (row) => <span><b>{row.code}</b> {row.name}</span> },
    { key: 'status', label: t('app.status'), width: 140, cell: (row) => <StatusChip shape={statusShape[row.status] ?? 'todo'} label={t(`status.${row.status}`)} />,
      edit: canWrite ? (row, close) => (
        <>
          {STATUSES.map((status) => (
            <MenuItem key={status} checked={row.status === status} onSelect={() => { close(); if (status !== row.status) void patch(row, { status }, { status: row.status }); }}>
              <StatusChip shape={statusShape[status] ?? 'todo'} label={t(`status.${status}`)} />
            </MenuItem>
          ))}
        </>
      ) : undefined },
    { key: 'type', label: t('projects.type'), width: 140, cell: (row) => row.typeName ?? '—' },
    { key: 'client', label: t('projects.client'), width: 180, cell: (row) => row.clientName ?? '—' },
    { key: 'progress', label: t('projects.progress'), width: 170, cell: (row) => <Bar value={row.progressPct} /> },
    { key: 'health', label: t('projects.health'), width: 120, cell: (row) => <Badge tone={row.health}>{t(`status.${row.health}`)}</Badge> },
    { key: 'budget', label: t('projects.budget'), width: 160, align: 'right', cell: (row) => money(row.budgetMinor, row.currencyCode) },
    { key: 'end', label: t('projects.end'), width: 130, cell: (row) => <DateText value={row.endDate} /> },
  ];
  return (
    <div className="stack loose">
      <PageHeader title={t('projects.title')} text={t('views.count', { n: data.projects.length })}>
        {canWrite ? (<><ImportDialog /><NewProjectDialog data={data} defaultOpen={search.new === '1'} /></>) : null}
      </PageHeader>
      <div>
        <ViewToolbar rows={data.projects} fields={fields} state={view.state} update={view.update} columns={view.state.mode === 'table'} group={view.state.mode === 'table'}
          saved={view.saved} onSave={view.saveView} onRemoveSaved={view.removeView} onRenameSaved={view.renameView}
          modes={[{ value: 'grid', label: t('views.grid'), icon: LayoutGrid }, { value: 'table', label: t('views.table'), icon: Table2 }, { value: 'board', label: t('views.board'), icon: Kanban }]} />
        {view.state.mode === 'table' ? (
          <DataTable rows={rows} columns={columns} fields={fields} state={view.state} update={view.update} rowId={(row) => row.id} onRowClick={open}
            onRename={canWrite ? (row, name) => patch(row, { name }, { name: row.name }) : undefined} renameOf={(row) => row.name}
            rowMenu={(row, close) => (
              <>
                <MenuItem icon={FolderOpen} onSelect={() => { close(); open(row); }}>{t('plan.openSite')}</MenuItem>
                <MenuItem icon={CalendarRange} onSelect={() => { close(); void router.navigate({ to: '/app/planning' }); }}>{t('shell.planning')}</MenuItem>
                {canWrite ? STATUSES.filter((status) => status !== row.status).map((status) => (
                  <MenuItem key={status} onSelect={() => { close(); void patch(row, { status }, { status: row.status }); }}>{t('views.setStatus', { status: t(`status.${status}`) })}</MenuItem>
                )) : null}
              </>
            )} />
        ) : view.state.mode === 'board' ? (
          <Board rows={rows} rowId={(row) => row.id} columnOf={(row) => row.status} onOpen={open}
            columns={STATUSES.map((status) => ({ key: status, label: t(`status.${status}`), icon: <StatusChip shape={statusShape[status]!} label="" /> }))}
            collapsed={view.state.collapsed} onCollapsedChange={(keys) => view.update({ collapsed: keys })} canDrag={() => canWrite}
            onMove={async (row, to) => {
              try {
                await updateProject({ data: { id: row.id, patch: { status: to } } });
                toast({ text: t('views.moved', { name: row.code, column: t(`status.${to as 'active'}`) }) });
                await router.invalidate();
              } catch { toast({ text: t('errors.generic'), kind: 'err' }); }
            }}
            renderCard={(row) => (
              <>
                {data.covers[row.id] ? <img className="k-thumb" src={`/api/files/photo/${data.covers[row.id]}`} alt="" loading="lazy" /> : null}
                <span className="k-key">{row.code}</span>
                <div className="k-title">{row.name}</div>
                <Bar value={row.progressPct} />
                <div className="k-meta"><span className="trunc">{row.clientName ?? ''}</span><Badge tone={row.health}>{t(`status.${row.health}`)}</Badge></div>
              </>
            )} />
        ) : rows.length ? (
          <div className="grid-3">
            {rows.map((row) => (
              <Link key={row.id} to="/app/projects/$projectId" params={{ projectId: row.id }} className="panel" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="pc-cover">
                  {data.covers[row.id] ? <img src={`/api/files/photo/${data.covers[row.id]}`} alt="" loading="lazy" /> : <HardHat size={40} style={{ color: 'var(--brand)' }} />}
                  <span className="badge" style={{ position: 'absolute', top: 10, left: 10, background: 'var(--surface)' }}><StatusChip shape={statusShape[row.status] ?? 'todo'} label={t(`status.${row.status}`)} /></span>
                </div>
                <div className="stack" style={{ padding: '.85rem 1rem', gap: '.4rem' }}>
                  <span className="k-key">{row.code}{row.typeName ? ` · ${row.typeName}` : ''}</span>
                  <b className="trunc">{row.name}</b>
                  <span className="muted small trunc">{row.clientName ?? '—'}{row.location ? ` · ${row.location}` : ''}</span>
                  <div className="pc-bars">
                    <span className="xsmall muted">{t('cards.works')}</span><Bar value={row.progressPct} />
                    <span className="xsmall muted">{t('cards.collected')}</span><Bar value={row.collectedPct} tone={row.collectedPct + 15 < row.progressPct ? 'warn' : 'ok'} />
                  </div>
                  <div className="row nowrap small">
                    <span className="muted grow trunc">{money(row.budgetMinor, row.currencyCode)}</span>
                    <EndHint row={row} />
                  </div>
                  <div className="row nowrap small" style={{ borderTop: '1px solid var(--line)', paddingTop: '.5rem' }}>
                    {row.managerName ? <><Avatar name={row.managerName} /><span className="grow trunc muted">{row.managerName}</span></> : <span className="grow" />}
                    <Badge tone={row.health}>{t(`status.${row.health}`)}</Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : <div className="card"><Empty text={t('projects.noProjects')} /></div>}
      </div>
    </div>
  );
}

type ProjectsData = Awaited<ReturnType<typeof getProjects>>;

function NewProjectDialog({ data, defaultOpen }: { data: ProjectsData; defaultOpen?: boolean }) {
  const { t } = useI18n();
  const { run, error, busy, setError } = useAction();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState('');
  return (
    <DialogButton label={t('projects.new')} title={t('projects.new')} defaultOpen={defaultOpen}>
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
