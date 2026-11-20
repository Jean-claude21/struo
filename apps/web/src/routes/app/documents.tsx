import { can } from '@struo/core/permissions';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { CalendarClock, FolderOpen, ShieldCheck, TriangleAlert } from 'lucide-react';
import { DocumentDialog } from '@/components/forms.tsx';
import { UploadButton } from '@/components/tables.tsx';
import { Drawer, KpiTile, PageHeader, Panel, Seg, StatusChip, useToast, type Shape } from '@/components/kit.tsx';
import { DateText } from '@/components/ui.tsx';
import { FileExplorer, type FileItem, type FileKind } from '@/components/views/Files.tsx';
import { getDocuments, updateDocument } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';
import { DocumentVersions } from '@/components/Work.tsx';

export const Route = createFileRoute('/app/documents')({
  validateSearch: (search: Record<string, unknown>): { doc?: string } => (typeof search.doc === 'string' ? { doc: search.doc } : {}),
  loader: () => getDocuments(),
  component: Documents,
});

type Data = Awaited<ReturnType<typeof getDocuments>>;
type Doc = Data['documents'][number];
export const DOC_SHAPE: Record<Doc['status'], Shape> = { missing: 'todo', pending: 'progress', valid: 'done', to_fix: 'late', expired: 'late' };
const DOC_COLOR: Record<Doc['status'], string> = { missing: 'var(--surface-2)', pending: 'var(--warn-soft)', valid: 'var(--ok-soft)', to_fix: 'var(--bad-soft)', expired: 'var(--bad-soft)' };

function Documents() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const toast = useToast();
  const canWrite = can(data.role, 'documents.write');
  const [tab, setTab] = useState<'compliance' | 'library' | 'expiries'>(search.doc ? 'compliance' : 'compliance');
  const [openId, setOpenId] = useState<string | null>(search.doc ?? null);
  const current = data.documents.find((doc) => doc.id === openId) ?? null;
  const statusLabel = (status: Doc['status']) => t(`documents.statuses.${status}`);

  const save = async (id: string, patch: Record<string, unknown>) => {
    try { await updateDocument({ data: { id, patch } }); await router.invalidate(); toast({ text: t('ui.saved') }); }
    catch { toast({ text: t('errors.generic'), kind: 'err' }); }
  };

  const required = data.compliance.reduce((sum, row) => sum + row.required, 0);
  const valid = data.compliance.reduce((sum, row) => sum + row.valid, 0);
  const soon = data.documents.filter((doc) => doc.daysLeft !== null && doc.daysLeft >= 0 && doc.daysLeft <= 30);
  const expired = data.documents.filter((doc) => doc.status === 'expired');
  const toFix = data.documents.filter((doc) => doc.status === 'to_fix');
  const types = data.docTypes;
  const sites = data.compliance;

  const files: FileItem[] = data.files.map((file) => ({
    id: `${file.kind}-${file.id}`,
    name: file.name,
    kind: file.kind as FileKind,
    mediaType: file.mediaType,
    url: file.kind === 'photo' ? `/api/files/photo/${file.id}` : file.kind === 'audio' ? `/api/files/audio/${file.id}`
      : file.kind === 'document' ? `/api/files/document/${file.id}` : `/print/invoice/${file.id}`,
    thumbUrl: file.kind === 'photo' ? `/api/files/photo/${file.id}` : null,
    sizeBytes: file.sizeBytes,
    date: file.date,
    author: file.author,
    site: { id: file.projectId, code: file.projectCode, name: file.projectName },
    origin: file.kind === 'document' ? t('docs.fromDocument') : file.kind === 'invoice' ? t('docs.fromInvoice') : t('docs.fromReport'),
    onOpenOrigin: file.kind === 'document' ? () => { setTab('compliance'); setOpenId(file.id); }
      : file.kind === 'invoice' ? () => void router.navigate({ to: '/app/finance', search: { invoice: file.id } as never })
      : () => void router.navigate({ to: '/app/field', search: { report: file.originId } as never }),
  }));

  return (
    <div className="stack loose">
      <PageHeader title={t('documents.title')} text={t('docs.subtitle')}>
        {canWrite && data.projects.length ? <DocumentDialog projects={data.projects} docTypes={data.docTypes} /> : null}
      </PageHeader>
      <div className="grid">
        <KpiTile icon={ShieldCheck} label={t('docs.global')} value={`${required ? Math.round((valid / required) * 100) : 0} %`} sub={`${valid} / ${required}`} tone="brand" />
        <KpiTile icon={CalendarClock} label={t('docs.expiringSoon')} value={soon.length} subTone={soon.length ? 'warn' : undefined} sub={t('docs.reminders')} />
        <KpiTile icon={TriangleAlert} label={t('docs.expired')} value={expired.length} tone={expired.length ? 'bad' : undefined} />
        <KpiTile icon={FolderOpen} label={t('docs.libraryTab')} value={data.files.length} sub={t('views.count', { n: data.files.length })} />
      </div>
      <Seg label={t('documents.title')} value={tab} onChange={setTab} items={[
        { value: 'compliance', label: t('docs.complianceTab'), icon: ShieldCheck },
        { value: 'library', label: `${t('docs.libraryTab')} · ${data.files.length}`, icon: FolderOpen },
        { value: 'expiries', label: `${t('docs.expiriesTab')} · ${soon.length + expired.length + toFix.length}`, icon: CalendarClock },
      ]} />

      {tab === 'compliance' ? (
        <Panel title={t('documents.byProject')} sub={t('docs.matrixHint')} flush>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('app.project')}</th>
                  {types.map((type) => <th key={type.id}>{type.name}</th>)}
                  <th className="right">{t('documents.compliance')}</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.projectId}>
                    <td className="nowrap"><Link to="/app/projects/$projectId" params={{ projectId: site.projectId }}><b>{site.code}</b> {site.name}</Link></td>
                    {types.map((type) => {
                      const doc = data.documents.find((candidate) => candidate.projectId === site.projectId && candidate.docTypeId === type.id);
                      if (!doc) return <td key={type.id} className="faint">—</td>;
                      return (
                        <td key={type.id}>
                          <button type="button" className="chip" style={{ background: DOC_COLOR[doc.status], borderColor: 'transparent', minHeight: 32, fontSize: '.84rem' }}
                            onClick={() => setOpenId(doc.id)} aria-label={`${site.code} · ${type.name} · ${statusLabel(doc.status)}`}>
                            <StatusChip shape={DOC_SHAPE[doc.status]} label={statusLabel(doc.status)} />
                            {doc.daysLeft !== null && doc.daysLeft >= 0 && doc.daysLeft <= 30 ? <span className="faint xsmall">{t('documents.daysLeft', { n: doc.daysLeft })}</span> : null}
                          </button>
                        </td>
                      );
                    })}
                    <td className="right">
                      {site.pct === null ? '—' : <b style={{ color: site.pct >= 75 ? 'var(--ok)' : site.pct >= 50 ? 'var(--warn)' : 'var(--bad)' }}>{site.pct} %</b>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : tab === 'library' ? (
        <FileExplorer items={files} sites={data.projects}
          kindLabels={{ photo: t('docs.kinds.photo'), audio: t('docs.kinds.audio'), document: t('docs.kinds.document'), invoice: t('docs.kinds.invoice'), sheet: t('docs.kinds.sheet') }} />
      ) : (
        <Panel title={t('docs.expiriesTab')} sub={t('docs.reminders')} flush>
          {[...expired, ...toFix, ...soon].length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>{t('app.project')}</th><th>{t('documents.titleField')}</th><th>{t('app.status')}</th><th>{t('documents.expiresOn')}</th><th /></tr></thead>
              <tbody>{[...new Set([...expired, ...toFix, ...soon])].map((doc) => (
                <tr key={doc.id}>
                  <td><b>{doc.projectCode}</b> {doc.projectName}</td><td>{doc.title}</td>
                  <td><StatusChip shape={DOC_SHAPE[doc.status]} label={statusLabel(doc.status)} /></td>
                  <td><DateText value={doc.expiresOn} />{doc.daysLeft !== null ? <span className="faint small"> · {doc.daysLeft >= 0 ? t('documents.daysLeft', { n: doc.daysLeft }) : t('ui.lateDays', { n: -doc.daysLeft })}</span> : null}</td>
                  <td className="right"><button type="button" className="btn secondary small" onClick={() => setOpenId(doc.id)}>{t('docs.edit')}</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <p className="muted" style={{ padding: '1rem' }}>{t('docs.noExpiry')}</p>}
        </Panel>
      )}

      <Drawer open={Boolean(current)} onClose={() => setOpenId(null)} title={current ? `${current.projectCode} · ${current.title}` : ''}>
        {current ? (
          <div className="stack loose">
            <div className="row"><StatusChip shape={DOC_SHAPE[current.status]} label={statusLabel(current.status)} />{current.required ? <span className="badge">{t('documents.required')}</span> : null}</div>
            <label className="field">{t('app.status')}
              <select defaultValue={current.status === 'expired' ? 'valid' : current.status} disabled={!canWrite} onChange={(event) => void save(current.id, { status: event.target.value })}>
                {(['missing', 'pending', 'valid', 'to_fix'] as const).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
              </select>
            </label>
            <div className="form-grid">
              <label className="field">{t('documents.reference')}
                <input defaultValue={current.reference ?? ''} disabled={!canWrite} onBlur={(event) => { if (event.target.value !== (current.reference ?? '')) void save(current.id, { reference: event.target.value || null }); }} />
              </label>
              <label className="field">{t('documents.expiresOn')}
                <input type="date" defaultValue={current.expiresOn ?? ''} disabled={!canWrite} onChange={(event) => void save(current.id, { expiresOn: event.target.value || null })} />
              </label>
            </div>
            <label className="check"><input type="checkbox" defaultChecked={current.sharedWithClient} disabled={!canWrite} onChange={(event) => void save(current.id, { sharedWithClient: event.target.checked })} />{t('documents.shared')}</label>
            <div className="card stack" style={{ gap: '.5rem' }}>
              <b>{t('documents.file')}</b>
              {current.hasFile ? <a className="btn secondary small" href={`/api/files/document/${current.id}`} target="_blank" rel="noreferrer">{t('docs.viewFile')}</a> : <span className="muted small">{t('docs.noFile')}</span>}
              {canWrite ? <UploadButton documentId={current.id} /> : null}
              {current.hasFile ? <DocumentVersions key={current.id} documentId={current.id} /> : null}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
