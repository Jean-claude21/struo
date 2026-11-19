// View engine (spec 021): the same rows go through one view state (search, filters, sort, group,
// visible columns and widths), shown by any renderer — table, board, timeline, calendar, files.
// The state is a per-device convenience, remembered in localStorage per view key.
import { useCallback, useEffect, useState, type ReactNode } from 'react';

export type FieldType = 'enum' | 'date' | 'text' | 'number' | 'money' | 'person';

export interface FieldOption { value: string; label: string; color?: string; icon?: ReactNode }

export interface FieldDef<T> {
  key: string;
  label: string;
  type: FieldType;
  get: (row: T) => string | number | null | undefined;
  /** Allowed values of an enum or person field (the filter picker shows them). */
  options?: FieldOption[];
  /** Field can be used to group rows. */
  groupable?: boolean;
  /** Field can be filtered. */
  filterable?: boolean;
  sortable?: boolean;
}

export interface Filter { field: string; op: 'is' | 'not'; values: string[] }

export interface ViewState {
  q: string;
  filters: Filter[];
  sort: { key: string; dir: 1 | -1 } | null;
  group: string | null;
  hidden: string[];
  widths: Record<string, number>;
  mode: string;
  collapsed: string[];
}

export interface SavedView { id: string; name: string; state: ViewState }

const STORE = 'struo.views.';

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not remembered */ }
};

export const emptyView = (defaults: Partial<ViewState> = {}): ViewState => ({
  q: '', filters: [], sort: null, group: null, hidden: [], widths: {}, mode: 'table', collapsed: [], ...defaults,
});

/** View state remembered per key, plus the saved views of that key. */
export function useViewState(key: string, defaults: Partial<ViewState> = {}) {
  const [state, setState] = useState<ViewState>(() => emptyView(defaults));
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setState(read(STORE + key, emptyView(defaults)));
    setSaved(read<{ list: SavedView[] }>(`${STORE + key}.saved`, { list: [] }).list);
    setReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { if (ready) write(STORE + key, state); }, [key, state, ready]);
  const update = useCallback((patch: Partial<ViewState> | ((current: ViewState) => Partial<ViewState>)) => {
    setState((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }));
  }, []);
  const saveView = (name: string) => {
    const next = [...saved, { id: crypto.randomUUID(), name, state }];
    setSaved(next); write(`${STORE + key}.saved`, { list: next });
  };
  const removeView = (id: string) => {
    const next = saved.filter((view) => view.id !== id);
    setSaved(next); write(`${STORE + key}.saved`, { list: next });
  };
  return { state, update, saved, saveView, removeView, reset: () => setState(emptyView(defaults)) };
}

const today = () => { const date = new Date(); date.setHours(12, 0, 0, 0); return date; };
export const dayDiff = (iso: string) => Math.round((new Date(`${iso.slice(0, 10)}T12:00:00`).getTime() - today().getTime()) / 86400000);

/** Date buckets shared by filters and grouping. */
export const DATE_BUCKETS = ['overdue', 'today', 'week', 'later', 'none'] as const;
export const dateBucket = (value: string | number | null | undefined) => {
  if (!value) return 'none';
  const days = dayDiff(String(value));
  return days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'week' : 'later';
};

function matches<T>(row: T, filter: Filter, field: FieldDef<T>) {
  if (!filter.values.length) return true;
  const value = field.get(row);
  const hit = field.type === 'date'
    ? filter.values.includes(dateBucket(value))
    : filter.values.includes(value === null || value === undefined || value === '' ? '__none' : String(value));
  return filter.op === 'not' ? !hit : hit;
}

export function applyView<T>(rows: T[], fields: FieldDef<T>[], state: ViewState): T[] {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const q = state.q.trim().toLowerCase();
  let out = rows.filter((row) => state.filters.every((filter) => {
    const field = byKey.get(filter.field);
    return field ? matches(row, filter, field) : true;
  }));
  if (q) {
    const textFields = fields.filter((field) => field.type === 'text' || field.type === 'enum' || field.type === 'person');
    out = out.filter((row) => textFields.some((field) => {
      const value = field.get(row);
      const label = field.options?.find((option) => option.value === String(value))?.label;
      return `${value ?? ''} ${label ?? ''}`.toLowerCase().includes(q);
    }));
  }
  const sortField = state.sort ? byKey.get(state.sort.key) : null;
  if (sortField && state.sort) {
    const dir = state.sort.dir;
    const order = sortField.options?.map((option) => option.value);
    out = [...out].sort((left, right) => {
      let a: unknown = sortField.get(left); let b: unknown = sortField.get(right);
      if (order) { a = order.indexOf(String(a)); b = order.indexOf(String(b)); }
      if (a === null || a === undefined || a === '') return 1;
      if (b === null || b === undefined || b === '') return -1;
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
      return String(a).localeCompare(String(b), undefined, { numeric: true }) * dir;
    });
  }
  return out;
}

export interface Group<T> { key: string; label: string; color?: string; rows: T[] }

export function groupRows<T>(rows: T[], fields: FieldDef<T>[], groupKey: string | null, labels: { none: string; buckets: Record<string, string> }): Group<T>[] {
  const field = groupKey ? fields.find((candidate) => candidate.key === groupKey) : null;
  if (!field) return [{ key: '__all', label: '', rows }];
  if (field.type === 'date') {
    return DATE_BUCKETS.map((bucket) => ({ key: bucket, label: labels.buckets[bucket] ?? bucket, rows: rows.filter((row) => dateBucket(field.get(row)) === bucket) }))
      .filter((group) => group.rows.length);
  }
  const options: FieldOption[] = field.options ?? [...new Set(rows.map((row) => String(field.get(row) ?? '__none')))].map((value) => ({ value, label: value }));
  const groups: Group<T>[] = options.map((option) => ({
    key: option.value, label: option.label, color: option.color, rows: rows.filter((row) => String(field.get(row) ?? '__none') === option.value),
  }));
  const none = rows.filter((row) => { const value = field.get(row); return value === null || value === undefined || value === ''; });
  if (none.length && !options.some((option) => option.value === '__none')) groups.push({ key: '__none', label: labels.none, rows: none });
  return groups.filter((group) => group.rows.length);
}

/** Options of a field for the filter picker: declared options, or the values present in the rows. */
export function optionsOf<T>(field: FieldDef<T>, rows: T[], labels: { none: string; buckets: Record<string, string> }): FieldOption[] {
  if (field.type === 'date') return DATE_BUCKETS.map((bucket) => ({ value: bucket, label: labels.buckets[bucket] ?? bucket }));
  if (field.options) return field.options;
  const values = [...new Set(rows.map((row) => field.get(row)).filter((value) => value !== null && value !== undefined && value !== '').map(String))].sort();
  return values.map((value) => ({ value, label: value }));
}
