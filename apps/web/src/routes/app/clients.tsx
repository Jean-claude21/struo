import { can } from '@struo/core/permissions';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { Gauge } from '@/components/charts.tsx';
import { Avatar, Drawer, PageHeader, Progress } from '@/components/kit.tsx';
import { DataTable, type Column } from '@/components/views/DataTable.tsx';
import { applyView, useViewState, type FieldDef } from '@/components/views/engine.ts';
import { ViewToolbar } from '@/components/views/Toolbar.tsx';
import { DialogButton, Empty, ErrorText, Field, FormButtons, formData, formatMoney, orNull, useAction } from '@/components/ui.tsx';
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
        <Field label={t('clientInvite.contactName')}>
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
  const { t, locale } = useI18n();
  const data = Route.useLoaderData();
  const canWrite = can(data.role, 'clients.write');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const view = useViewState('clients', { mode: 'table', sort: { key: 'risk', dir: -1 } });
  const money = (minor: number) => formatMoney(locale, minor, data.currency);
  const riskOf = (id: string) => data.risk.find((item) => item.clientId === id) ?? null;
  const balanceOf = (id: string) => {
    const sites = data.projects.filter((project) => project.clientId === id).map((project) => project.id);
    return data.invoices.filter((invoice) => sites.includes(invoice.projectId)).reduce((sum, invoice) => sum + invoice.balanceMinor, 0);
  };
  type Row = ClientRow;
  const fields: FieldDef<Row>[] = [
    { key: 'name', label: t('clientInvite.contactName'), type: 'text', get: (row) => row.name },
    { key: 'kind', label: t('clients.kind'), type: 'enum', groupable: true, get: (row) => row.kind, options: KINDS.map((kind) => ({ value: kind, label: t(`clients.kinds.${kind}`) })) },
    { key: 'projects', label: t('clients.projects'), type: 'number', get: (row) => row.projects },
    { key: 'balance', label: t('fin.balance'), type: 'money', get: (row) => balanceOf(row.id) },
    { key: 'risk', label: t('today.risk'), type: 'number', get: (row) => riskOf(row.id)?.score ?? 0 },
  ];
  const rows = applyView(data.clients, fields, view.state);
  const tone = (score: number) => (score >= 60 ? 'bad' : score >= 30 ? 'warn' : 'ok');
  const columns: Column<Row>[] = [
    { key: 'name', label: t('clientInvite.contactName'), width: 240, cell: (row) => <span className="row tight nowrap"><Avatar name={row.name} /><b className="trunc">{row.name}</b></span> },
    { key: 'kind', label: t('clients.kind'), width: 150, cell: (row) => t(`clients.kinds.${row.kind}`) },
    { key: 'phone', label: t('app.phone'), width: 160, cell: (row) => row.phone ?? '—' },
    { key: 'email', label: t('app.email'), width: 220, cell: (row) => row.email ?? '—' },
    { key: 'projects', label: t('clients.projects'), width: 90, align: 'right', cell: (row) => row.projects },
    { key: 'balance', label: t('fin.balance'), width: 150, align: 'right', cell: (row) => (balanceOf(row.id) ? <b>{money(balanceOf(row.id))}</b> : '—') },
    { key: 'risk', label: t('today.risk'), width: 170, cell: (row) => { const risk = riskOf(row.id); return risk ? <span className="row nowrap tight"><Progress value={risk.score} tone={tone(risk.score)} label={false} /><b className="num" style={{ width: 30 }}>{risk.score}</b></span> : '—'; } },
  ];
  const current = data.clients.find((client) => client.id === openId) ?? null;
  const risk = current ? riskOf(current.id) : null;
  const sites = current ? data.projects.filter((project) => project.clientId === current.id) : [];
  const unpaid = current ? data.invoices.filter((invoice) => sites.some((site) => site.id === invoice.projectId)) : [];
  return (
    <div className="stack loose">
      <PageHeader title={t('clients.title')} text={t('views.count', { n: data.clients.length })}>
        {canWrite ? <DialogButton label={t('clients.new')} title={t('clients.new')}>{(close) => <ClientForm onDone={close} onCancel={close} />}</DialogButton> : null}
      </PageHeader>
      <div>
        <ViewToolbar rows={data.clients} fields={fields} state={view.state} update={view.update} columns saved={view.saved} onSave={view.saveView} onRemoveSaved={view.removeView} />
        <DataTable rows={rows} columns={columns} fields={fields} state={view.state} update={view.update} rowId={(row) => row.id} onRowClick={(row) => { setEditing(false); setOpenId(row.id); }}
          empty={<div className="card"><Empty text={t('clients.noClients')} /></div>} />
      </div>
      <Drawer open={Boolean(current)} onClose={() => setOpenId(null)} title={current?.name ?? ''}>
        {current ? (
          editing ? <ClientForm client={current} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} /> : (
            <div className="stack loose">
              <div className="row">
                <span className="badge">{t(`clients.kinds.${current.kind}`)}</span>
                {canWrite ? <button type="button" className="btn ghost small" onClick={() => setEditing(true)}>{t('app.edit')}</button> : null}
              </div>
              <div className="row">
                {current.phone ? <a className="btn secondary small" href={`tel:${current.phone.replace(/\s/gu, '')}`}><Phone size={14} />{current.phone}</a> : null}
                {current.phone ? <a className="btn secondary small" href={`https://wa.me/${current.phone.replace(/[^\d]/gu, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={14} />WhatsApp</a> : null}
                {current.email ? <a className="btn secondary small" href={`mailto:${current.email}`}><Mail size={14} />{current.email}</a> : null}
              </div>
              {risk ? (
                <div className="card row nowrap" style={{ gap: '1rem' }}>
                  <Gauge value={risk.score} label={t('today.risk')} size={140} />
                  <div className="stack small" style={{ gap: '.3rem' }}>
                    <b>{t('today.risk')}</b>
                    <span className="muted">{t('cli.overdue', { amount: money(risk.overdueMinor), days: risk.maxOverdueDays })}</span>
                    <span className="muted">{t('cli.gap', { n: risk.gap })}</span>
                    <span className="faint xsmall">{t('today.riskSub')}</span>
                  </div>
                </div>
              ) : null}
              <div className="stack" style={{ gap: '.4rem' }}>
                <b>{t('clients.projects')}</b>
                {sites.map((site) => (
                  <Link key={site.id} to="/app/projects/$projectId" params={{ projectId: site.id }} className="site-card" style={{ textDecoration: 'none' }}>
                    <span className="grow"><b>{site.code}</b> {site.name}<Progress value={site.progressPct} /></span>
                  </Link>
                ))}
              </div>
              {unpaid.length ? (
                <div className="stack" style={{ gap: '.4rem' }}>
                  <b>{t('finance.receivables')}</b>
                  {unpaid.map((invoice) => (
                    <Link key={invoice.id} to="/app/finance" search={{ invoice: invoice.id }} className="row nowrap small" style={{ borderBottom: '1px solid var(--divider)', padding: '.4rem 0', color: 'inherit', textDecoration: 'none' }}>
                      <span className="grow">{invoice.number}</span>{invoice.overdueDays > 0 ? <span className="badge bad">{t('ui.lateDays', { n: invoice.overdueDays })}</span> : null}<b className="num">{money(invoice.balanceMinor)}</b>
                    </Link>
                  ))}
                </div>
              ) : null}
              {current.address ? <p className="muted small" style={{ margin: 0 }}>{current.address}</p> : null}
              {current.notes ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{current.notes}</p> : null}
            </div>
          )
        ) : null}
      </Drawer>
    </div>
  );
}
