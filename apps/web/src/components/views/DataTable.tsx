// Data table (spec 021): resizable columns (remembered), sticky header and first column, sort by
// clicking a header, collapsible groups with counts, multi-select with a bulk action bar, and a card
// list on phones (a table is not shrunk, it is re-laid out).
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, SearchX, X } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';
import { EmptyState } from '../kit.tsx';
import { groupRows, type FieldDef, type ViewState } from './engine.ts';
import { useBucketLabels } from './Toolbar.tsx';

export interface Column<T> {
  key: string;
  label: string;
  width?: number;
  align?: 'right';
  cell: (row: T) => ReactNode;
  /** Shown in the phone card (defaults to true). */
  mobile?: boolean;
}

export function DataTable<T>({
  rows, columns, fields, state, update, rowId, onRowClick, bulkActions, onAdd, addLabel, empty, groupHeader,
}: {
  rows: T[];
  columns: Column<T>[];
  fields: FieldDef<T>[];
  state: ViewState;
  update: (patch: Partial<ViewState>) => void;
  rowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  bulkActions?: (ids: string[], clear: () => void) => ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  empty?: ReactNode;
  groupHeader?: (groupKey: string, rows: T[]) => ReactNode;
}) {
  const { t } = useI18n();
  const labels = useBucketLabels();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visible = columns.filter((column, index) => index === 0 || !state.hidden.includes(column.key));
  const sortable = new Set(fields.filter((field) => field.sortable !== false).map((field) => field.key));

  const widthOf = (column: Column<T>) => state.widths[column.key] ?? column.width ?? 160;
  const [resizing, setResizing] = useState<string | null>(null);
  const startResize = (event: React.PointerEvent<HTMLSpanElement>, column: Column<T>) => {
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget; target.setPointerCapture(event.pointerId);
    const x0 = event.clientX; const w0 = widthOf(column);
    setResizing(column.key);
    const onMove = (move: PointerEvent) => update({ widths: { ...state.widths, [column.key]: Math.max(64, Math.min(640, Math.round(w0 + move.clientX - x0))) } });
    const onUp = () => { target.removeEventListener('pointermove', onMove); target.removeEventListener('pointerup', onUp); setResizing(null); };
    target.addEventListener('pointermove', onMove); target.addEventListener('pointerup', onUp);
  };
  const groups = groupRows(rows, fields, state.group, labels);
  const ids = rows.map(rowId);
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
  const someOn = ids.some((id) => selected.has(id));
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const clear = () => setSelected(new Set());
  const totalWidth = visible.reduce((sum, column) => sum + widthOf(column), 0) + (bulkActions ? 40 : 0);

  if (!rows.length) {
    return <>{empty ?? <EmptyState icon={SearchX} title={t('ui.noResults')} text={t('ui.noResultsText')} />}</>;
  }

  const sortIcon = (key: string) => (state.sort?.key === key ? (state.sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null);
  const headerClick = (key: string) => {
    if (!sortable.has(key)) return;
    update({ sort: state.sort?.key === key ? (state.sort.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 } });
  };

  return (
    <>
      <div className="dt-wrap hide-m">
        <table className="dt" style={{ width: totalWidth }} aria-rowcount={rows.length}>
          <colgroup>
            {bulkActions ? <col style={{ width: 40 }} /> : null}
            {visible.map((column) => <col key={column.key} style={{ width: widthOf(column) }} />)}
          </colgroup>
          <thead>
            <tr>
              {bulkActions ? (
                <th className="sticky-col" style={{ left: 0 }}>
                  <input type="checkbox" aria-label={t('views.selectAll')} checked={allOn}
                    ref={(element) => { if (element) element.indeterminate = someOn && !allOn; }}
                    onChange={() => setSelected(allOn ? new Set() : new Set(ids))} />
                </th>
              ) : null}
              {visible.map((column, index) => {
                return (
                  <th key={column.key} className={index === 0 ? 'sticky-col' : ''} style={{ ...(index === 0 ? { left: bulkActions ? 40 : 0 } : {}), textAlign: column.align ?? 'left' }}
                    aria-sort={state.sort?.key === column.key ? (state.sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                    <div className="th-in" style={{ justifyContent: column.align === 'right' ? 'flex-end' : 'flex-start' }} onClick={() => headerClick(column.key)}>
                      {column.label}{sortIcon(column.key)}
                    </div>
                    <span className={`rsz ${resizing === column.key ? 'on' : ''}`} role="separator" aria-label={t('views.resizeColumn')}
                      onPointerDown={(event) => startResize(event, column)} onClick={(event) => event.stopPropagation()} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const collapsed = state.collapsed.includes(group.key);
              return [
                state.group ? (
                  <tr key={`g-${group.key}`} className="group-row"
                    onClick={() => update({ collapsed: collapsed ? state.collapsed.filter((key) => key !== group.key) : [...state.collapsed, group.key] })}>
                    <td colSpan={visible.length + (bulkActions ? 1 : 0)}>
                      <span className="row tight nowrap">
                        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        {group.color ? <span className="dot" style={{ ['--c' as string]: group.color }} /> : null}
                        {group.label}<span className="faint" style={{ fontWeight: 500 }}>{group.rows.length}</span>
                        {groupHeader ? <span className="sp" /> : null}
                        {groupHeader?.(group.key, group.rows)}
                      </span>
                    </td>
                  </tr>
                ) : null,
                ...(collapsed ? [] : group.rows.map((original) => {
                  const id = rowId(original);
                  return (
                    <tr key={id} className={selected.has(id) ? 'sel' : ''}>
                      {bulkActions ? (
                        <td className="sticky-col" style={{ left: 0 }}>
                          <input type="checkbox" aria-label={t('views.selectRow')} checked={selected.has(id)} onChange={() => toggle(id)} />
                        </td>
                      ) : null}
                      {visible.map((column, index) => (
                        <td key={column.key} className={`${index === 0 ? 'sticky-col' : ''} ${onRowClick ? 'clickable' : ''} ${column.align === 'right' ? 'num-cell' : ''}`}
                          style={index === 0 ? { left: bulkActions ? 40 : 0, fontWeight: 550 } : undefined}
                          onClick={() => onRowClick?.(original)}>
                          {column.cell(original)}
                        </td>
                      ))}
                    </tr>
                  );
                })),
              ];
            })}
            {onAdd ? (
              <tr className="add-row" onClick={onAdd}>
                <td colSpan={visible.length + (bulkActions ? 1 : 0)}><span className="row tight"><Plus size={14} />{addLabel}</span></td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="dt-cards only-m">
        {rows.map((row) => (
          <button key={rowId(row)} type="button" className="dt-card" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: onRowClick ? 'pointer' : 'default' }} onClick={() => onRowClick?.(row)}>
            <div style={{ fontWeight: 600 }}>{columns[0]!.cell(row)}</div>
            {columns.slice(1).filter((column) => column.mobile !== false && !state.hidden.includes(column.key)).slice(0, 4).map((column) => (
              <div key={column.key} className="dc-row"><span>{column.label}</span><span>{column.cell(row)}</span></div>
            ))}
          </button>
        ))}
        {onAdd ? <button type="button" className="btn secondary" onClick={onAdd}><Plus size={15} />{addLabel}</button> : null}
      </div>
      {bulkActions && selected.size ? (
        <div className="bulkbar" role="toolbar" aria-label={t('ui.selected', { count: selected.size })}>
          <b style={{ fontWeight: 600 }}>{t('ui.selected', { count: selected.size })}</b>
          {bulkActions([...selected], clear)}
          <button type="button" className="btn small" aria-label={t('ui.clearSelection')} onClick={clear}><X size={14} /></button>
        </div>
      ) : null}
    </>
  );
}
