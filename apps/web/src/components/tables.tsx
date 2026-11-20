import { ReminderDialog } from './forms.tsx';
import { Badge, DateText, Empty, ErrorText, Money, useAction } from './ui.tsx';
import { updateDocument, updateMilestone } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';
import { DocumentVersions } from './Work.tsx';

type InvoiceView = {
  id: string; projectName: string; clientName: string | null; number: string; kind: string; dueOn: string; currencyCode: string;
  totalMinor: number; netMinor: number; balanceMinor: number; overdueDays: number; status: string; reminders: number;
};
type DocumentView = {
  id: string; projectCode: string; title: string; required: boolean; status: 'missing' | 'pending' | 'valid' | 'to_fix' | 'expired';
  expiresOn: string | null; daysLeft: number | null; hasFile: boolean; sharedWithClient: boolean;
};
type MilestoneView = {
  id: string; projectCode: string; name: string; action: string | null; clientValidatedAt: string | null; clientValidation: boolean;
  category: string; plannedOn: string; actualOn: string | null; status: 'done' | 'late' | 'pending'; delayDays: number;
};

export function InvoiceTable({
  invoices,
  canWrite,
  channels = { whatsapp: false, email: false },
  showProject,
}: {
  invoices: InvoiceView[];
  canWrite: boolean;
  channels?: { whatsapp: boolean; email: boolean };
  showProject?: boolean;
}) {
  const { t } = useI18n();
  if (!invoices.length) return <div className="card"><Empty text={t('finance.noInvoices')} /></div>;
  return (
    <section className="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t('finance.number')}</th>
            {showProject ? <th>{t('app.project')}</th> : null}
            <th>{t('finance.kind')}</th>
            <th>{t('finance.dueOn')}</th>
            <th className="right">{t('finance.totalTtc')}</th>
            <th className="right">{t('finance.net')}</th>
            <th className="right">{t('finance.balance')}</th>
            <th>{t('finance.overdueDays')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>
                <a href={`/print/invoice/${invoice.id}`} target="_blank" rel="noreferrer">
                  <strong>{invoice.number}</strong>
                </a>
                {invoice.status === 'cancelled' ? <div><Badge tone="bad">{t('finance.cancelled')}</Badge></div> : null}
              </td>
              {showProject ? <td>{invoice.projectName}<div className="muted small">{invoice.clientName ?? ''}</div></td> : null}
              <td>{t(`finance.kinds.${invoice.kind as 'progress'}`)}</td>
              <td>
                <DateText value={invoice.dueOn} />
              </td>
              <td className="right">
                <Money minor={invoice.totalMinor} currency={invoice.currencyCode} />
              </td>
              <td className="right">
                <Money minor={invoice.netMinor} currency={invoice.currencyCode} />
              </td>
              <td className="right">
                <strong>
                  <Money minor={invoice.balanceMinor} currency={invoice.currencyCode} />
                </strong>
              </td>
              <td>
                {invoice.overdueDays > 0 ? <Badge tone={invoice.overdueDays > 30 ? 'critical' : 'important'}>{t('finance.days', { n: invoice.overdueDays })}</Badge> : '—'}
                {invoice.reminders > 0 ? <div className="muted small">{t('finance.reminders', { n: invoice.reminders })}</div> : null}
              </td>
              <td className="right">
                {canWrite && invoice.status === 'issued' && invoice.balanceMinor > 0 ? <ReminderDialog invoiceId={invoice.id} channels={channels} /> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function DocumentRows({ documents, canWrite, showProject }: { documents: DocumentView[]; canWrite: boolean; showProject?: boolean }) {
  const { t } = useI18n();
  const { run, error } = useAction();
  if (!documents.length) return <Empty text={t('documents.noDocuments')} />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {showProject ? <th>{t('app.project')}</th> : null}
            <th>{t('documents.titleField')}</th>
            <th>{t('app.status')}</th>
            <th>{t('documents.expiresOn')}</th>
            <th>{t('documents.file')}</th>
            <th>{t('documents.shared')}</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document.id}>
              {showProject ? <td>{document.projectCode}</td> : null}
              <td>
                {document.title} {document.required ? <span className="muted small">· {t('documents.required')}</span> : null}
              </td>
              <td>
                {canWrite ? (
                  <select
                    defaultValue={document.status === 'expired' ? 'valid' : document.status}
                    onChange={(event) => void run(() => updateDocument({ data: { id: document.id, patch: { status: event.target.value } } }))}
                    aria-label={t('app.status')}
                    style={{ minWidth: 150 }}
                  >
                    {(['missing', 'pending', 'valid', 'to_fix'] as const).map((status) => (
                      <option key={status} value={status}>
                        {t(`documents.statuses.${status}`)}
                      </option>
                    ))}
                  </select>
                ) : null}{' '}
                <Badge tone={document.status}>{t(`documents.statuses.${document.status}`)}</Badge>
              </td>
              <td>
                {canWrite ? (
                  <input
                    type="date"
                    defaultValue={document.expiresOn ?? ''}
                    onChange={(event) => void run(() => updateDocument({ data: { id: document.id, patch: { expiresOn: event.target.value || null } } }))}
                    style={{ maxWidth: 170 }}
                  />
                ) : (
                  <DateText value={document.expiresOn} />
                )}
                {document.daysLeft !== null && document.daysLeft >= 0 ? <div className="muted small">{t('documents.daysLeft', { n: document.daysLeft })}</div> : null}
              </td>
              <td>
                {document.hasFile ? (
                  <a href={`/api/files/document/${document.id}`} target="_blank" rel="noreferrer">
                    {t('app.open')}
                  </a>
                ) : null}
                {canWrite ? <UploadButton documentId={document.id} /> : null}
                {document.hasFile ? <DocumentVersions documentId={document.id} /> : null}
              </td>
              <td>
                <input
                  type="checkbox"
                  aria-label={t('documents.shared')}
                  defaultChecked={document.sharedWithClient}
                  disabled={!canWrite}
                  onChange={(event) => void run(() => updateDocument({ data: { id: document.id, patch: { sharedWithClient: event.target.checked } } }))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorText error={error} />
    </div>
  );
}

export function UploadButton({ documentId }: { documentId: string }) {
  const { t } = useI18n();
  const { run, error } = useAction();
  return (
    <label className="btn ghost small" style={{ cursor: 'pointer' }}>
      {t('documents.upload')}
      <input
        type="file"
        hidden
        accept="application/pdf,image/*"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const body = new FormData();
          body.append('file', file);
          await run(async () => {
            const response = await fetch(`/api/documents/${documentId}/file`, { method: 'POST', body });
            if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? 'generic');
          });
        }}
      />
      {error ? <span className="error">{error}</span> : null}
    </label>
  );
}

export function MilestoneRows({ milestones, canWrite, showProject }: { milestones: MilestoneView[]; canWrite: boolean; showProject?: boolean }) {
  const { t, locale } = useI18n();
  const { run, error } = useAction();
  if (!milestones.length) return <Empty text={t('planning.noMilestones')} />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {showProject ? <th>{t('app.project')}</th> : null}
            <th>{t('planning.milestone')}</th>
            <th>{t('planning.category')}</th>
            <th>{t('planning.plannedOn')}</th>
            <th>{t('planning.actualOn')}</th>
            <th>{t('app.status')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {milestones.map((milestone) => (
            <tr key={milestone.id}>
              {showProject ? <td>{milestone.projectCode}</td> : null}
              <td>
                {milestone.name}
                {milestone.action ? <div className="muted small">{milestone.action}</div> : null}
                {milestone.clientValidatedAt ? (
                  <div className="small" style={{ color: 'var(--ok)' }}>
                    {t('planning.validatedByClient', { date: new Intl.DateTimeFormat(locale).format(new Date(milestone.clientValidatedAt)) })}
                  </div>
                ) : milestone.clientValidation ? (
                  <div className="muted small">{t('planning.clientValidation')}</div>
                ) : null}
              </td>
              <td>{t(`planning.categories.${milestone.category as 'technical'}`)}</td>
              <td>
                <DateText value={milestone.plannedOn} />
              </td>
              <td>
                <DateText value={milestone.actualOn} />
              </td>
              <td>
                <Badge tone={milestone.status}>{t(`planning.statuses.${milestone.status}`)}</Badge>{' '}
                {milestone.delayDays > 0 ? <span className="small error">{t('planning.delay', { n: milestone.delayDays })}</span> : null}
              </td>
              <td className="right">
                {canWrite && !milestone.actualOn ? (
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => run(() => updateMilestone({ data: { id: milestone.id, patch: { actualOn: new Date().toISOString().slice(0, 10) } } }))}
                  >
                    {t('planning.markDone')}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorText error={error} />
    </div>
  );
}

