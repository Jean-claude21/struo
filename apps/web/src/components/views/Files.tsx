// File explorer (spec 021): every file of the company in one place — site photos, voice notes,
// documents, invoices — as a grid of previews or a list, filtered by type, site and date, each linked
// back to where it comes from (a report, a document, an invoice).
import { useMemo, useState, type ReactNode } from 'react';
import { File, FileAudio, FileImage, FileSpreadsheet, FileText, Grid2x2, List, Receipt, Upload } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';
import { Modal, Seg, type Shape, StatusChip, useRelative } from '../kit.tsx';

export type FileKind = 'photo' | 'audio' | 'document' | 'invoice' | 'sheet';
export interface FileItem {
  id: string;
  name: string;
  kind: FileKind;
  mediaType?: string | null;
  url: string | null;
  thumbUrl?: string | null;
  sizeBytes?: number | null;
  date: string;
  author?: string | null;
  site?: { id: string; code: string; name: string } | null;
  origin?: string | null;
  status?: { shape: Shape; label: string } | null;
  onOpenOrigin?: () => void;
}

const KIND_META: Record<FileKind, { color: string; icon: typeof File }> = {
  photo: { color: '#0c8599', icon: FileImage },
  audio: { color: '#7048c8', icon: FileAudio },
  document: { color: '#c92a2a', icon: FileText },
  invoice: { color: '#e8590c', icon: Receipt },
  sheet: { color: '#2f9e44', icon: FileSpreadsheet },
};

export const sizeText = (bytes: number | null | undefined) =>
  !bytes ? '' : bytes < 1024 ? `${bytes} o` : bytes < 1048576 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1048576).toFixed(1)} Mo`;

const extOf = (item: FileItem) => (item.name.includes('.') ? item.name.split('.').pop()! : item.mediaType?.split('/').pop() ?? item.kind).slice(0, 4);

export function FileExplorer({ items, kindLabels, sites, onUpload, uploadLabel, toolbarExtra }: {
  items: FileItem[];
  kindLabels: Record<FileKind, string>;
  sites: { id: string; code: string; name: string }[];
  onUpload?: () => void;
  uploadLabel?: string;
  toolbarExtra?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const ago = useRelative();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [kind, setKind] = useState<'all' | FileKind>('all');
  const [site, setSite] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'date' | 'name'>('date');
  const [preview, setPreview] = useState<FileItem | null>(null);
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items
      .filter((item) => (kind === 'all' || item.kind === kind) && (!site || item.site?.id === site)
        && (!query || `${item.name} ${item.site?.name ?? ''} ${item.origin ?? ''}`.toLowerCase().includes(query)))
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.date.localeCompare(a.date)));
  }, [items, kind, site, q, sort]);
  const counts = useMemo(() => {
    const map: Partial<Record<FileKind, number>> = {};
    for (const item of items) map[item.kind] = (map[item.kind] ?? 0) + 1;
    return map;
  }, [items]);
  const dateText = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  const kinds = (Object.keys(KIND_META) as FileKind[]).filter((key) => counts[key]);

  return (
    <div className="stack">
      <div className="toolbar" style={{ paddingTop: 0 }}>
        <div className="search-in" style={{ width: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('ui.search')} aria-label={t('ui.search')} />
        </div>
        <select value={site} onChange={(event) => setSite(event.target.value)} style={{ width: 'auto', minHeight: 32, fontSize: '.88rem' }} aria-label={t('shell.sites')}>
          <option value="">{t('shell.sites')} · {t('views.any')}</option>
          {sites.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.code} · {candidate.name}</option>)}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as 'date' | 'name')} style={{ width: 'auto', minHeight: 32, fontSize: '.88rem' }} aria-label={t('views.sort')}>
          <option value="date">{t('views.sort')} : date</option>
          <option value="name">{t('views.sort')} : A → Z</option>
        </select>
        {toolbarExtra}
        <span className="sp" />
        <Seg label={t('views.grid')} value={view} onChange={setView} items={[{ value: 'grid', label: '', icon: Grid2x2 }, { value: 'list', label: '', icon: List }]} />
        {onUpload ? <button type="button" className="btn small" onClick={onUpload}><Upload size={14} />{uploadLabel}</button> : null}
      </div>
      <div className="chips">
        <button type="button" className={`chip ${kind === 'all' ? 'selected' : ''}`} onClick={() => setKind('all')}>{t('views.any')} <span className="faint">{items.length}</span></button>
        {kinds.map((key) => {
          const Icon = KIND_META[key].icon;
          return (
            <button key={key} type="button" className={`chip ${kind === key ? 'selected' : ''}`} onClick={() => setKind(key)}>
              <Icon size={15} style={{ color: KIND_META[key].color }} />{kindLabels[key]} <span className="faint">{counts[key]}</span>
            </button>
          );
        })}
      </div>
      {!shown.length ? <p className="muted">{t('ui.noResults')}</p> : view === 'grid' ? (
        <div className="fgrid">
          {shown.map((item) => {
            const meta = KIND_META[item.kind]; const Icon = meta.icon;
            return (
              <button key={item.id} type="button" className="fcard" onClick={() => setPreview(item)}>
                <div className="f-prev">
                  {item.thumbUrl ? <img src={item.thumbUrl} alt="" loading="lazy" /> : <Icon size={34} style={{ color: meta.color }} />}
                  <span className="f-ext" style={{ ['--c' as string]: meta.color }}>{extOf(item)}</span>
                </div>
                <div className="f-info">
                  <span className="f-name">{item.name}</span>
                  <span className="f-meta">{[item.site?.code, ago(item.date), item.author].filter(Boolean).join(' · ')}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="panel"><div className="table-wrap"><table>
          <thead><tr><th>{t('views.list')}</th><th>{t('shell.sites')}</th><th>{t('documents.title')}</th><th className="right">Taille</th><th>Date</th></tr></thead>
          <tbody>{shown.map((item) => {
            const meta = KIND_META[item.kind]; const Icon = meta.icon;
            return (
              <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => setPreview(item)}>
                <td><span className="row tight nowrap"><span className="ftype" style={{ ['--c' as string]: meta.color }}><Icon size={15} /></span><span className="trunc" style={{ fontWeight: 550, maxWidth: 320 }}>{item.name}</span></span></td>
                <td className="muted">{item.site?.code ?? '—'}</td>
                <td>{item.status ? <StatusChip shape={item.status.shape} label={item.status.label} /> : <span className="muted">{item.origin ?? kindLabels[item.kind]}</span>}</td>
                <td className="right muted num">{sizeText(item.sizeBytes)}</td>
                <td className="muted nowrap">{dateText(item.date)}</td>
              </tr>
            );
          })}</tbody>
        </table></div></div>
      )}
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} wide title={preview?.name ?? ''}
        footer={preview ? (
          <>
            {preview.onOpenOrigin ? <button type="button" className="btn secondary" onClick={() => { setPreview(null); preview.onOpenOrigin?.(); }}>{preview.origin ?? t('ui.open')}</button> : null}
            <span className="sp" />
            {preview.url ? <a className="btn" href={preview.url} target="_blank" rel="noreferrer">{t('ui.download')}</a> : null}
          </>
        ) : undefined}>
        {preview ? (
          <div className="viewer">
            <div className="muted small">{[kindLabels[preview.kind], preview.site ? `${preview.site.code} · ${preview.site.name}` : null, dateText(preview.date), preview.author, sizeText(preview.sizeBytes)].filter(Boolean).join(' · ')}</div>
            {preview.kind === 'photo' && preview.url ? <img src={preview.url} alt={preview.name} />
              : preview.kind === 'audio' && preview.url ? <audio controls src={preview.url} style={{ width: '100%' }} />
              : preview.url && (preview.mediaType === 'application/pdf' || preview.kind === 'invoice') ? <iframe src={preview.url} title={preview.name} />
              : <p className="muted">{preview.origin}</p>}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
