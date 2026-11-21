// One photo viewer for the whole product (spec 047): full screen over the page, previous and next
// with the arrows, a swipe or the thumbnails, the photo's context (site, phase, author, time, place),
// zoom on double click, download, and Escape to close. Neighbours are preloaded so browsing is instant.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, MapPin, SquareArrowOutUpRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';

export type ViewerPhoto = {
  url: string;
  /** First line under the photo (site, phase). */
  title?: string | null;
  /** Second line (author, time). */
  detail?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Where the photo comes from (its report), opened by « Ouvrir ». */
  href?: string | null;
};

type Open = (photos: ViewerPhoto[], index?: number) => void;
const ViewerContext = createContext<Open>(() => undefined);

/** Opens the viewer from anywhere below the provider. */
export const usePhotoViewer = () => useContext(ViewerContext);

export function PhotoViewerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ photos: ViewerPhoto[]; index: number } | null>(null);
  const open = useCallback<Open>((photos, index = 0) => { if (photos.length) setState({ photos, index: Math.min(Math.max(index, 0), photos.length - 1) }); }, []);
  return (
    <ViewerContext.Provider value={open}>
      {children}
      {state ? <Viewer photos={state.photos} start={state.index} onClose={() => setState(null)} /> : null}
    </ViewerContext.Provider>
  );
}

function Viewer({ photos, start, onClose }: { photos: ViewerPhoto[]; start: number; onClose: () => void }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(start);
  const [zoom, setZoom] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const photo = photos[index]!;
  const many = photos.length > 1;
  const go = useCallback((step: number) => { setZoom(false); setIndex((value) => (value + step + photos.length) % photos.length); }, [photos.length]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      else if (event.key === 'ArrowRight' && many) { event.preventDefault(); go(1); }
      else if (event.key === 'ArrowLeft' && many) { event.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, many, onClose]);
  // Preload the neighbours, and keep the current thumbnail in view.
  useEffect(() => {
    for (const step of [1, -1, 2]) { const next = photos[(index + step + photos.length) % photos.length]; if (next) new Image().src = next.url; }
    strip.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [index, photos]);

  const place = photo.latitude != null && photo.longitude != null
    ? `https://www.openstreetmap.org/?mlat=${photo.latitude}&mlon=${photo.longitude}#map=17/${photo.latitude}/${photo.longitude}` : null;
  return createPortal(
    <div className="pv" role="dialog" aria-modal="true" aria-label={t('viewer.label')}>
      <div className="pv-top">
        <span className="pv-count">{many ? t('viewer.count', { i: index + 1, n: photos.length }) : null}</span>
        <div className="pv-tools">
          <button type="button" className="pv-btn" onClick={() => setZoom((value) => !value)} aria-pressed={zoom} aria-label={zoom ? t('viewer.zoomOut') : t('viewer.zoomIn')}>{zoom ? <ZoomOut size={18} /> : <ZoomIn size={18} />}</button>
          <a className="pv-btn" href={photo.url} download aria-label={t('viewer.download')}><Download size={18} /></a>
          <button ref={closeRef} type="button" className="pv-btn" onClick={onClose} aria-label={t('viewer.close')}><X size={20} /></button>
        </div>
      </div>
      <div className={`pv-stage ${zoom ? 'zoomed' : ''}`}
        onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
        onPointerDown={(event) => { if (!zoom) swipe.current = { x: event.clientX, y: event.clientY }; }}
        onPointerUp={(event) => {
          const from = swipe.current; swipe.current = null;
          if (!from || zoom || !many) return;
          const dx = event.clientX - from.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(event.clientY - from.y)) go(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => { swipe.current = null; }}>
        {many ? <button type="button" className="pv-nav prev" onClick={() => go(-1)} aria-label={t('viewer.prev')}><ChevronLeft size={28} /></button> : null}
        <img key={photo.url} src={photo.url} alt={photo.title ?? ''} onDoubleClick={() => setZoom((value) => !value)} draggable={false} />
        {many ? <button type="button" className="pv-nav next" onClick={() => go(1)} aria-label={t('viewer.next')}><ChevronRight size={28} /></button> : null}
      </div>
      <div className="pv-foot">
        <div className="pv-caption">
          {photo.title ? <b>{photo.title}</b> : null}
          <span>
            {photo.detail ?? null}
            {place ? <a href={place} target="_blank" rel="noreferrer"><MapPin size={13} />{t('viewer.place')}</a> : null}
            {photo.href ? <a href={photo.href}><SquareArrowOutUpRight size={13} />{t('viewer.open')}</a> : null}
          </span>
        </div>
        {many ? (
          <div className="pv-strip" ref={strip}>
            {photos.map((item, position) => (
              <button key={`${item.url}-${position}`} type="button" aria-current={position === index} aria-label={t('viewer.count', { i: position + 1, n: photos.length })}
                onClick={() => { setZoom(false); setIndex(position); }}>
                <img src={item.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
