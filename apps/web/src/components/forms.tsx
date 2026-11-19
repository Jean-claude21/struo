import { useState } from 'react';
import {
  addDocument, addExpense, addMilestone, createInvoice, draftReminder, recordPayment, reviewReport, sendReminder,
} from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';
import { Badge, DateText, DialogButton, ErrorText, Field, FormButtons, formData, orNull, parseMoney, todayIso, useAction } from './ui.tsx';

type ProjectOption = { id: string; code: string; name: string };

function ProjectSelect({ projects, projectId }: { projects?: ProjectOption[]; projectId?: string }) {
  const { t } = useI18n();
  if (projectId) return <input type="hidden" name="projectId" value={projectId} />;
  return (
    <Field label={t('app.project')}>
      <select name="projectId" required>
        {(projects ?? []).map((project) => (
          <option key={project.id} value={project.id}>
            {project.code} — {project.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

const INVOICE_KINDS = ['advance', 'progress', 'final'] as const;
const METHODS = ['mobile_money', 'transfer', 'cheque', 'cash', 'card', 'other'] as const;
const CATEGORIES = ['materials', 'labour', 'subcontracting', 'equipment', 'transport', 'fees', 'other'] as const;
const DOC_STATUSES = ['missing', 'pending', 'valid', 'to_fix'] as const;
const MILESTONE_CATEGORIES = ['admin', 'studies', 'technical', 'finishing', 'delivery'] as const;

export function InvoiceDialog({ projects, projectId, currency }: { projects?: ProjectOption[]; projectId?: string; currency: string }) {
  const { t } = useI18n();
  const { run, error, busy, setError } = useAction();
  return (
    <DialogButton label={t('finance.newInvoice')} title={t('finance.newInvoice')}>
      {(close) => (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const v = formData(event.currentTarget);
            const amountMinor = parseMoney(v.amount ?? '', currency);
            const deductionMinor = v.deduction ? parseMoney(v.deduction, currency) : 0;
            if (amountMinor === null || deductionMinor === null) return setError(t('errors.invalid_amount'));
            const done = await run(() =>
              createInvoice({ data: { projectId: v.projectId, kind: v.kind, label: orNull(v.label), amountMinor, deductionMinor, issuedOn: v.issuedOn, dueOn: v.dueOn } }),
            );
            if (done) close();
          }}
        >
          <ProjectSelect projects={projects} projectId={projectId} />
          <div className="form-grid">
            <Field label={t('finance.kind')}>
              <select name="kind" defaultValue="progress">
                {INVOICE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`finance.kinds.${kind}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`${t('finance.amountHt')} (${currency})`}>
              <input name="amount" inputMode="decimal" required />
            </Field>
            <Field label={`${t('finance.deduction')} (${currency})`} hint={t('app.optional')}>
              <input name="deduction" inputMode="decimal" />
            </Field>
            <Field label={t('finance.issuedOn')}>
              <input name="issuedOn" type="date" defaultValue={todayIso()} required />
            </Field>
            <Field label={t('finance.dueOn')}>
              <input name="dueOn" type="date" defaultValue={todayIso(30)} required />
            </Field>
          </div>
          <Field label={t('finance.label')} hint={t('app.optional')}>
            <input name="label" maxLength={200} />
          </Field>
          <ErrorText error={error} />
          <FormButtons onCancel={close} busy={busy} submitLabel={t('app.create')} />
        </form>
      )}
    </DialogButton>
  );
}

export function PaymentDialog({
  projects,
  projectId,
  currency,
  invoices,
}: {
  projects?: ProjectOption[];
  projectId?: string;
  currency: string;
  invoices: { id: string; number: string; projectId: string; balanceMinor: number; status: string }[];
}) {
  const { t } = useI18n();
  const { run, error, busy, setError } = useAction();
  const [selectedProject, setSelectedProject] = useState(projectId ?? projects?.[0]?.id ?? '');
  const open = invoices.filter((invoice) => invoice.projectId === selectedProject && invoice.status === 'issued' && invoice.balanceMinor > 0);
  return (
    <DialogButton label={t('finance.newPayment')} title={t('finance.newPayment')} secondary>
      {(close) => (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const v = formData(event.currentTarget);
            const amountMinor = parseMoney(v.amount ?? '', currency);
            if (amountMinor === null) return setError(t('errors.invalid_amount'));
            const done = await run(() =>
              recordPayment({ data: { projectId: v.projectId, invoiceId: orNull(v.invoiceId), amountMinor, method: v.method, receivedOn: v.receivedOn, reference: orNull(v.reference) } }),
            );
            if (done) close();
          }}
        >
          {projectId ? (
            <input type="hidden" name="projectId" value={projectId} />
          ) : (
            <Field label={t('app.project')}>
              <select name="projectId" value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} — {project.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={t('finance.invoice')}>
            <select name="invoiceId" defaultValue={open[0]?.id ?? ''}>
              <option value="">{t('finance.noInvoice')}</option>
              {open.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.number}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label={`${t('app.amount')} (${currency})`}>
              <input name="amount" inputMode="decimal" required />
            </Field>
            <Field label={t('finance.method')}>
              <select name="method" defaultValue="mobile_money">
                {METHODS.map((method) => (
                  <option key={method} value={method}>
                    {t(`finance.methods.${method}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('app.date')}>
              <input name="receivedOn" type="date" defaultValue={todayIso()} required />
            </Field>
            <Field label={t('finance.reference')} hint={t('app.optional')}>
              <input name="reference" maxLength={120} />
            </Field>
          </div>
          <ErrorText error={error} />
          <FormButtons onCancel={close} busy={busy} />
        </form>
      )}
    </DialogButton>
  );
}

export function ExpenseDialog({ projects, projectId, currency }: { projects?: ProjectOption[]; projectId?: string; currency: string }) {
  const { t } = useI18n();
  const { run, error, busy, setError } = useAction();
  return (
    <DialogButton label={t('expenses.new')} title={t('expenses.new')}>
      {(close) => (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const v = formData(event.currentTarget);
            const amountMinor = parseMoney(v.amount ?? '', currency);
            if (amountMinor === null) return setError(t('errors.invalid_amount'));
            const done = await run(() =>
              addExpense({ data: { projectId: v.projectId, category: v.category, label: v.label, supplier: orNull(v.supplier), amountMinor, spentOn: v.spentOn } }),
            );
            if (done) close();
          }}
        >
          <ProjectSelect projects={projects} projectId={projectId} />
          <div className="form-grid">
            <Field label={t('expenses.category')}>
              <select name="category" defaultValue="materials">
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`expenses.categories.${category}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`${t('app.amount')} (${currency})`}>
              <input name="amount" inputMode="decimal" required />
            </Field>
            <Field label={t('app.date')}>
              <input name="spentOn" type="date" defaultValue={todayIso()} required />
            </Field>
            <Field label={t('expenses.supplier')} hint={t('app.optional')}>
              <input name="supplier" maxLength={200} />
            </Field>
          </div>
          <Field label={t('expenses.label')}>
            <input name="label" required maxLength={200} />
          </Field>
          <ErrorText error={error} />
          <FormButtons onCancel={close} busy={busy} />
        </form>
      )}
    </DialogButton>
  );
}

export function DocumentDialog({
  projects,
  projectId,
  docTypes,
}: {
  projects?: ProjectOption[];
  projectId?: string;
  docTypes: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const { run, error, busy } = useAction();
  return (
    <DialogButton label={t('documents.add')} title={t('documents.add')}>
      {(close) => (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const v = formData(event.currentTarget);
            const done = await run(() =>
              addDocument({
                data: {
                  projectId: v.projectId, docTypeId: orNull(v.docTypeId), title: v.title, status: v.status,
                  reference: orNull(v.reference), issuedOn: orNull(v.issuedOn), expiresOn: orNull(v.expiresOn),
                  sharedWithClient: v.sharedWithClient === 'on',
                },
              }),
            );
            if (done) close();
          }}
        >
          <ProjectSelect projects={projects} projectId={projectId} />
          <div className="form-grid">
            <Field label={t('documents.titleField')}>
              <input name="title" required maxLength={200} />
            </Field>
            <Field label={t('documents.type')}>
              <select name="docTypeId" defaultValue="">
                <option value="">{t('app.none')}</option>
                {docTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('app.status')}>
              <select name="status" defaultValue="pending">
                {DOC_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`documents.statuses.${status}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('documents.reference')} hint={t('app.optional')}>
              <input name="reference" maxLength={120} />
            </Field>
            <Field label={t('documents.issuedOn')} hint={t('app.optional')}>
              <input name="issuedOn" type="date" />
            </Field>
            <Field label={t('documents.expiresOn')} hint={t('app.optional')}>
              <input name="expiresOn" type="date" />
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" name="sharedWithClient" /> {t('documents.shared')}
          </label>
          <ErrorText error={error} />
          <FormButtons onCancel={close} busy={busy} />
        </form>
      )}
    </DialogButton>
  );
}

export function MilestoneDialog({ projects, projectId }: { projects?: ProjectOption[]; projectId?: string }) {
  const { t } = useI18n();
  const { run, error, busy } = useAction();
  return (
    <DialogButton label={t('planning.add')} title={t('planning.add')}>
      {(close) => (
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const v = formData(event.currentTarget);
            const done = await run(() =>
              addMilestone({
                data: {
                  projectId: v.projectId, name: v.name, category: v.category, plannedOn: v.plannedOn, priority: v.priority,
                  action: orNull(v.action), clientValidation: v.clientValidation === 'on',
                },
              }),
            );
            if (done) close();
          }}
        >
          <ProjectSelect projects={projects} projectId={projectId} />
          <Field label={t('planning.milestone')}>
            <input name="name" required maxLength={200} />
          </Field>
          <div className="form-grid">
            <Field label={t('planning.category')}>
              <select name="category" defaultValue="technical">
                {MILESTONE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`planning.categories.${category}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('planning.plannedOn')}>
              <input name="plannedOn" type="date" defaultValue={todayIso(14)} required />
            </Field>
            <Field label={t('planning.priority')}>
              <select name="priority" defaultValue="normal">
                {(['high', 'normal', 'low'] as const).map((priority) => (
                  <option key={priority} value={priority}>
                    {t(`planning.priorities.${priority}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t('planning.action')} hint={t('app.optional')}>
            <input name="action" maxLength={500} />
          </Field>
          <label className="check">
            <input type="checkbox" name="clientValidation" /> {t('planning.clientValidation')}
          </label>
          <ErrorText error={error} />
          <FormButtons onCancel={close} busy={busy} />
        </form>
      )}
    </DialogButton>
  );
}

/** Drafts a reminder from the real figures, lets the person edit it, then records and sends it. */
export function ReminderDialog({ invoiceId, channels }: { invoiceId: string; channels: { whatsapp: boolean; email: boolean } }) {
  const { t } = useI18n();
  const { run, error, busy } = useAction();
  const [draft, setDraft] = useState<{ text: string; ai: boolean; clientEmail: string | null; clientPhone: string | null } | null>(null);
  const [kind, setKind] = useState<'reminder' | 'formal_notice'>('reminder');
  return (
    <DialogButton label={t('finance.remind')} title={t('finance.remind')} secondary small>
      {(close) => (
        <div className="stack">
          <div className="pair">
            {(['reminder', 'formal_notice'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`btn ${kind === value ? '' : 'secondary'}`}
                onClick={async () => {
                  setKind(value);
                  const result = await run(() => draftReminder({ data: { id: invoiceId, kind: value } }), { reload: false });
                  if (result) setDraft(result);
                }}
              >
                {value === 'reminder' ? t('finance.draft') : t('finance.formalNotice')}
              </button>
            ))}
          </div>
          {busy && !draft ? <p className="muted">{t('finance.drafting')}</p> : null}
          {draft ? (
            <form
              className="stack"
              onSubmit={async (event) => {
                event.preventDefault();
                const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                const channel = submitter?.value ?? 'letter';
                const body = String(new FormData(event.currentTarget).get('body'));
                const done = await run(() => sendReminder({ data: { id: invoiceId, kind, channel, body, send: channel === 'email' || channel === 'whatsapp' } }));
                if (done) close();
              }}
            >
              <p className="small muted">{draft.ai ? t('finance.draftAi') : t('finance.draftTemplate')}</p>
              <textarea name="body" defaultValue={draft.text} rows={14} />
              <div className="row">
                <button type="submit" value="letter" className="btn secondary">
                  {t('finance.recordOnly')}
                </button>
                {draft.clientEmail ? (
                  <button type="submit" value="email" className="btn">
                    {t('finance.sendEmail')} {channels.email ? '' : '(log)'}
                  </button>
                ) : null}
                {draft.clientPhone ? (
                  <button type="submit" value="whatsapp" className="btn">
                    {t('finance.sendWhatsapp')} {channels.whatsapp ? '' : '(simulation)'}
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}
          <ErrorText error={error} />
          <button type="button" className="btn ghost" onClick={close}>
            {t('app.close')}
          </button>
        </div>
      )}
    </DialogButton>
  );
}

export interface ReportView {
  id: string;
  projectName: string;
  phaseName: string | null;
  authorName: string;
  progressPct: number | null;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  takenAt: string;
  status: string;
  photos: { id: string }[];
}

export function ReportCard({ report, canReview }: { report: ReportView; canReview: boolean }) {
  const { t } = useI18n();
  const { run, busy, error } = useAction();
  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{report.projectName}</strong>
        <Badge tone={report.status}>{t(`field.${report.status as 'submitted'}`)}</Badge>
      </div>
      <div className="small muted">
        <DateText value={report.takenAt} time /> · {t('field.by', { name: report.authorName })}
        {report.latitude !== null ? (
          <>
            {' · '}
            <a href={`https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}#map=17/${report.latitude}/${report.longitude}`} target="_blank" rel="noreferrer">
              {t('field.gps')}
            </a>
          </>
        ) : null}
      </div>
      {report.phaseName && report.progressPct !== null ? <div>{t('field.progressOn', { phase: report.phaseName, pct: report.progressPct })}</div> : null}
      {report.note ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{report.note}</p> : null}
      {report.photos.length ? (
        <div className="thumbs">
          {report.photos.map((photo) => (
            <a key={photo.id} href={`/api/files/photo/${photo.id}`} target="_blank" rel="noreferrer">
              <img src={`/api/files/photo/${photo.id}`} alt="" loading="lazy" />
            </a>
          ))}
        </div>
      ) : null}
      {canReview && report.status === 'submitted' ? (
        <div className="pair">
          <button type="button" className="btn secondary" disabled={busy} onClick={() => run(() => reviewReport({ data: { id: report.id, decision: 'rejected' } }))}>
            {t('field.reject')}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => reviewReport({ data: { id: report.id, decision: 'validated' } }))}>
            {t('field.validate')}
          </button>
        </div>
      ) : null}
      <ErrorText error={error} />
    </div>
  );
}
