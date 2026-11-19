// Calendar (spec 021): month and week views, « +N more » past three items, drag an item onto another
// day (mouse, finger or keyboard) to change its date when the item allows it, « + » on a day to create
// something on that date, right click (or long press) on an item for its menu.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';
import { ContextMenu, Popover, Seg, type MenuAt } from '../kit.tsx';

export interface CalItem { id: string; date: string; label: string; color?: string; icon?: ReactNode; movable?: boolean; onOpen?: () => void; done?: boolean }

interface CalContext { onAdd?: (date: string) => void; addLabel?: string; openMenu?: (item: CalItem, at: MenuAt) => void }
const Ctx = createContext<CalContext>({});

const DAY = 86400000;
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const atNoon = (date: Date) => { const copy = new Date(date); copy.setHours(12, 0, 0, 0); return copy; };
const startOfWeek = (date: Date) => { const copy = atNoon(date); copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7)); return copy; };

function Chip({ item }: { item: CalItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: !item.movable });
  const { openMenu } = useContext(Ctx);
  return (
    <button ref={setNodeRef} type="button" className={`cev ${item.done ? 'done' : ''}`} style={{ ['--c' as string]: item.color ?? 'var(--brand)', opacity: isDragging ? .4 : 1 }}
      title={item.label} {...attributes} {...listeners} onClick={item.onOpen}
      onContextMenu={openMenu ? (event) => { event.preventDefault(); openMenu(item, { x: event.clientX, y: event.clientY }); } : undefined}>
      {item.icon}<span>{item.label}</span>
    </button>
  );
}

function Day({ date, items, out, isToday, week }: { date: Date; items: CalItem[]; out?: boolean; isToday: boolean; week?: boolean }) {
  const { t, locale } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: iso(date) });
  const { onAdd, addLabel } = useContext(Ctx);
  const shown = week ? items : items.slice(0, 3);
  const add = onAdd ? (
    <button type="button" className="cadd" aria-label={`${addLabel ?? ''} ${iso(date)}`} title={addLabel} onClick={() => onAdd(iso(date))}><Plus size={13} /></button>
  ) : null;
  if (week) {
    return (
      <div className="wcol">
        <div className={`wcol-h ${isToday ? 'today' : ''}`}>
          <span className="n">{date.getDate()}</span>
          <span className="muted small">{new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short' }).format(date)}</span>
          <span className="sp" />{add}
        </div>
        <div ref={setNodeRef} className={`wcol-b ${isOver ? 'over' : ''}`}>
          {shown.map((item) => <Chip key={item.id} item={item} />)}
          {!items.length ? <span className="faint xsmall">{t('views.nothingThisDay')}</span> : null}
        </div>
      </div>
    );
  }
  return (
    <div ref={setNodeRef} className={`cday ${out ? 'out' : ''} ${isToday ? 'today' : ''} ${isOver ? 'over' : ''}`}>
      <span className="row nowrap" style={{ gap: 0 }}><span className="dn" aria-current={isToday ? 'date' : undefined}>{date.getDate()}</span><span className="sp" />{add}</span>
      {shown.map((item) => <Chip key={item.id} item={item} />)}
      {items.length > 3 ? (
        <Popover trigger={(props) => <button type="button" className="cmore" {...props}>{t('views.plusMore', { n: items.length - 3 })}</button>}>
          {() => <div className="stack" style={{ gap: 4, padding: 4, minWidth: 220 }}>{items.map((item) => <Chip key={item.id} item={item} />)}</div>}
        </Popover>
      ) : null}
    </div>
  );
}

export function Calendar({ items, onMove, onAdd, addLabel, itemMenu, header }: {
  items: CalItem[];
  onMove?: (id: string, date: string) => void;
  /** « + » on each day creates something on that date. */
  onAdd?: (date: string) => void;
  addLabel?: string;
  /** The menu of an item (right click). */
  itemMenu?: (item: CalItem, close: () => void) => ReactNode;
  /** Shown above the grid (layers, legend). */
  header?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const [menu, setMenu] = useState<{ item: CalItem; at: MenuAt } | null>(null);
  const context = useMemo<CalContext>(() => ({ onAdd, addLabel, openMenu: itemMenu ? (item, at) => setMenu({ item, at }) : undefined }), [onAdd, addLabel, itemMenu]);
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(() => atNoon(new Date()));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const todayIso = iso(new Date());
  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const item of items) { const key = item.date.slice(0, 10); map.set(key, [...(map.get(key) ?? []), item]); }
    return map;
  }, [items]);
  const fmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric' });
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short' }).format(new Date(2024, 0, 1 + index)));

  let label: string; let body: ReactNode;
  if (mode === 'month') {
    label = fmt.format(cursor);
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const start = startOfWeek(first);
    let cells = Array.from({ length: 42 }, (_, index) => new Date(start.getTime() + index * DAY));
    if (cells[35]!.getMonth() !== cursor.getMonth()) cells = cells.slice(0, 35);
    body = (
      <>
        <div className="cal-h">{weekdays.map((day) => <div key={day}>{day}</div>)}</div>
        <div className="cal-g">{cells.map((date) => (
          <Day key={iso(date)} date={date} items={byDay.get(iso(date)) ?? []} out={date.getMonth() !== cursor.getMonth()} isToday={iso(date) === todayIso} />
        ))}</div>
      </>
    );
  } else {
    const start = startOfWeek(cursor);
    const dates = Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + index * DAY));
    const short = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' });
    label = `${short.format(dates[0]!)} – ${short.format(dates[6]!)}`;
    body = <div className="week">{dates.map((date) => <Day key={iso(date)} date={date} items={byDay.get(iso(date)) ?? []} isToday={iso(date) === todayIso} week />)}</div>;
  }
  const step = (direction: number) => {
    const next = new Date(cursor);
    if (mode === 'month') next.setMonth(next.getMonth() + direction, 1);
    else next.setDate(next.getDate() + direction * 7);
    setCursor(atNoon(next));
  };
  const onDragEnd = (event: DragEndEvent) => {
    const id = String(event.active.id); const to = event.over ? String(event.over.id) : null;
    const item = items.find((candidate) => candidate.id === id);
    if (item && to && to !== item.date.slice(0, 10)) onMove?.(id, to);
  };
  return (
    <Ctx.Provider value={context}>
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {header}
      <div className="cal">
        <div className="toolbar" style={{ padding: '.5rem .75rem', borderBottom: '1px solid var(--line)' }}>
          <button type="button" className="btn neutral small" onClick={() => setCursor(atNoon(new Date()))}>{t('views.todayButton')}</button>
          <button type="button" className="icon-btn" aria-label={t('ui.previous')} onClick={() => step(-1)}><ChevronLeft size={16} /></button>
          <button type="button" className="icon-btn" aria-label={t('ui.next')} onClick={() => step(1)}><ChevronRight size={16} /></button>
          <h2 style={{ margin: 0, fontSize: '1rem', textTransform: 'capitalize' }} aria-live="polite">{label}</h2>
          <span className="sp" />
          <Seg label={t('views.calendar')} value={mode} onChange={setMode} items={[{ value: 'month', label: t('views.month') }, { value: 'week', label: t('views.week') }]} />
        </div>
        {body}
      </div>
      <ContextMenu at={menu?.at ?? null} onClose={() => setMenu(null)}>{menu && itemMenu ? itemMenu(menu.item, () => setMenu(null)) : null}</ContextMenu>
    </DndContext>
    </Ctx.Provider>
  );
}
