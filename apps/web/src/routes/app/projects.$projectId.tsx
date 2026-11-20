import { can, sees } from '@struo/core/permissions';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { DocumentDialog, ExpenseDialog, InvoiceDialog, MilestoneDialog, PaymentDialog, ReminderDialog, ReportCard } from '@/components/forms.tsx';
import { Badge, DateText, Empty, ErrorText, Field, formData, formatMoney, Kpi, Money, parseMoney, Progress, Tabs, useAction } from '@/components/ui.tsx';
import {
  addPhase, archiveProject, createPortalLink, getProjectPage, postMessage, removePhase, resolveIncident, revokePortalLink,
  updateDocument, updateMilestone, updatePhase, updateProject,
} from '@/features/office/server.ts';
import { DocumentRows, InvoiceTable, MilestoneRows } from '@/components/tables.tsx';
import { ClientTab } from '@/components/ClientInvite.tsx';
import { Donut, HBars } from '@/components/charts.tsx';
import { KpiTile, Panel, Progress as Bar, StatusChip } from '@/components/kit.tsx';
import { EndHint } from '@/components/SiteBits.tsx';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';
import { NotesThread, TaskBoard } from '@/components/Work.tsx';

export const Route = createFileRoute('/app/projects/$projectId')({
  loader: ({ params }) => getProjectPage({ data: { id: params.projectId } }),
  component: ProjectPage,
});

type Tab = 'overview' | 'work' | 'field' | 'finance' | 'expenses' | 'documents' | 'planning' | 'portal' | 'messages';
type Data = Awaited<ReturnType<typeof getProjectPage>>;

function ProjectPage() {
  const { t, locale } = useI18n();
  const data = Route.useLoaderData();
  const { project } = data;
  const [tab, setTab] = useState<Tab>('overview');
  const tabs: Tab[] = ['overview', 'work', 'field', ...(sees(data.role, 'finance') ? (['finance'] as Tab[]) : []), 'expenses', 'documents', 'planning', 'portal', 'messages'];
  const cover = data.reports.flatMap((report) => report.photos)[0];
  const client = data.clients.find((candidate) => candidate.id === project.clientId) ?? null;
  const money = (minor: number) => formatMoney(locale, minor, project.currencyCode);
  const statusShape = project.status === 'done' ? 'done' : project.status === 'suspended' ? 'blocked' : project.status === 'active' ? 'progress' : 'todo';
  return (
    <div className="stack">
      <div className={`cover ${cover ? '' : 'plain'}`} style={cover ? { height: 210 } : undefined}>
        {cover ? <img src={`/api/files/photo/${cover.id}`} alt="" /> : null}
        <div className="c-over">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small" style={{ opacity: .85 }}>{project.code}{project.location ? ` · ${project.location}` : ''}</div>
              <h1 className="trunc">{project.name}</h1>
              <div className="row tight" style={{ marginTop: '.35rem' }}>
                <span className="badge" style={cover ? { background: 'rgba(255,255,255,.9)', color: '#2b2b2b' } : undefined}><StatusChip shape={statusShape} label={t(`status.${project.status}`)} /></span>
                {project.typeName ? <span className="badge" style={cover ? { background: 'rgba(255,255,255,.9)', color: '#2b2b2b' } : undefined}>{project.typeName}</span> : null}
                <Badge tone={project.health}>{t(`status.${project.health}`)}</Badge>
                {project.clientName ? <span className="small" style={{ opacity: .9 }}>{project.clientName}</span> : null}
              </div>
              {project.startDate && project.endDate ? (
                <div className="small" style={{ opacity: .9, marginTop: '.3rem' }}>
                  <DateText value={project.startDate} /> → <DateText value={project.endDate} />
                  {project.status !== 'done' ? <> · <EndHint row={project} /></> : null}
                  {project.managerName ? ` · ${t('cards.lead')} ${project.managerName}` : ''}
                </div>
              ) : null}
            </div>
            <div style={{ minWidth: 200 }} className="hide-m">
              <div className="small" style={{ opacity: .85 }}>{t('projects.progress')}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{project.progressPct} %</div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid kpi5">
        <KpiTile label={t('projects.budget')} value={money(project.budgetMinor)} sub={project.managerName ?? undefined} />
        {sees(data.role, 'finance') ? (
          <>
            <KpiTile label={t('dashboard.collected')} value={money(project.finance.collectedMinor)} sub={`${project.collectedPct} % · ${t('dashboard.invoiced')} ${project.finance.invoicedPct} %`} />
            <KpiTile label={t('expenses.spent')} value={money(project.finance.spentMinor)} sub={`${project.budgetMinor ? Math.round((project.finance.spentMinor / project.budgetMinor) * 100) : 0} % ${t('projects.budget').toLowerCase()}`} />
            <KpiTile label={t('dashboard.overdue')} value={money(project.finance.overdueMinor)} tone={project.finance.overdueMinor > 0 ? 'bad' : undefined} />
          </>
        ) : null}
        <KpiTile label={t('projects.compliance')} value={project.compliancePct === null ? '—' : `${project.compliancePct} %`} tone={(project.compliancePct ?? 100) < 75 ? 'bad' : undefined} />
      </div>
      <Tabs value={tab} onChange={setTab} items={tabs.map((value) => ({ value, label: value === 'portal' ? t('clientInvite.tab') : t(`projects.tabs.${value}`) }))} />
      {tab === 'overview' ? <Overview data={data} /> : null}
      {tab === 'work' ? (
        <div className="grid-main">
          <TaskBoard tasks={data.tasks} members={data.members} projectId={project.id} role={data.role} userId={data.userId} />
          <NotesThread projectId={project.id} notes={data.notes} />
        </div>
      ) : null}
      {tab === 'field' ? <FieldTab data={data} /> : null}
      {tab === 'finance' ? <FinanceTab data={data} /> : null}
      {tab === 'expenses' ? <ExpensesTab data={data} /> : null}
      {tab === 'documents' ? <DocumentsTab data={data} /> : null}
      {tab === 'planning' ? <PlanningTab data={data} /> : null}
      {tab === 'portal' ? (
        <ClientTab projectId={project.id} projectName={project.name} companyName={data.companyName} links={data.links} canManage={can(data.role, 'portal.manage')}
          client={client ? { name: client.name, email: client.email, phone: client.phone } : null} />
      ) : null}
      {tab === 'messages' ? <MessagesTab data={data} /> : null}
    </div>
  );
}

function Overview({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  const { project } = data;
  const canWrite = can(data.role, 'projects.write');
  const { run, error, busy, setError } = useAction();
  const money = (minor: number) => formatMoney(locale, minor, project.currencyCode);
  const journal = data.reports.slice(0, 6);
  const upcoming = data.milestones.filter((milestone) => milestone.status !== 'done').slice(0, 5);
  const openIncidents = data.incidents.filter((incident) => incident.status !== 'resolved');
  const photos = data.reports.flatMap((report) => report.photos);
  return (
    <div className="stack">
      <div className="grid-3">
        <Panel title={t('projects.progress')}>
          <div className="row nowrap" style={{ gap: '1rem' }}>
            <Donut size={130} thickness={14} label={`${project.progressPct} %`} segments={[{ value: project.progressPct, color: 'var(--brand)' }, { value: 100 - project.progressPct, color: 'transparent' }]}
              center={<b>{project.progressPct} %</b>} />
            <div className="stack grow" style={{ gap: '.45rem' }}>
              {project.phases.map((phase) => (
                <div key={phase.id} className="stack" style={{ gap: 2 }}>
                  <span className="xsmall muted">{phase.name}</span><Progress value={phase.progressPct} />
                </div>
              ))}
            </div>
          </div>
        </Panel>
        {sees(data.role, 'finance') ? (
          <Panel title={t('projects.budget')}>
            <HBars format={money} items={[
              { label: t('projects.budget'), value: project.budgetMinor, color: 'var(--ink-faint)' },
              { label: t('expenses.spent'), value: project.finance.spentMinor, color: 'var(--warn)' },
              { label: t('dashboard.invoiced'), value: project.finance.invoicedNetMinor, color: 'var(--info)' },
              { label: t('dashboard.collected'), value: project.finance.collectedMinor, color: 'var(--ok)' },
            ]} />
          </Panel>
        ) : null}
        <Panel title={t('projects.compliance')} sub={project.compliancePct === null ? '' : `${project.compliancePct} %`}>
          <div className="stack" style={{ gap: '.45rem' }}>
            {data.documents.filter((document) => document.required).map((document) => (
              <div key={document.id} className="row nowrap small"><span className="grow trunc">{document.title}</span>
                <StatusChip shape={document.status === 'valid' ? 'done' : document.status === 'pending' ? 'progress' : document.status === 'missing' ? 'todo' : 'late'} label={t(`documents.statuses.${document.status}`)} /></div>
            ))}
          </div>
        </Panel>
      </div>
      {journal.length ? (
        <Panel title={t('field.reports')}>
          <div className="timeline-v">
            {journal.map((report) => (
              <div key={report.id} className="tv-item" style={{ ['--c' as string]: report.status === 'validated' ? 'var(--ok)' : report.status === 'rejected' ? 'var(--bad)' : 'var(--brand)' }}>
                <div className="row tight small"><b>{report.authorName}</b><span className="faint"><DateText value={report.takenAt} time /></span>
                  {report.phaseName && report.progressPct !== null ? <span className="badge brand">{report.phaseName} {report.progressPct} %</span> : null}</div>
                {report.note ? <p style={{ margin: '.25rem 0' }}>{report.note}</p> : null}
                {report.photos.length ? (
                  <div className="row tight">{report.photos.slice(0, 4).map((photo) => (
                    <a key={photo.id} href={`/api/files/photo/${photo.id}`} target="_blank" rel="noreferrer"><img src={`/api/files/photo/${photo.id}`} alt="" style={{ width: 84, height: 64, objectFit: 'cover', borderRadius: 6 }} loading="lazy" /></a>
                  ))}</div>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
      <div className="grid-3">
        <Panel title={t('site.nextSteps')} sub={t('site.nextStepsSub')}>
          {upcoming.length ? (
            <div className="stack" style={{ gap: '.5rem' }}>
              {upcoming.map((milestone) => (
                <div key={milestone.id} className="row nowrap small">
                  <span className={`gx-ms-mini ${milestone.status === 'late' ? 'late' : 'pending'}`} aria-hidden />
                  <span className="grow trunc">{milestone.name}</span>
                  {milestone.status === 'late' ? <span className="badge bad">+{milestone.delayDays} j</span> : <span className="faint xsmall"><DateText value={milestone.plannedOn} /></span>}
                </div>
              ))}
            </div>
          ) : <p className="muted small" style={{ margin: 0 }}>{t('site.noNextSteps')}</p>}
        </Panel>
        <Panel title={t('field.incidents')} sub={t('site.openIncidents', { n: openIncidents.length })}>
          {openIncidents.length ? (
            <div className="stack" style={{ gap: '.5rem' }}>
              {openIncidents.slice(0, 4).map((incident) => (
                <div key={incident.id} className="stack" style={{ gap: 2 }}>
                  <span className="row tight small"><span className={`badge ${incident.priority === 'critical' ? 'bad' : incident.priority === 'important' ? 'warn' : ''}`}>{t(`field.priorities.${incident.priority}` as MessageKey)}</span>
                    <span className="faint xsmall"><DateText value={incident.createdAt} /></span></span>
                  <span className="small trunc">{incident.description}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted small" style={{ margin: 0 }}>{t('site.noIncidents')}</p>}
        </Panel>
        <Panel title={t('site.photos')} sub={t('site.photosSub', { n: photos.length })}>
          {photos.length ? (
            <div className="site-gallery">
              {photos.slice(0, 6).map((photo) => (
                <a key={photo.id} href={`/api/files/photo/${photo.id}`} target="_blank" rel="noreferrer"><img src={`/api/files/photo/${photo.id}`} alt="" loading="lazy" /></a>
              ))}
            </div>
          ) : <p className="muted small" style={{ margin: 0 }}>{t('site.noPhotos')}</p>}
        </Panel>
      </div>
      <section className="card">
        <h2>{t('projects.phases')}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('projects.phaseName')}</th>
                <th>{t('projects.phaseBudget')}</th>
                <th>{t('projects.progress')}</th>
                {canWrite ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {project.phases.map((phase) => (
                <tr key={phase.id}>
                  <td>{phase.name}</td>
                  <td>
                    {canWrite ? (
                      <input
                        defaultValue={phase.budgetMinor ? String(phase.budgetMinor / 10 ** (new Intl.NumberFormat('en', { style: 'currency', currency: project.currencyCode }).resolvedOptions().maximumFractionDigits ?? 0)) : ''}
                        inputMode="decimal"
                        style={{ maxWidth: 160 }}
                        onBlur={(event) => {
                          const value = event.target.value ? parseMoney(event.target.value, project.currencyCode) : 0;
                          if (value === null) return setError(t('errors.invalid_amount'));
                          if (value !== phase.budgetMinor) void run(() => updatePhase({ data: { id: phase.id, patch: { budgetMinor: value } } }));
                        }}
                      />
                    ) : (
                      <Money minor={phase.budgetMinor} currency={project.currencyCode} />
                    )}
                  </td>
                  <td style={{ minWidth: 220 }}>
                    {canWrite ? (
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          defaultValue={phase.progressPct}
                          onChange={(event) => {
                            const label = event.currentTarget.nextElementSibling;
                            if (label) label.textContent = `${event.currentTarget.value} %`;
                          }}
                          onMouseUp={(event) => void run(() => updatePhase({ data: { id: phase.id, patch: { progressPct: Number(event.currentTarget.value) } } }))}
                          onTouchEnd={(event) => void run(() => updatePhase({ data: { id: phase.id, patch: { progressPct: Number(event.currentTarget.value) } } }))}
                          onKeyUp={(event) => void run(() => updatePhase({ data: { id: phase.id, patch: { progressPct: Number(event.currentTarget.value) } } }))}
                          aria-label={phase.name}
                        />
                        <span className="small nowrap">{phase.progressPct} %</span>
                      </div>
                    ) : (
                      <Progress value={phase.progressPct} />
                    )}
                  </td>
                  {canWrite ? (
                    <td className="right">
                      <button type="button" className="btn ghost small" onClick={() => run(() => removePhase({ data: { id: phase.id } }))}>
                        {t('app.remove')}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canWrite ? (
          <form
            className="row"
            style={{ marginTop: '.75rem' }}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const v = formData(form);
              const done = await run(() => addPhase({ data: { projectId: project.id, name: v.name ?? '' } }));
              if (done !== undefined) form.reset();
            }}
          >
            <input name="name" placeholder={t('projects.phaseName')} required style={{ maxWidth: 260 }} />
            <button className="btn secondary small" disabled={busy}>
              {t('projects.addPhase')}
            </button>
          </form>
        ) : null}
        <ErrorText error={error} />
      </section>
      {canWrite ? <ProjectEdit data={data} /> : null}
    </div>
  );
}

function ProjectEdit({ data }: { data: Data }) {
  const { t } = useI18n();
  const { project } = data;
  const { run, error, busy, setError } = useAction();
  const decimals = new Intl.NumberFormat('en', { style: 'currency', currency: project.currencyCode }).resolvedOptions().maximumFractionDigits ?? 0;
  return (
    <section className="card">
      <h2>{t('app.edit')}</h2>
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const v = formData(event.currentTarget);
          const budgetMinor = v.budget ? parseMoney(v.budget, project.currencyCode) : 0;
          if (budgetMinor === null) return setError(t('errors.invalid_amount'));
          await run(() =>
            updateProject({
              data: {
                id: project.id,
                patch: {
                  name: v.name, code: v.code, status: v.status, typeId: v.typeId || null, clientId: v.clientId || null, managerId: v.managerId || null,
                  location: v.location || null, startDate: v.startDate || null, endDate: v.endDate || null, budgetMinor, description: v.description || null,
                },
              },
            }),
          );
        }}
      >
        <div className="form-grid">
          <Field label={t('projects.name')}>
            <input name="name" defaultValue={project.name} required />
          </Field>
          <Field label={t('projects.code')}>
            <input name="code" defaultValue={project.code} required />
          </Field>
          <Field label={t('app.status')}>
            <select name="status" defaultValue={project.status}>
              {(['pending', 'active', 'suspended', 'done'] as const).map((status) => (
                <option key={status} value={status}>
                  {t(`status.${status}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('projects.type')}>
            <select name="typeId" defaultValue={project.typeId ?? ''}>
              <option value="">{t('app.none')}</option>
              {data.configuration.projectTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('projects.client')}>
            <select name="clientId" defaultValue={project.clientId ?? ''}>
              <option value="">{t('app.none')}</option>
              {data.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('projects.manager')}>
            <select name="managerId" defaultValue={project.managerId ?? ''}>
              <option value="">{t('app.none')}</option>
              {data.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`${t('projects.budget')} (${project.currencyCode})`}>
            <input name="budget" defaultValue={project.budgetMinor ? String(project.budgetMinor / 10 ** decimals) : ''} inputMode="decimal" />
          </Field>
          <Field label={t('projects.location')}>
            <input name="location" defaultValue={project.location ?? ''} />
          </Field>
          <Field label={t('projects.start')}>
            <input name="startDate" type="date" defaultValue={project.startDate ?? ''} />
          </Field>
          <Field label={t('projects.end')}>
            <input name="endDate" type="date" defaultValue={project.endDate ?? ''} />
          </Field>
        </div>
        <Field label={t('projects.description')}>
          <textarea name="description" defaultValue={project.description ?? ''} />
        </Field>
        <ErrorText error={error} />
        <div className="pair">
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (!window.confirm(t('projects.archive'))) return;
              const done = await run(() => archiveProject({ data: { id: project.id } }), { reload: false });
              if (done !== undefined) window.location.href = '/app/projects';
            }}
          >
            {t('projects.archive')}
          </button>
          <button className="btn" disabled={busy}>
            {t('app.save')}
          </button>
        </div>
      </form>
    </section>
  );
}

function FieldTab({ data }: { data: Data }) {
  const { t } = useI18n();
  const { run, error } = useAction();
  const canReview = can(data.role, 'field.review');
  return (
    <div className="grid-2">
      <section className="stack">
        <h2>{t('field.reports')}</h2>
        {data.reports.length ? data.reports.map((report) => <ReportCard key={report.id} report={report} canReview={canReview} />) : <Empty text={t('field.noReports')} />}
      </section>
      <section className="card">
        <h2>{t('field.incidents')}</h2>
        {data.incidents.length ? (
          data.incidents.map((incident) => (
            <div key={incident.id} className="alert-row">
              <Badge tone={incident.status === 'open' ? incident.priority : 'ok'}>{t(`field.priorities.${incident.priority as 'info'}`)}</Badge>
              <div className="grow">
                <strong>{t(`field.kinds.${incident.kind as 'other'}`)}</strong> — {incident.description}
                <div className="muted small">
                  <DateText value={incident.createdAt} time /> · {incident.authorName}
                </div>
              </div>
              {incident.status === 'open' && canReview ? (
                <button type="button" className="btn secondary small" onClick={() => run(() => resolveIncident({ data: { id: incident.id } }))}>
                  {t('field.resolve')}
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <Empty />
        )}
        <ErrorText error={error} />
      </section>
    </div>
  );
}

function FinanceTab({ data }: { data: Data }) {
  const { t } = useI18n();
  const { project } = data;
  const canWrite = can(data.role, 'finance.write');
  return (
    <div className="stack">
      {canWrite ? (
        <div className="row">
          <InvoiceDialog projectId={project.id} />
          <PaymentDialog projectId={project.id} currency={project.currencyCode} invoices={data.invoices} />
        </div>
      ) : null}
      <InvoiceTable invoices={data.invoices} canWrite={canWrite} />
      <section className="card">
        <h2>{t('finance.payments')}</h2>
        {data.payments.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('app.date')}</th>
                  <th>{t('finance.invoice')}</th>
                  <th>{t('finance.method')}</th>
                  <th>{t('finance.reference')}</th>
                  <th className="right">{t('app.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <DateText value={payment.receivedOn} />
                    </td>
                    <td>{payment.invoiceNumber ?? '—'}</td>
                    <td>{t(`finance.methods.${payment.method as 'other'}`)}</td>
                    <td>{payment.reference ?? '—'}</td>
                    <td className="right">
                      <Money minor={payment.amountMinor} currency={payment.currencyCode} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </section>
    </div>
  );
}

function ExpensesTab({ data }: { data: Data }) {
  const { t } = useI18n();
  const { project } = data;
  return (
    <div className="stack">
      {can(data.role, 'expenses.write') ? (
        <div className="row">
          <ExpenseDialog projectId={project.id} currency={project.currencyCode} />
        </div>
      ) : null}
      <section className="card table-wrap">
        {data.expenses.length ? (
          <table>
            <thead>
              <tr>
                <th>{t('app.date')}</th>
                <th>{t('expenses.category')}</th>
                <th>{t('expenses.label')}</th>
                <th>{t('expenses.supplier')}</th>
                <th className="right">{t('app.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {data.expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>
                    <DateText value={expense.spentOn} />
                  </td>
                  <td>{t(`expenses.categories.${expense.category as 'other'}`)}</td>
                  <td>{expense.label}</td>
                  <td>{expense.supplier ?? '—'}</td>
                  <td className="right">
                    <Money minor={expense.amountMinor} currency={expense.currencyCode} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty text={t('expenses.noExpenses')} />
        )}
      </section>
    </div>
  );
}

function DocumentsTab({ data }: { data: Data }) {
  const canWrite = can(data.role, 'documents.write');
  return (
    <div className="stack">
      {canWrite ? (
        <div className="row">
          <DocumentDialog projectId={data.project.id} docTypes={data.configuration.docTypes} />
        </div>
      ) : null}
      <section className="card">
        <DocumentRows documents={data.documents} canWrite={canWrite} />
      </section>
    </div>
  );
}

function PlanningTab({ data }: { data: Data }) {
  const canWrite = can(data.role, 'planning.write');
  return (
    <div className="stack">
      {canWrite ? (
        <div className="row">
          <MilestoneDialog projectId={data.project.id} />
        </div>
      ) : null}
      <section className="card">
        <MilestoneRows milestones={data.milestones} canWrite={canWrite} />
      </section>
    </div>
  );
}

function PortalTab({ data }: { data: Data }) {
  const { t, locale } = useI18n();
  const { run, error, busy } = useAction();
  const [created, setCreated] = useState<string | null>(null);
  const canManage = can(data.role, 'portal.manage');
  return (
    <section className="card stack">
      <h2>{t('portalAdmin.title')}</h2>
      <p className="muted">{t('portalAdmin.help')}</p>
      {canManage ? (
        <form
          className="row"
          onSubmit={async (event) => {
            event.preventDefault();
            const v = formData(event.currentTarget);
            const link = await run(() => createPortalLink({ data: { projectId: data.project.id, label: v.label || undefined } }));
            if (link) setCreated(link.url);
          }}
        >
          <input name="label" placeholder={t('portalAdmin.label')} style={{ maxWidth: 320 }} />
          <button className="btn" disabled={busy}>
            {t('portalAdmin.create')}
          </button>
        </form>
      ) : null}
      {created ? (
        <div className="notice ok stack">
          <span>{t('portalAdmin.linkCreated')}</span>
          <div className="secret">{created}</div>
          <div className="row">
            <button type="button" className="btn secondary small" onClick={() => void navigator.clipboard.writeText(created)}>
              {t('app.copy')}
            </button>
            <a className="btn secondary small" href={created} target="_blank" rel="noreferrer">
              {t('app.open')}
            </a>
          </div>
        </div>
      ) : null}
      <ErrorText error={error} />
      {data.links.map((link) => (
        <div key={link.id} className="alert-row">
          <span className="grow">
            {link.label ?? '—'}{' '}
            <span className="muted small">
              {link.lastSeenAt ? t('portalAdmin.lastSeen', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(link.lastSeenAt)) }) : t('portalAdmin.never')}
            </span>
          </span>
          {link.revokedAt ? (
            <Badge tone="bad">{t('portalAdmin.revoked')}</Badge>
          ) : canManage ? (
            <button type="button" className="btn danger small" onClick={() => run(() => revokePortalLink({ data: { id: link.id } }))}>
              {t('portalAdmin.revoke')}
            </button>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function MessagesTab({ data }: { data: Data }) {
  const { t } = useI18n();
  const { run, error, busy } = useAction();
  return (
    <section className="card stack">
      <h2>{t('messages.title')}</h2>
      {data.messages.length ? (
        data.messages.map((message) => (
          <div key={message.id} className={`message ${message.authorKind === 'team' ? 'mine' : ''}`}>
            <div className="small muted">
              {message.authorName} · {message.authorKind === 'team' ? t('messages.team') : t('messages.clientSide')} · <DateText value={message.createdAt} time />
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div>
          </div>
        ))
      ) : (
        <Empty text={t('messages.none')} />
      )}
      {can(data.role, 'messages.write') ? (
        <form
          className="row"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const body = String(new FormData(form).get('body') ?? '');
            const done = await run(() => postMessage({ data: { projectId: data.project.id, body } }));
            if (done !== undefined) form.reset();
          }}
        >
          <input name="body" required placeholder={t('messages.placeholder')} className="grow" style={{ flex: 1 }} />
          <button className="btn" disabled={busy}>
            {t('messages.send')}
          </button>
        </form>
      ) : null}
      <ErrorText error={error} />
    </section>
  );
}
