// Data table (spec 021): resizable columns (remembered), sticky header and first column, sort by
// clicking a header, collapsible groups with counts and « + » to add into a group, multi-select with a
// bulk action bar (Escape clears it), cells edited in place (a picker opens on the cell), the first
// cell renamed by double click, a menu per row (right click or « … »), an empty state that offers to
// clear the filters, and a card list on phones (a table is not shrunk, it is re-laid out).
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Ellipsis, Plus, SearchX, X } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';
import { ContextMenu, EmptyState, menuAt, type MenuAt } from '../kit.tsx';
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
  /** Edits the cell in place: the picker opens on the cell instead of opening the row. */
  edit?: (row: T, close: () => void) => ReactNode;
}

export function DataTable<T>({
  rows, columns, fields, state, update, rowId, onRowClick, bulkActions, onAdd, addLabel, empty, groupHeader, rowMenu, onRename, renameOf, onAddInGroup,
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
  /** The menu of a row: right click, or the « … » at the end of the row. */
  rowMenu?: (row: T, close: () => void) => ReactNode;
  /** Renames from the first cell (double click, Enter saves, Escape cancels). */
  onRename?: (row: T, name: string) => Promise<void> | void;
  /** The current name the rename field starts from (defaults to the first field). */
  renameOf?: (row: T) => string;
  /** « + » in a group header adds an item already in that group. */
  onAddInGroup?: (groupKey: string) => void;
}) {
  const { t } = useI18n();
  const labels = useBucketLabels();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ row: T; at: MenuAt } | null>(null);
  const [editing, setEditing] = useState<{ row: T; column: Column<T>; at: MenuAt } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  useEffect(() => {
    if (!selected.size) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('.pop, .modal')) setSelected(new Set()); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected.size]);
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
  const totalWidth = visible.reduce((sum, column) => sum + widthOf(column), 0) + (bulkActions ? 40 : 0) + (rowMenu ? 40 : 0);

  const filtered = state.filters.length > 0 || state.q.trim() !== '';
  if (!rows.length) {
    if (filtered) {
      return <EmptyState icon={SearchX} title={t('ui.noResults')} text={t('views.noResultsFiltered')}
        action={<button type="button" className="btn secondary" onClick={() => update({ filters: [], q: '' })}><X size={15} />{t('views.clearFilters')}</button>} />;
    }
    return <>{empty ?? <EmptyState icon={SearchX} title={t('ui.noResults')} text={t('ui.noResultsText')} />}</>;
  }
  const extraCols = (bulkActions ? 1 : 0) + (rowMenu ? 1 : 0);

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
            {rowMenu ? <col style={{ width: 40 }} /> : null}
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
              {rowMenu ? <th aria-label={t('views.actions')} /> : null}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const collapsed = state.collapsed.includes(group.key);
              return [
                state.group ? (
                  <tr key={`g-${group.key}`} className="group-row"
                    onClick={() => update({ collapsed: collapsed ? state.collapsed.filter((key) => key !== group.key) : [...state.collapsed, group.key] })}>
                    <td colSpan={visible.length + extraCols}>
                      <span className="row tight nowrap">
                        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        {group.color ? <span className="dot" style={{ ['--c' as string]: group.color }} /> : null}
                        {group.label}<span className="faint" style={{ fontWeight: 500 }}>{group.rows.length}</span>
                        {onAddInGroup ? (
                          <button type="button" className="icon-btn sm" aria-label={`${addLabel ?? t('views.add')} · ${group.label}`} title={addLabel}
                            onClick={(event) => { event.stopPropagation(); onAddInGroup(group.key); }}><Plus size={13} /></button>
                        ) : null}
                        {groupHeader ? <span className="sp" /> : null}
                        {groupHeader?.(group.key, group.rows)}
                      </span>
                    </td>
                  </tr>
                ) : null,
                ...(collapsed ? [] : group.rows.map((original) => {
                  const id = rowId(original);
                  return (
                    <tr key={id} className={selected.has(id) ? 'sel' : ''} onContextMenu={rowMenu ? (event) => setMenu({ row: original, at: menuAt(event) }) : undefined}>
                      {bulkActions ? (
                        <td className="sticky-col" style={{ left: 0 }}>
                          <input type="checkbox" aria-label={t('views.selectRow')} checked={selected.has(id)} onChange={() => toggle(id)} />
                        </td>
                      ) : null}
                      {visible.map((column, index) => (
                        <td key={column.key}
                          className={`${index === 0 ? 'sticky-col' : ''} ${onRowClick || column.edit ? 'clickable' : ''} ${column.edit ? 'editable' : ''} ${column.align === 'right' ? 'num-cell' : ''}`}
                          style={index === 0 ? { left: bulkActions ? 40 : 0, fontWeight: 550 } : undefined}
                          title={column.edit ? t('views.clickToEdit') : undefined}
                          onDoubleClick={index === 0 && onRename ? (event) => { event.preventDefault(); setRenaming(id); } : undefined}
                          onClick={(event) => {
                            if (column.edit) { const rect = event.currentTarget.getBoundingClientRect(); setEditing({ row: original, column, at: { x: rect.left, y: rect.bottom + 2 } }); return; }
                            if (renaming !== id) onRowClick?.(original);
                          }}>
                          {index === 0 && renaming === id && onRename ? (
                            <RenameInput initial={renameOf ? renameOf(original) : String(fields[0]?.get(original) ?? '')} onDone={async (value) => { setRenaming(null); if (value !== null) await onRename(original, value); }} />
                          ) : column.cell(original)}
                        </td>
                      ))}
                      {rowMenu ? (
                        <td className="row-menu">
                          <button type="button" className="icon-btn sm" aria-label={t('views.actions')} onClick={(event) => setMenu({ row: original, at: menuAt(event) })}><Ellipsis size={15} /></button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })),
              ];
            })}
            {onAdd ? (
              <tr className="add-row" onClick={onAdd}>
                <td colSpan={visible.length + extraCols}><span className="row tight"><Plus size={14} />{addLabel}</span></td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="dt-cards only-m">
        {rows.map((row) => (
          <button key={rowId(row)} type="button" onContextMenu={rowMenu ? (event) => setMenu({ row, at: menuAt(event) }) : undefined} className="dt-card" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: onRowClick ? 'pointer' : 'default' }} onClick={() => onRowClick?.(row)}>
            <div style={{ fontWeight: 600 }}>{columns[0]!.cell(row)}</div>
            {columns.slice(1).filter((column) => column.mobile !== false && !state.hidden.includes(column.key)).slice(0, 4).map((column) => (
              <div key={column.key} className="dc-row"><span>{column.label}</span><span>{column.cell(row)}</span></div>
            ))}
          </button>
        ))}
        {onAdd ? <button type="button" className="btn secondary" onClick={onAdd}><Plus size={15} />{addLabel}</button> : null}
      </div>
      <ContextMenu at={menu?.at ?? null} onClose={() => setMenu(null)}>{menu && rowMenu ? rowMenu(menu.row, () => setMenu(null)) : null}</ContextMenu>
      <ContextMenu at={editing?.at ?? null} onClose={() => setEditing(null)} width={240}>
        {editing?.column.edit ? editing.column.edit(editing.row, () => setEditing(null)) : null}
      </ContextMenu>
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

/** The first cell turned into a field: Enter or leaving saves, Escape cancels. */
function RenameInput({ initial, onDone }: { initial: string; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(initial);
  let done = false;
  const finish = (next: string | null) => { if (done) return; done = true; onDone(next === null || next.trim() === '' || next.trim() === initial ? null : next.trim()); };
  return (
    <input className="cell-input" value={value} autoFocus onChange={(event) => setValue(event.target.value)} onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key === 'Enter') finish(value); if (event.key === 'Escape') { event.stopPropagation(); finish(null); } }}
      onBlur={() => finish(value)} maxLength={200} />
  );
}
