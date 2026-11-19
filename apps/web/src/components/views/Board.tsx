// Kanban board (spec 021): drag a card to another column with the mouse, a finger (long press) or the
// keyboard (space, arrows, space). Columns collapse into a narrow strip that still accepts cards. A
// refused move (a rule of the domain) puts the card back and says why.
import { useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronsLeftRight, Plus } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';

export interface BoardColumn { key: string; label: string; icon?: ReactNode; color?: string; locked?: boolean }

function Card({ id, children, onOpen, disabled }: { id: string; children: ReactNode; onOpen?: () => void; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  return (
    <div ref={setNodeRef} className={`kcard ${isDragging ? 'dragging' : ''}`} {...attributes} {...listeners}
      onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter') onOpen?.(); listeners?.onKeyDown?.(event); }}>
      {children}
    </div>
  );
}

function Column({ column, count, sum, collapsed, onToggle, children, onAdd, addLabel }: {
  column: BoardColumn; count: number; sum?: ReactNode; collapsed: boolean; onToggle: () => void; children: ReactNode; onAdd?: () => void; addLabel?: string;
}) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: column.key, disabled: column.locked });
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
        <button type="button" className="icon-btn sm" aria-label={t('views.collapse')} onClick={onToggle}><ChevronsLeftRight size={13} /></button>
      </div>
      <div className="bcol-b">
        {children}
        {onAdd ? <button type="button" className="btn ghost small" style={{ justifyContent: 'flex-start' }} onClick={onAdd}><Plus size={14} />{addLabel}</button> : null}
      </div>
    </section>
  );
}

export function Board<T>({ rows, columns, columnOf, rowId, renderCard, onMove, onOpen, collapsed, onCollapsedChange, sumOf, onAdd, addLabel, canDrag }: {
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
}) {
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
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="board">
        {columns.map((column) => {
          const cards = rows.filter((row) => placed(row) === column.key);
          return (
            <Column key={column.key} column={column} count={cards.length} sum={sumOf?.(cards)} collapsed={collapsed.includes(column.key)} onToggle={() => toggle(column.key)}
              onAdd={onAdd ? () => onAdd(column.key) : undefined} addLabel={addLabel}>
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
    </DndContext>
  );
}
