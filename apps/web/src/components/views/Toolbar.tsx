// One toolbar for every view: search, filters (as chips), sort, group, columns, mode and saved views.
import { useState, type ReactNode } from 'react';
import { ArrowDownUp, Bookmark, Columns3, ListFilter, Plus, Rows3, Trash2, X, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';
import { MenuItem, Modal, Popover, Seg } from '../kit.tsx';
import { optionsOf, type FieldDef, type Filter, type SavedView, type ViewState } from './engine.ts';

export function useBucketLabels() {
  const { t } = useI18n();
  return {
    none: t('views.dueNone'),
    buckets: { overdue: t('views.dueOverdue'), today: t('views.dueToday'), week: t('views.dueWeek'), later: t('views.dueLater'), none: t('views.dueNone') } as Record<string, string>,
  };
}

export interface ToolbarProps<T> {
  rows: T[];
  fields: FieldDef<T>[];
  state: ViewState;
  update: (patch: Partial<ViewState>) => void;
  modes?: { value: string; label: string; icon: LucideIcon }[];
  columns?: boolean;
  group?: boolean;
  saved?: SavedView[];
  onSave?: (name: string) => void;
  onRemoveSaved?: (id: string) => void;
  extra?: ReactNode;
  right?: ReactNode;
}

export function ViewToolbar<T>({ rows, fields, state, update, modes, columns, group = true, saved, onSave, onRemoveSaved, extra, right }: ToolbarProps<T>) {
  const { t } = useI18n();
  const labels = useBucketLabels();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const filterable = fields.filter((field) => field.filterable !== false && (field.type === 'enum' || field.type === 'date' || field.type === 'person' || field.options));
  const sortable = fields.filter((field) => field.sortable !== false);
  const groupable = fields.filter((field) => field.groupable);
  const sortLabel = state.sort ? fields.find((field) => field.key === state.sort!.key)?.label : null;
  const groupLabel = state.group ? fields.find((field) => field.key === state.group)?.label : null;

  const setFilter = (index: number, patch: Partial<Filter>) =>
    update({ filters: state.filters.map((filter, position) => (position === index ? { ...filter, ...patch } : filter)) });

  return (
    <>
      <div className="toolbar" role="toolbar">
        <div className="search-in" style={{ width: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={state.q} onChange={(event) => update({ q: event.target.value })} placeholder={t('ui.search')} aria-label={t('ui.search')} />
        </div>
        <Popover
          trigger={(props) => (
            <button type="button" className={`btn ghost small ${state.filters.length ? 'on' : ''}`} {...props}>
              <ListFilter size={15} />{t('views.filter')}{state.filters.length ? <span className="count">{state.filters.length}</span> : null}
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="mhead">{t('views.addFilter')}</div>
              {filterable.map((field) => (
                <MenuItem key={field.key} onSelect={() => { update({ filters: [...state.filters, { field: field.key, op: 'is', values: [] }] }); close(); }}>{field.label}</MenuItem>
              ))}
            </>
          )}
        </Popover>
        <Popover
          trigger={(props) => <button type="button" className="btn ghost small" {...props}><ArrowDownUp size={15} /><span className="hide-m">{t('views.sort')}{sortLabel ? ` : ${sortLabel}` : ''}</span></button>}
        >
          {(close) => (
            <>
              {sortable.map((field) => (
                <MenuItem key={field.key} checked={state.sort?.key === field.key}
                  right={state.sort?.key === field.key ? (state.sort.dir === 1 ? '↑' : '↓') : undefined}
                  onSelect={() => { update({ sort: state.sort?.key === field.key ? { key: field.key, dir: state.sort.dir === 1 ? -1 : 1 } : { key: field.key, dir: 1 } }); close(); }}>
                  {field.label}
                </MenuItem>
              ))}
              {state.sort ? (<><div className="msep" /><MenuItem icon={X} onSelect={() => { update({ sort: null }); close(); }}>{t('ui.clearFilters')}</MenuItem></>) : null}
            </>
          )}
        </Popover>
        {group && groupable.length ? (
          <Popover trigger={(props) => <button type="button" className="btn ghost small" {...props}><Rows3 size={15} /><span className="hide-m">{t('views.group')}{groupLabel ? ` : ${groupLabel}` : ''}</span></button>}>
            {(close) => (
              <>
                <MenuItem checked={!state.group} onSelect={() => { update({ group: null }); close(); }}>{t('views.noGroup')}</MenuItem>
                {groupable.map((field) => (
                  <MenuItem key={field.key} checked={state.group === field.key} onSelect={() => { update({ group: field.key }); close(); }}>{field.label}</MenuItem>
                ))}
              </>
            )}
          </Popover>
        ) : null}
        {columns ? (
          <Popover trigger={(props) => <button type="button" className="btn ghost small hide-m" {...props}><Columns3 size={15} />{t('views.columns')}</button>}>
            {() => (
              <>
                {fields.slice(1).map((field) => {
                  const shown = !state.hidden.includes(field.key);
                  return (
                    <label key={field.key} className="mi" style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={shown} onChange={() => update({ hidden: shown ? [...state.hidden, field.key] : state.hidden.filter((key) => key !== field.key) })} />
                      <span className="grow">{field.label}</span>
                    </label>
                  );
                })}
              </>
            )}
          </Popover>
        ) : null}
        {onSave ? (
          <Popover trigger={(props) => <button type="button" className="btn ghost small hide-m" {...props}><Bookmark size={15} />{t('views.savedViews')}</button>}>
            {(close) => (
              <>
                {saved?.map((view) => (
                  <div key={view.id} className="row nowrap" style={{ gap: 0 }}>
                    <MenuItem onSelect={() => { update(view.state); close(); }}>{view.name}</MenuItem>
                    <button type="button" className="icon-btn sm" aria-label={t('views.deleteView')} onClick={() => onRemoveSaved?.(view.id)}><Trash2 size={13} /></button>
                  </div>
                ))}
                {saved?.length ? <div className="msep" /> : null}
                <MenuItem icon={Plus} onSelect={() => { close(); setName(''); setNaming(true); }}>{t('views.saveView')}</MenuItem>
              </>
            )}
          </Popover>
        ) : null}
        {extra}
        <span className="sp" />
        {modes ? <Seg label={t('views.list')} value={state.mode} onChange={(mode) => update({ mode })} items={modes} /> : null}
        {right}
      </div>
      {state.filters.length ? (
        <div className="chipsbar">
          <ListFilter size={13} />
          {state.filters.map((filter, index) => {
            const field = fields.find((candidate) => candidate.key === filter.field);
            if (!field) return null;
            const options = optionsOf(field, rows, labels);
            const names = filter.values.map((value) => options.find((option) => option.value === value)?.label ?? value);
            const shown = names.length ? (names.length > 2 ? t('ui.selected', { count: names.length }) : names.join(', ')) : t('views.any');
            return (
              <span key={index} className="row tight nowrap">
                {index ? <span>{t('views.and')}</span> : null}
                <span className="fchip">
                  <Popover trigger={(props) => (
                    <button type="button" {...props}><b>{field.label}</b> {filter.op === 'not' ? t('views.isNot') : t('views.is')} <span>{shown}</span></button>
                  )}>
                    {() => (
                      <>
                        <div className="seg" style={{ margin: 4 }}>
                          <button type="button" className={filter.op === 'is' ? 'on' : ''} onClick={() => setFilter(index, { op: 'is' })}>{t('views.is')}</button>
                          <button type="button" className={filter.op === 'not' ? 'on' : ''} onClick={() => setFilter(index, { op: 'not' })}>{t('views.isNot')}</button>
                        </div>
                        {options.map((option) => {
                          const on = filter.values.includes(option.value);
                          return (
                            <label key={option.value} className="mi" style={{ cursor: 'pointer' }}>
                              <input type="checkbox" checked={on} onChange={() => setFilter(index, { values: on ? filter.values.filter((value) => value !== option.value) : [...filter.values, option.value] })} />
                              {option.color ? <span className="dot" style={{ ['--c' as string]: option.color }} /> : null}
                              <span className="grow trunc">{option.label}</span>
                            </label>
                          );
                        })}
                      </>
                    )}
                  </Popover>
                  <button type="button" aria-label={t('ui.close')} onClick={() => update({ filters: state.filters.filter((_, position) => position !== index) })}><X size={12} /></button>
                </span>
              </span>
            );
          })}
          <button type="button" className="btn ghost small" onClick={() => update({ filters: [] })}>{t('views.clearAll')}</button>
        </div>
      ) : null}
      <Modal open={naming} onClose={() => setNaming(false)} title={t('views.saveView')}
        footer={(<><button type="button" className="btn secondary" onClick={() => setNaming(false)}>{t('app.cancel')}</button>
          <button type="button" className="btn" disabled={!name.trim()} onClick={() => { onSave?.(name.trim()); setNaming(false); }}>{t('app.save')}</button></>)}>
        <label className="field">{t('views.viewName')}<input value={name} onChange={(event) => setName(event.target.value)} data-autofocus maxLength={60} /></label>
      </Modal>
    </>
  );
}
