// Gantt timeline (spec 021): weeks or months, two-level header, shaded weekends, a « today » line the
// view opens on, bars with their progress drawn inside, milestones as diamonds, dependency curves
// (dashed when the order is broken). Bars and milestones move with the mouse or a finger (pointer
// events, snapped to the day); the right edge of a bar changes its end.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Crosshair } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';
import { ContextMenu, Seg, type MenuAt } from '../kit.tsx';

export type GanttItem =
  | { type: 'group'; id: string; label: ReactNode; extra?: ReactNode }
  | { type: 'bar'; id: string; label: ReactNode; start: string; end: string; progress?: number; color?: string; suspended?: boolean; thin?: boolean; late?: boolean; title?: string; onOpen?: () => void; editable?: boolean;
      /** A summary row that folds its children; folded, its milestones are drawn on the bar. */
      fold?: { open: boolean; onToggle: () => void; markers?: { id: string; date: string; status: 'reached' | 'late' | 'pending' | 'in_progress'; caption?: string; onOpen?: () => void }[] } }
  | { type: 'ms'; id: string; label: ReactNode; date: string; status: 'reached' | 'late' | 'pending' | 'in_progress'; delay?: number; onOpen?: () => void; editable?: boolean; caption?: string };

export interface GanttDep { from: string; to: string }

const DAY = 86400000;
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parse = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
const diff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);
export const shiftIso = (value: string, days: number) => iso(addDays(parse(value), days));

const ROW = 38;

export function Gantt({ items, deps = [], onMoveBar, onResizeBar, onMoveMilestone, leftLabel, emptyText, itemMenu, header, initialZoom = 'week' }: {
  items: GanttItem[];
  deps?: GanttDep[];
  onMoveBar?: (id: string, days: number) => void;
  onResizeBar?: (id: string, days: number) => void;
  onMoveMilestone?: (id: string, days: number) => void;
  leftLabel: string;
  emptyText?: ReactNode;
  /** The menu of a bar or a milestone (right click). */
  itemMenu?: (id: string, close: () => void) => ReactNode;
  /** Shown above the timeline (layers, legend). */
  header?: ReactNode;
  initialZoom?: 'week' | 'month';
}) {
  const [menu, setMenu] = useState<{ id: string; at: MenuAt } | null>(null);
  const onMenu = (id: string) => (itemMenu ? (event: React.MouseEvent) => { event.preventDefault(); setMenu({ id, at: { x: event.clientX, y: event.clientY } }); } : undefined);
  const { t, locale } = useI18n();
  const [zoom, setZoom] = useState<'week' | 'month'>(initialZoom);
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; kind: 'move' | 'end' | 'ms'; dx: number } | null>(null);
  const suppressClick = useRef(false);
  const dayW = zoom === 'week' ? 30 : 7;
  const [LEFT, setLeft] = useState(260);
  useEffect(() => {
    const query = matchMedia('(max-width: 860px)');
    const sync = () => setLeft(query.matches ? 150 : 260);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  const today = useMemo(() => { const date = new Date(); date.setHours(12, 0, 0, 0); return date; }, []);

  const [rangeStart, days] = useMemo(() => {
    const dates: Date[] = [today];
    for (const item of items) {
      if (item.type === 'bar') dates.push(parse(item.start), parse(item.end));
      if (item.type === 'ms') dates.push(parse(item.date));
    }
    const min = new Date(Math.min(...dates.map((date) => date.getTime())));
    const max = new Date(Math.max(...dates.map((date) => date.getTime())));
    const start = addDays(min, zoom === 'week' ? -10 : -20);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const total = Math.max(diff(max, start) + (zoom === 'week' ? 28 : 75), zoom === 'week' ? 84 : 240);
    return [start, total] as const;
  }, [items, zoom, today]);

  const x = (value: string | Date) => diff(typeof value === 'string' ? parse(value) : value, rangeStart) * dayW;
  const width = days * dayW;
  const todayX = x(today) + dayW / 2;

  // Opens on today, and again when the zoom changes (not when the rows change).
  const placed = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!scroller.current || !items.length || placed.current === zoom) return;
    placed.current = zoom;
    const target = Math.max(0, todayX - 220);
    // Once the browser has laid the timeline out (its width depends on fonts and the left column).
    requestAnimationFrame(() => requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollLeft = target; }));
  });

  // months and ticks
  const months: { label: string; from: number; span: number }[] = [];
  for (let index = 0; index < days; index++) {
    const date = addDays(rangeStart, index);
    const label = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { month: zoom === 'week' ? 'long' : 'short', year: 'numeric' }).format(date);
    const last = months[months.length - 1];
    if (last && last.label === label) last.span++;
    else months.push({ label, from: index, span: 1 });
  }
  const ticks = zoom === 'week'
    ? Array.from({ length: days }, (_, index) => addDays(rangeStart, index))
    : Array.from({ length: Math.ceil(days / 7) }, (_, index) => addDays(rangeStart, index * 7));

  const rowIndex = new Map(items.map((item, index) => [item.id, index]));
  const endX = (item: GanttItem) => item.type === 'bar' ? x(item.end) + dayW : item.type === 'ms' ? x(item.date) + dayW / 2 : 0;
  const startX = (item: GanttItem) => item.type === 'bar' ? x(item.start) : item.type === 'ms' ? x(item.date) + dayW / 2 - 7 : 0;
  const byId = new Map(items.map((item) => [item.id, item]));

  const begin = (event: React.PointerEvent, id: string, kind: 'move' | 'end' | 'ms') => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const x0 = event.clientX;
    let moved = false;
    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - x0;
      if (Math.abs(dx) > 4) moved = true;
      if (moved) setDrag({ id, kind, dx: Math.round(dx / dayW) * dayW });
    };
    const onUp = (up: PointerEvent) => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (!moved) return;
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 80);
      const shift = Math.round((up.clientX - x0) / dayW);
      if (!shift) return;
      if (kind === 'move') onMoveBar?.(id, shift);
      if (kind === 'end') onResizeBar?.(id, shift);
      if (kind === 'ms') onMoveMilestone?.(id, shift);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  const open = (handler?: () => void) => () => { if (!suppressClick.current) handler?.(); };

  useEffect(() => { setDrag(null); }, [items]);

  if (!items.length) return <div className="stack" style={{ gap: '.5rem' }}>{header}<div className="card muted">{emptyText}</div></div>;

  const height = items.length * ROW;
  const weekend = zoom === 'week'
    ? Array.from({ length: days }, (_, index) => addDays(rangeStart, index)).map((date, index) => (date.getDay() === 0 || date.getDay() === 6 ? (
      <div key={index} className="gx-we" style={{ left: index * dayW, width: dayW }} />
    ) : null))
    : null;
  const lines = Array.from({ length: Math.ceil(days / 7) }, (_, index) => <div key={index} className="gx-gl" style={{ left: index * 7 * dayW }} />);

  const depPaths = deps.map((dep) => {
    const from = byId.get(dep.from); const to = byId.get(dep.to);
    const fromRow = rowIndex.get(dep.from); const toRow = rowIndex.get(dep.to);
    if (!from || !to || fromRow === undefined || toRow === undefined) return null;
    const x1 = endX(from); const y1 = fromRow * ROW + ROW / 2;
    const x2 = startX(to); const y2 = toRow * ROW + ROW / 2;
    const broken = x2 < x1 - 1;
    const mid = Math.max(x1 + 12, x2 - 12);
    return (
      <g key={`${dep.from}-${dep.to}`}>
        <path d={`M${x1} ${y1} C ${mid} ${y1}, ${Math.min(x1 + 12, x2 - 12)} ${y2}, ${x2 - 1} ${y2}`} fill="none" stroke={broken ? 'var(--bad)' : 'var(--ink-faint)'} strokeWidth="1.3" strokeDasharray={broken ? '3 3' : undefined} />
        <path d={`M${x2 - 6} ${y2 - 3.5} L${x2 - 1} ${y2} L${x2 - 6} ${y2 + 3.5}`} fill="none" stroke={broken ? 'var(--bad)' : 'var(--ink-faint)'} strokeWidth="1.3" strokeLinecap="round" />
      </g>
    );
  });

  return (
    <div className="stack" style={{ gap: '.5rem' }}>
      {header}
      <div className="row tight">
        <Seg label={t('views.timeline')} value={zoom} onChange={setZoom} items={[{ value: 'week', label: t('views.weeks') }, { value: 'month', label: t('views.months') }]} />
        <button type="button" className="btn ghost small" onClick={() => { if (scroller.current) scroller.current.scrollTo({ left: Math.max(0, todayX - 220), behavior: 'smooth' }); }}>
          <Crosshair size={14} />{t('views.todayButton')}
        </button>
      </div>
      <div ref={scroller} className="gs" role="grid" aria-label={leftLabel}>
        <div className="gs-inner" style={{ width: LEFT + width }}>
          <div className="gs-head" style={{ width: LEFT + width }}>
            <div className="gs-corner">{leftLabel}</div>
            <div style={{ width }}>
              <div className="gx-months">{months.map((month) => <div key={month.from} style={{ width: month.span * dayW }}>{month.label}</div>)}</div>
              <div className="gx-ticks">
                {ticks.map((date, index) => (
                  <div key={index} style={{ width: zoom === 'week' ? dayW : dayW * 7 }} className={zoom === 'week' && diff(date, today) === 0 ? 'today' : ''}>
                    {zoom === 'week' ? date.getDate() : new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }).format(date)}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="gs-body" style={{ height }}>
            <div className="gs-canvas" style={{ left: LEFT, width, height }}>
              {weekend}{lines}
              <div className="gx-today" style={{ left: todayX }} title={t('ui.today')} />
              <svg className="gx-deps" width={width} height={height} aria-hidden>{depPaths}</svg>
            </div>
            {items.map((item, index) => {
              const top = index * ROW;
              const isDrag = drag?.id === item.id;
              return (
                <div key={item.id} className={`gs-row ${item.type === 'group' ? 'g' : ''}`} style={{ top, width: LEFT + width }}>
                  <div className={`gs-left ${item.type === 'ms' ? 'ms' : ''}`}>
                    {item.type === 'ms' ? <span className={`gx-ms-mini ${item.status}`} aria-hidden /> : null}
                    {item.type === 'bar' && item.fold ? (
                      <button type="button" className="icon-btn sm" aria-expanded={item.fold.open} aria-label={item.fold.open ? t('views.collapse') : t('views.expand')}
                        onClick={item.fold.onToggle}>{item.fold.open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                    ) : null}
                    <span className="trunc grow">{item.label}</span>
                    {item.type === 'group' ? item.extra : null}
                  </div>
                  {item.type === 'bar' ? (() => {
                    const left = x(item.start) + (isDrag && drag.kind === 'move' ? drag.dx : 0);
                    const w = Math.max(dayW, x(item.end) - x(item.start) + dayW + (isDrag && drag.kind === 'end' ? drag.dx : 0));
                    const inside = w > 120;
                    return (
                      <>
                        <div className={`gx-bar ${item.suspended ? 'suspended' : ''} ${item.thin ? 'thin' : ''} ${item.late ? 'late' : ''} ${isDrag ? 'dragging' : ''}`}
                          style={{ left: LEFT + left, top: item.thin ? 12 : 8, width: w, ['--c' as string]: item.color ?? 'var(--brand)', cursor: item.editable && onMoveBar ? undefined : 'pointer' }}
                          title={item.title} role="button" tabIndex={0} aria-label={item.title}
                          onPointerDown={item.editable && onMoveBar ? (event) => begin(event, item.id, 'move') : undefined}
                          onClick={open(item.onOpen)} onContextMenu={onMenu(item.id)} onKeyDown={(event) => { if (event.key === 'Enter') item.onOpen?.(); }}>
                          {!item.suspended ? <span className="pf" style={{ width: `${Math.max(0, Math.min(100, item.progress ?? 0))}%` }} /> : null}
                          {inside ? <span className="lb">{item.progress !== undefined ? `${Math.round(item.progress)} %` : ''}</span> : null}
                          {item.editable && onResizeBar ? <span className="h r" onPointerDown={(event) => begin(event, item.id, 'end')} /> : null}
                        </div>
                        {item.fold && !item.fold.open ? item.fold.markers?.map((marker) => (
                          <span key={marker.id} className={`gx-ms small ${marker.status}`} title={marker.caption} aria-label={marker.caption}
                            role="button" tabIndex={0} onClick={marker.onOpen} onContextMenu={onMenu(marker.id)}
                            onKeyDown={(event) => { if (event.key === 'Enter') marker.onOpen?.(); }}
                            style={{ left: LEFT + x(marker.date) + dayW / 2 - 5, top: 14 }} />
                        )) : null}
                        {!inside ? <span className="gx-out" style={{ left: LEFT + left + w + 6, top: 11 }}>{item.progress !== undefined ? `${Math.round(item.progress)} %` : ''}</span> : null}
                      </>
                    );
                  })() : null}
                  {item.type === 'ms' ? (() => {
                    const left = x(item.date) + dayW / 2 - 7 + (isDrag ? drag.dx : 0);
                    return (
                      <>
                        <span className={`gx-ms ${item.status}`} style={{ left: LEFT + left, top: 12 }} role="button" tabIndex={0} title={item.caption}
                          aria-label={item.caption}
                          onPointerDown={item.editable && onMoveMilestone ? (event) => begin(event, item.id, 'ms') : undefined}
                          onClick={open(item.onOpen)} onContextMenu={onMenu(item.id)} onKeyDown={(event) => { if (event.key === 'Enter') item.onOpen?.(); }} />
                        {item.status === 'late' && item.delay ? (
                          <span className="gx-ms-lbl late" style={{ left: LEFT + left + 20, top: 11 }}>+{item.delay} j</span>
                        ) : null}
                      </>
                    );
                  })() : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <ContextMenu at={menu?.at ?? null} onClose={() => setMenu(null)}>{menu && itemMenu ? itemMenu(menu.id, () => setMenu(null)) : null}</ContextMenu>
    </div>
  );
}
