// Kanban board (spec 021): drag a card to another column with the mouse, a finger (long press) or the
// keyboard (space, arrows, space). Columns collapse into a narrow strip that still accepts cards. A
// refused move (a rule of the domain) puts the card back and says why. Each column has a menu (add,
// collapse, actions on all its cards); each card a menu (right click or « … » on hover); « + » opens a
// quick composer at the bottom of a column (Enter adds and stays open, Escape closes).
import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronsLeftRight, Ellipsis, Plus } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';
import { ContextMenu, MenuItem, menuAt, MenuSep, type MenuAt } from '../kit.tsx';

export interface BoardColumn { key: string; label: string; icon?: ReactNode; color?: string; locked?: boolean }

const MenuCtx = createContext<((id: string, at: MenuAt) => void) | null>(null);

function Card({ id, children, onOpen, disabled }: { id: string; children: ReactNode; onOpen?: () => void; disabled?: boolean }) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  const openMenu = useContext(MenuCtx);
  return (
    <div ref={setNodeRef} className={`kcard ${isDragging ? 'dragging' : ''}`} {...attributes} {...listeners}
      onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter') onOpen?.(); listeners?.onKeyDown?.(event); }}
      onContextMenu={openMenu ? (event) => openMenu(id, menuAt(event)) : undefined}>
      {children}
      {openMenu ? (
        <button type="button" className="icon-btn sm kmenu" aria-label={t('views.actions')} onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => openMenu(id, menuAt(event))}><Ellipsis size={14} /></button>
      ) : null}
    </div>
  );
}

function Composer({ onAdd, onClose, placeholder }: { onAdd: (title: string) => Promise<void> | void; onClose: () => void; placeholder: string }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <textarea className="kcomposer" autoFocus rows={2} value={value} placeholder={placeholder} disabled={busy}
      onChange={(event) => setValue(event.target.value)} onBlur={() => { if (!value.trim()) onClose(); }}
      onKeyDown={async (event) => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (!value.trim()) return;
          setBusy(true);
          try { await onAdd(value.trim()); setValue(''); } finally { setBusy(false); }
        }
      }} />
  );
}

function Column({ column, count, sum, collapsed, onToggle, children, onAdd, addLabel, menu, onQuickAdd }: {
  column: BoardColumn; count: number; sum?: ReactNode; collapsed: boolean; onToggle: () => void; children: ReactNode; onAdd?: () => void; addLabel?: string;
  menu?: (close: () => void) => ReactNode; onQuickAdd?: (title: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: column.key, disabled: column.locked });
  const [at, setAt] = useState<MenuAt>(null);
  const [composing, setComposing] = useState(false);
  const add = onQuickAdd ? () => setComposing(true) : onAdd;
  if (collapsed) {
    return (
      <div ref={setNodeRef} className={`bcol collapsed ${isOver ? 'over' : ''}`} role="button" tabIndex={0} aria-label={`${t('views.expand')} ${column.label}`} onClick={onToggle}
        onKeyDown={(event) => { if (event.key === 'Enter') onToggle(); }}>
        {column.icon}
        <span className="v-name">{column.label}<span className="faint">{count}</span></span>
      </div>
    );
  }
  return (
    <section ref={setNodeRef} className={`bcol ${isOver ? 'over' : ''}`} aria-label={column.label}>
      <div className="bcol-h">
        {column.icon}{column.color ? <span className="dot" style={{ ['--c' as string]: column.color }} /> : null}
        <span>{column.label}</span><span className="cnt">{count}</span>
        {sum ? <span className="sum">{sum}</span> : <span className="sp" />}
        {add ? <button type="button" className="icon-btn sm" aria-label={addLabel} title={addLabel} onClick={add}><Plus size={13} /></button> : null}
        <button type="button" className="icon-btn sm" aria-label={t('views.columnMenu')} onClick={(event) => setAt(menuAt(event))}><Ellipsis size={14} /></button>
      </div>
      <div className="bcol-b">
        {children}
        {composing && onQuickAdd ? <Composer onAdd={onQuickAdd} onClose={() => setComposing(false)} placeholder={t('views.composerHint')} /> : null}
        {add && !composing ? <button type="button" className="btn ghost small" style={{ justifyContent: 'flex-start' }} onClick={add}><Plus size={14} />{addLabel}</button> : null}
      </div>
      <ContextMenu at={at} onClose={() => setAt(null)}>
        {add ? <MenuItem icon={Plus} onSelect={() => { setAt(null); add(); }}>{addLabel}</MenuItem> : null}
        <MenuItem icon={ChevronsLeftRight} onSelect={() => { setAt(null); onToggle(); }}>{t('views.collapseColumn')}</MenuItem>
        {menu ? <><MenuSep />{menu(() => setAt(null))}</> : null}
      </ContextMenu>
    </section>
  );
}

export function Board<T>({ rows, columns, columnOf, rowId, renderCard, onMove, onOpen, collapsed, onCollapsedChange, sumOf, onAdd, addLabel, canDrag, cardMenu, columnMenu, onQuickAdd }: {
  rows: T[];
  columns: BoardColumn[];
  columnOf: (row: T) => string;
  rowId: (row: T) => string;
  renderCard: (row: T) => ReactNode;
  /** Persists a move; throws (or rejects) when the domain refuses it. */
  onMove?: (row: T, to: string) => Promise<void> | void;
  onOpen?: (row: T) => void;
  collapsed: string[];
  onCollapsedChange: (keys: string[]) => void;
  sumOf?: (rows: T[]) => ReactNode;
  onAdd?: (column: string) => void;
  addLabel?: string;
  canDrag?: (row: T) => boolean;
  /** The menu of a card (right click, or « … » on hover). */
  cardMenu?: (row: T, close: () => void) => ReactNode;
  /** Actions on a whole column (« mark all as… », « remind all »…), under add and collapse. */
  columnMenu?: (column: string, rows: T[], close: () => void) => ReactNode;
  /** Quick composer: a title typed at the bottom of the column creates an item in it. */
  onQuickAdd?: (column: string, title: string) => Promise<void> | void;
}) {
  const [cardAt, setCardAt] = useState<{ id: string; at: MenuAt } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const placed = (row: T) => pending[rowId(row)] ?? columnOf(row);
  const byId = new Map(rows.map((row) => [rowId(row), row]));
  const activeRow = active ? byId.get(active) : undefined;

  const onDragStart = (event: DragStartEvent) => setActive(String(event.active.id));
  const onDragEnd = async (event: DragEndEvent) => {
    setActive(null);
    const row = byId.get(String(event.active.id));
    const to = event.over?.id ? String(event.over.id) : null;
    if (!row || !to || to === placed(row) || !onMove) return;
    const id = rowId(row);
    setPending((current) => ({ ...current, [id]: to }));
    try {
      await onMove(row, to);
    } finally {
      setPending((current) => { const next = { ...current }; delete next[id]; return next; });
    }
  };
  const toggle = (key: string) => onCollapsedChange(collapsed.includes(key) ? collapsed.filter((item) => item !== key) : [...collapsed, key]);

  return (
    <MenuCtx.Provider value={cardMenu ? (id, at) => setCardAt({ id, at }) : null}>
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="board">
        {columns.map((column) => {
          const cards = rows.filter((row) => placed(row) === column.key);
          return (
            <Column key={column.key} column={column} count={cards.length} sum={sumOf?.(cards)} collapsed={collapsed.includes(column.key)} onToggle={() => toggle(column.key)}
              onAdd={onAdd ? () => onAdd(column.key) : undefined} addLabel={addLabel}
              menu={columnMenu ? (close) => columnMenu(column.key, cards, close) : undefined}
              onQuickAdd={onQuickAdd && !column.locked ? (title) => onQuickAdd(column.key, title) : undefined}>
              {cards.map((row) => (
                <Card key={rowId(row)} id={rowId(row)} onOpen={onOpen ? () => onOpen(row) : undefined} disabled={!onMove || (canDrag ? !canDrag(row) : false)}>
                  {renderCard(row)}
                </Card>
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>{activeRow ? <div className="kcard overlay">{renderCard(activeRow)}</div> : null}</DragOverlay>
      <ContextMenu at={cardAt?.at ?? null} onClose={() => setCardAt(null)}>
        {cardAt && cardMenu && byId.get(cardAt.id) ? cardMenu(byId.get(cardAt.id)!, () => setCardAt(null)) : null}
      </ContextMenu>
    </DndContext>
    </MenuCtx.Provider>
  );
}
