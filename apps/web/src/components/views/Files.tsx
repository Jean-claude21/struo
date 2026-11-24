// File explorer (spec 021): every file of the company in one place — site photos, voice notes,
// documents, invoices — as a grid of previews or a list, filtered by type, site and date, each linked
// back to where it comes from (a report, a document, an invoice). Sorted by date, name, type or size;
// files dropped on the explorer are uploaded; each file has a menu (right click or « … »): preview,
// open where it comes from, download, copy its link.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Download, Ellipsis, Eye, File, FileAudio, FileImage, FileSpreadsheet, FileText, Grid2x2, Link2, List, Receipt, SquareArrowOutUpRight, Upload } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';
import { ContextMenu, MenuItem, menuAt, Modal, Seg, type MenuAt, type Shape, StatusChip, useRelative, useToast } from '../kit.tsx';
import { usePhotoViewer } from '../PhotoViewer.tsx';

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
  photo: { color: '#2a7a78', icon: FileImage },
  audio: { color: '#6a4ba8', icon: FileAudio },
  document: { color: '#8e2a22', icon: FileText },
  invoice: { color: '#b9461e', icon: Receipt },
  sheet: { color: '#3d704e', icon: FileSpreadsheet },
};

export const sizeText = (bytes: number | null | undefined) =>
  !bytes ? '' : bytes < 1024 ? `${bytes} o` : bytes < 1048576 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1048576).toFixed(1)} Mo`;

const extOf = (item: FileItem) => (item.name.includes('.') ? item.name.split('.').pop()! : item.mediaType?.split('/').pop() ?? item.kind).slice(0, 4);

export function FileExplorer({ items, kindLabels, sites, onUpload, uploadLabel, toolbarExtra, onDropFiles }: {
  items: FileItem[];
  kindLabels: Record<FileKind, string>;
  sites: { id: string; code: string; name: string }[];
  onUpload?: () => void;
  uploadLabel?: string;
  toolbarExtra?: ReactNode;
  /** Files dropped on the explorer. */
  onDropFiles?: (files: File[]) => Promise<void> | void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [menu, setMenu] = useState<{ item: FileItem; at: MenuAt } | null>(null);
  // Spec 047: a photo opens in the viewer, with the other photos of the list to browse.
  const viewer = usePhotoViewer();
  const [dropping, setDropping] = useState(false);
  const copyLink = async (item: FileItem) => {
    if (!item.url) return;
    try { await navigator.clipboard.writeText(new URL(item.url, window.location.origin).toString()); toast({ text: t('views.linkCopied') }); }
    catch { toast({ text: t('errors.generic'), kind: 'err' }); }
  };
  const ago = useRelative();
  const [view, setView] = useState<'grid' | 'list' | 'days'>('grid');
  const [kind, setKind] = useState<'all' | FileKind>('all');
  const [site, setSite] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'date' | 'name' | 'kind' | 'size'>('date');
  const [preview, setPreviewRaw] = useState<FileItem | null>(null);
  const setPreview = (item: FileItem | null) => {
    if (item?.kind === 'photo' && item.url) {
      const photos = shownPhotos.current.length ? shownPhotos.current : [item];
      viewer(photos.map((photo) => ({ url: photo.url!, title: [photo.site?.code, photo.origin].filter(Boolean).join(' · ') || photo.name, detail: [photo.author, new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(photo.date))].filter(Boolean).join(' · ') })), Math.max(0, photos.findIndex((photo) => photo.id === item.id)));
      return;
    }
    setPreviewRaw(item);
  };
  const shownPhotos = useRef<FileItem[]>([]);
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items
      .filter((item) => (kind === 'all' || item.kind === kind) && (!site || item.site?.id === site)
        && (!query || `${item.name} ${item.site?.name ?? ''} ${item.origin ?? ''}`.toLowerCase().includes(query)))
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name)
        : sort === 'kind' ? a.kind.localeCompare(b.kind) || b.date.localeCompare(a.date)
        : sort === 'size' ? (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)
        : b.date.localeCompare(a.date)));
  }, [items, kind, site, q, sort]);
  shownPhotos.current = shown.filter((item) => item.kind === 'photo' && item.url);
  const counts = useMemo(() => {
    const map: Partial<Record<FileKind, number>> = {};
    for (const item of items) map[item.kind] = (map[item.kind] ?? 0) + 1;
    return map;
  }, [items]);
  const dateText = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  const kinds = (Object.keys(KIND_META) as FileKind[]).filter((key) => counts[key]);


  const card = (item: FileItem) => {
    const meta = KIND_META[item.kind]; const Icon = meta.icon;
    return (
      <button key={item.id} type="button" className="fcard" onClick={() => setPreview(item)} onContextMenu={open(item)}>
                <div className="f-prev">
                  {item.thumbUrl ? <img src={item.thumbUrl} alt="" loading="lazy" /> : <Icon size={34} style={{ color: meta.color }} />}
                  <span className="f-ext" style={{ ['--c' as string]: meta.color }}>{extOf(item)}</span>
                </div>
                <div className="f-info">
                  <span className="f-name">{item.name}</span>
                  <span className="f-meta">{[item.site?.code, ago(item.date), item.author].filter(Boolean).join(' · ')}</span>
                </div>
                <span role="button" tabIndex={0} className="icon-btn sm fmenu" aria-label={t('views.actions')} onClick={(event) => { event.stopPropagation(); open(item)(event); }}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setMenu({ item, at: { x: rect.left, y: rect.bottom + 4 } }); } }}><Ellipsis size={14} /></span>
              </button>
    );
  };
  // By day: newest day first, each day's files in time order.
  const days = useMemo(() => {
    const groups = new Map<string, FileItem[]>();
    for (const item of [...shown].sort((a, b) => b.date.localeCompare(a.date))) {
      const date = new Date(item.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].map(([key, items]) => ({ key, items }));
  }, [shown]);
  const dayLabel = (key: string) => {
    const label = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${key}T12:00:00`));
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
  const dropProps = onDropFiles ? {
    onDragOver: (event: React.DragEvent) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDropping(true); } },
    onDragLeave: (event: React.DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropping(false); },
    onDrop: async (event: React.DragEvent) => {
      event.preventDefault(); setDropping(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length) await onDropFiles(files);
    },
  } : {};
  const open = (item: FileItem) => (event: React.MouseEvent) => setMenu({ item, at: menuAt(event) });

  return (
    <div className={`stack fexplorer ${dropping ? 'dropping' : ''}`} {...dropProps}>
      {dropping ? <div className="fdrop"><Upload size={22} />{t('views.dropToUpload')}</div> : null}
      <div className="toolbar" style={{ paddingTop: 0 }}>
        <div className="search-in" style={{ width: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('ui.search')} aria-label={t('ui.search')} />
        </div>
        <select value={site} onChange={(event) => setSite(event.target.value)} style={{ width: 'auto', minHeight: 32, fontSize: '.88rem' }} aria-label={t('shell.sites')}>
          <option value="">{t('shell.sites')} · {t('views.any')}</option>
          {sites.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.code} · {candidate.name}</option>)}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} style={{ width: 'auto', minHeight: 32, fontSize: '.88rem' }} aria-label={t('views.sort')}>
          <option value="date">{t('views.sort')} : {t('views.sortNewest')}</option>
          <option value="name">{t('views.sort')} : A → Z</option>
          <option value="kind">{t('views.sort')} : {t('views.sortKind')}</option>
          <option value="size">{t('views.sort')} : {t('views.sortSize')}</option>
        </select>
        {toolbarExtra}
        <span className="sp" />
        <Seg label={t('views.grid')} value={view} onChange={setView} items={[{ value: 'grid', label: '', icon: Grid2x2 }, { value: 'days', label: t('views.byDay'), icon: CalendarDays }, { value: 'list', label: '', icon: List }]} />
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
      {!shown.length ? <p className="muted">{t('ui.noResults')}</p> : view === 'days' ? (
        <div className="stack">
          {days.length > 1 ? (
            <div className="row tight">
              <span className="small muted">{t('views.jumpTo')}</span>
              <select style={{ width: 'auto', minHeight: 32 }} value="" onChange={(event) => document.getElementById(`day-${event.target.value}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                <option value="">{t('views.chooseDay')}</option>
                {days.map((day) => <option key={day.key} value={day.key}>{dayLabel(day.key)} · {day.items.length}</option>)}
              </select>
            </div>
          ) : null}
          {days.map((day) => (
            <section key={day.key} id={`day-${day.key}`} className="fday">
              <header className="fday-h">
                <b>{dayLabel(day.key)}</b>
                <span className="faint small">{t('views.filesCount', { n: day.items.length })}</span>
                <span className="sp" />
                <span className="small muted trunc">{[...new Set(day.items.map((item) => item.site?.code).filter(Boolean))].join(', ')}</span>
                <span className="small faint trunc hide-m">{[...new Set(day.items.map((item) => item.author).filter(Boolean))].join(', ')}</span>
              </header>
              <div className="fgrid">{day.items.map(card)}</div>
            </section>
          ))}
        </div>
      ) : view === 'grid' ? (
        <div className="fgrid">{shown.map(card)}</div>
      ) : (
        <div className="panel"><div className="table-wrap"><table>
          <thead><tr><th>{t('views.list')}</th><th>{t('shell.sites')}</th><th>{t('documents.title')}</th><th className="right">Taille</th><th>Date</th></tr></thead>
          <tbody>{shown.map((item) => {
            const meta = KIND_META[item.kind]; const Icon = meta.icon;
            return (
              <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => setPreview(item)} onContextMenu={open(item)}>
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
      <ContextMenu at={menu?.at ?? null} onClose={() => setMenu(null)}>
        {menu ? (
          <>
            <MenuItem icon={Eye} onSelect={() => { setPreview(menu.item); setMenu(null); }}>{t('views.preview')}</MenuItem>
            {menu.item.onOpenOrigin ? <MenuItem icon={SquareArrowOutUpRight} onSelect={() => { setMenu(null); menu.item.onOpenOrigin?.(); }}>{menu.item.origin ?? t('ui.open')}</MenuItem> : null}
            {menu.item.url ? <MenuItem icon={Download} onSelect={() => { setMenu(null); window.open(menu.item.url!, '_blank', 'noopener'); }}>{t('ui.download')}</MenuItem> : null}
            {menu.item.url ? <MenuItem icon={Link2} onSelect={() => { setMenu(null); void copyLink(menu.item); }}>{t('views.copyLink')}</MenuItem> : null}
          </>
        ) : null}
      </ContextMenu>
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
