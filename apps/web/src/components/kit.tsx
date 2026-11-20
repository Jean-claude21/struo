// Struo UI kit (spec 020): small, accessible building blocks shared by every page. Visuals live in
// styles.css; these components only own structure, keyboard behavior and focus.
import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';

// ---------------------------------------------------------------- page structure

export function PageHeader({ title, text, children }: { title: ReactNode; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="grow">
        <h1>{title}</h1>
        {text ? <p>{text}</p> : null}
      </div>
      {children ? <div className="acts">{children}</div> : null}
    </div>
  );
}

export function Panel({ title, sub, actions, children, flush, className, style }: {
  title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string; style?: CSSProperties;
}) {
  return (
    <section className={`panel ${className ?? ''}`} style={style}>
      {title || actions ? (
        <div className="panel-h">
          {title ? <h2>{title}</h2> : null}
          {sub ? <span className="sub">{sub}</span> : null}
          <span className="sp" />
          {actions}
        </div>
      ) : null}
      <div className={`panel-b ${flush ? 'flush' : ''}`}>{children}</div>
    </section>
  );
}

export function KpiTile({ label, value, sub, tone, icon: Icon, subTone, onClick }: {
  label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'brand' | 'bad'; icon?: LucideIcon; subTone?: 'ok' | 'bad' | 'warn'; onClick?: () => void;
}) {
  const body = (
    <>
      <span className="k-label">{Icon ? <Icon size={15} /> : null}{label}</span>
      <span className={`k-value ${tone ?? ''}`}>{value}</span>
      {sub ? <span className={`k-sub ${subTone ?? ''}`}>{sub}</span> : null}
    </>
  );
  return onClick ? (
    <button type="button" className="kpi-tile" onClick={onClick} style={{ textAlign: 'left', font: 'inherit', cursor: 'pointer', color: 'inherit' }}>{body}</button>
  ) : (
    <div className="kpi-tile">{body}</div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="glyph"><Icon size={20} /></div>
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 14, style }: { width?: number | string; height?: number | string; style?: CSSProperties }) {
  return <span className="skel" style={{ display: 'block', width, height, ...style }} aria-hidden />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="row nowrap">
          <Skeleton width={18} height={18} />
          <Skeleton width={`${40 + ((index * 17) % 40)}%`} />
          <span className="sp" />
          <Skeleton width={80} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- people

const AVATAR_COLORS = ['#b9461e', '#3d704e', '#2f5f8a', '#6a4ba8', '#a8445f', '#2a7a78', '#a36a12', '#5c665d'];
export const colorFor = (seed: string) => {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
};
export const initials = (name: string) =>
  name.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('') || '?';

export function Avatar({ name, size }: { name: string | null | undefined; size?: 'md' | 'lg' }) {
  const label = name ?? '?';
  return (
    <span className={`avatar ${size ?? ''}`} style={{ background: name ? colorFor(label) : 'var(--ink-faint)' }} title={label} aria-label={label}>
      {initials(label)}
    </span>
  );
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  return (
    <span className="avatar-stack">
      {shown.map((name) => <Avatar key={name} name={name} />)}
      {names.length > max ? <span className="avatar" style={{ background: 'var(--surface-3)', color: 'var(--ink-2)' }}>+{names.length - max}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------- status: a shape, a color and a word

export type Shape = 'todo' | 'progress' | 'review' | 'done' | 'blocked' | 'late';
const SHAPE_COLOR: Record<Shape, string> = {
  todo: 'var(--ink-faint)', progress: 'var(--warn)', review: 'var(--violet)', done: 'var(--ok)', blocked: 'var(--ink-soft)', late: 'var(--bad)',
};

export function StatusIcon({ shape, size = 14 }: { shape: Shape; size?: number }) {
  const color = SHAPE_COLOR[shape];
  let inner: ReactNode = <circle cx="7" cy="7" r="5.4" fill="none" stroke={color} strokeWidth="1.5" />;
  if (shape === 'progress') inner = (<><circle cx="7" cy="7" r="5.4" fill="none" stroke={color} strokeWidth="1.5" /><path d="M7 3.4A3.6 3.6 0 0 1 7 10.6Z" fill={color} /></>);
  if (shape === 'review') inner = (<><circle cx="7" cy="7" r="5.4" fill="none" stroke={color} strokeWidth="1.5" /><path d="M7 3.4A3.6 3.6 0 1 1 3.4 7L7 7Z" fill={color} /></>);
  if (shape === 'done') inner = (<><circle cx="7" cy="7" r="6.2" fill={color} /><path d="M4.4 7.2 6.2 9 9.7 5.3" fill="none" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" /></>);
  if (shape === 'blocked') inner = (<><circle cx="7" cy="7" r="5.4" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="1.9 2.1" /><path d="M4.5 7h5" stroke={color} strokeWidth="1.6" strokeLinecap="round" /></>);
  if (shape === 'late') inner = (<><circle cx="7" cy="7" r="6.2" fill={color} /><path d="M7 3.8v3.6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /><circle cx="7" cy="10.1" r=".95" fill="#fff" /></>);
  return <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden style={{ flexShrink: 0 }}>{inner}</svg>;
}

export function StatusChip({ shape, label }: { shape: Shape; label: ReactNode }) {
  return <span className="status-chip"><StatusIcon shape={shape} /><span>{label}</span></span>;
}

export function Progress({ value, tone, label = true }: { value: number; tone?: 'ok' | 'bad' | 'warn'; label?: boolean }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className="row nowrap" style={{ gap: '.5rem', width: '100%' }}>
      <span className={`progress grow ${tone ?? (clamped >= 100 ? 'ok' : '')}`} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${clamped}%` }} />
      </span>
      {label ? <span className="small num nowrap" style={{ width: 38, textAlign: 'right' }}>{clamped} %</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------- overlays

function useEscape(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, active]);
}

/** Keeps the keyboard inside an open dialog and gives focus back to the opener on close. */
function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])') ?? []);
    const first = focusables().find((element) => element.dataset.autofocus !== undefined) ?? focusables()[0];
    first?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !node) return;
      const items = focusables();
      if (!items.length) return;
      const [head, tail] = [items[0]!, items[items.length - 1]!];
      if (event.shiftKey && document.activeElement === head) { event.preventDefault(); tail.focus(); }
      else if (!event.shiftKey && document.activeElement === tail) { event.preventDefault(); head.focus(); }
    };
    node?.addEventListener('keydown', handler);
    return () => { node?.removeEventListener('keydown', handler); opener?.focus?.(); };
  }, [ref, active]);
}

const Portal = ({ children }: { children: ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
};

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose, open);
  useFocusTrap(ref, open);
  if (!open) return null;
  return (
    <Portal>
      <button type="button" className="scrim" aria-label={t('ui.close')} onClick={onClose} />
      <div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="modal-h">
          <h2 className="grow">{title}</h2>
          <button type="button" className="icon-btn" aria-label={t('ui.close')} onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer ? <div className="modal-f">{footer}</div> : null}
      </div>
    </Portal>
  );
}

export function Drawer({ open, onClose, title, children, footer, wide, headerExtra }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; headerExtra?: ReactNode;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  useEscape(onClose, open);
  useFocusTrap(ref, open);
  if (!open) return null;
  return (
    <Portal>
      <button type="button" className="scrim" aria-label={t('ui.close')} onClick={onClose} />
      <aside ref={ref} className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="drawer-h">
          <h2 className="grow trunc" style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h2>
          {headerExtra}
          <button type="button" className="icon-btn" aria-label={t('ui.close')} onClick={onClose}><X size={16} /></button>
        </div>
        <div className="drawer-b">{children}</div>
        {footer ? <div className="drawer-f">{footer}</div> : null}
      </aside>
    </Portal>
  );
}

/**
 * A popover anchored to its trigger (menus, pickers). Closes on outside click and Escape; arrow keys
 * move between the items that carry the `mi` class.
 */
export function Popover({ trigger, children, align = 'start', width }: {
  trigger: (props: { onClick: (event: React.MouseEvent<HTMLElement>) => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  width?: number;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  // The menu mounts through a portal one render after the click: measure it once it exists
  // (in development React runs effects twice, which hid this; in production the menu stayed invisible).
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const close = useCallback(() => setAnchor(null), []);
  useEscape(close, Boolean(anchor));
  useLayoutEffect(() => {
    if (!anchor || !node) { setPosition({ visibility: 'hidden' }); return; }
    const box = node.getBoundingClientRect();
    const top = anchor.bottom + 4 + box.height > window.innerHeight ? Math.max(8, anchor.top - 4 - box.height) : anchor.bottom + 4;
    let left = align === 'end' ? anchor.right - box.width : anchor.left;
    left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));
    setPosition({ top, left, width });
    node.querySelector<HTMLElement>('.mi, input')?.focus();
  }, [anchor, align, width, node]);
  useEffect(() => {
    if (!anchor) return;
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) close(); };
    const onScroll = () => close();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('resize', onScroll); };
  }, [anchor, close]);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('.mi') ?? []);
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };
  return (
    <>
      {trigger({
        onClick: (event) => { const rect = event.currentTarget.getBoundingClientRect(); setAnchor((current) => (current ? null : rect)); },
        'aria-expanded': Boolean(anchor),
        'aria-haspopup': 'menu',
      })}
      {anchor ? (
        <Portal>
          <div ref={(element) => { ref.current = element; setNode(element); }} className="pop" role="menu" style={position} onKeyDown={onKeyDown}>
            {children(close)}
          </div>
        </Portal>
      ) : null}
    </>
  );
}

export function MenuItem({ icon: Icon, children, onSelect, right, danger, checked }: {
  icon?: LucideIcon; children: ReactNode; onSelect: () => void; right?: ReactNode; danger?: boolean; checked?: boolean;
}) {
  return (
    <button type="button" role="menuitem" className={`mi ${danger ? 'danger' : ''}`} onClick={onSelect} aria-checked={checked}>
      {Icon ? <Icon size={15} /> : null}
      <span className="grow trunc">{children}</span>
      {checked ? <CircleCheck size={14} style={{ color: 'var(--brand)' }} /> : null}
      {right ? <span className="r">{right}</span> : null}
    </button>
  );
}

export function Seg<T extends string>({ value, onChange, items, label }: {
  value: T; onChange: (value: T) => void; items: { value: T; label: ReactNode; icon?: LucideIcon }[]; label: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {items.map((item) => (
        <button key={item.value} type="button" role="radio" aria-checked={value === item.value} className={value === item.value ? 'on' : ''} onClick={() => onChange(item.value)}>
          {item.icon ? <item.icon size={14} /> : null}{item.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- toasts (with undo)

type ToastInput = { text: string; kind?: 'ok' | 'err' | 'info'; action?: { label: string; run: () => void }; ms?: number };
type ToastItem = ToastInput & { id: number };
const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((item) => item.id !== id)), []);
  const push = useCallback((toast: ToastInput) => {
    const id = ++counter.current;
    setItems((list) => [...list.slice(-3), { ...toast, id }]);
    window.setTimeout(() => dismiss(id), toast.ms ?? 4500);
  }, [dismiss]);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast ${item.kind === 'err' ? 'err' : ''}`}>
            {item.kind === 'err' ? <CircleAlert size={16} /> : item.kind === 'info' ? <Info size={16} /> : <CircleCheck size={16} style={{ color: 'var(--ok)' }} />}
            <span className="grow">{item.text}</span>
            {item.action ? (
              <button type="button" className="t-act" onClick={() => { item.action!.run(); dismiss(item.id); }}>{item.action.label}</button>
            ) : null}
            <button type="button" className="icon-btn sm" style={{ color: 'inherit' }} aria-label="×" onClick={() => dismiss(item.id)}><X size={13} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---------------------------------------------------------------- relative dates

export function useRelative() {
  const { t } = useI18n();
  return (value: string | Date | null | undefined) => {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(/^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T12:00:00` : value) : value;
    const minutes = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return t('ui.justNow');
    if (minutes < 60) return t('ui.minutesAgo', { n: minutes });
    if (minutes < 60 * 24) return t('ui.hoursAgo', { n: Math.round(minutes / 60) });
    return t('ui.daysAgo', { n: Math.round(minutes / 1440) });
  };
}

/** Days between today and an ISO date (negative when past). */
export const daysUntil = (iso: string | null | undefined) => {
  if (!iso) return null;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const target = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

// ---------------------------------------------------------------- context menu

/** Arrow keys, Home and End move between the items of an open menu. */
function menuKeys(root: HTMLElement | null, event: React.KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const items = Array.from(root?.querySelectorAll<HTMLElement>('.mi') ?? []);
  if (!items.length) return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
    : event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
  items[next]?.focus();
}

export type MenuAt = { x: number; y: number } | null;

/** Where a right click (or a « … » button) asks for a menu. */
export const menuAt = (event: React.MouseEvent): MenuAt => {
  event.preventDefault(); event.stopPropagation();
  if (event.type === 'contextmenu') return { x: event.clientX, y: event.clientY };
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: rect.left, y: rect.bottom + 4 };
};

/**
 * A menu opened at a point: right click on a row, a card or a file, or its « … » button. It stays
 * inside the window, closes on Escape, an outside click, a scroll or a resize, and is keyboard-driven.
 */
export function ContextMenu({ at, onClose, children, width }: { at: MenuAt; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // The menu mounts through a portal one render after `at` is set: position it once it exists.
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  useEscape(onClose, Boolean(at));
  useLayoutEffect(() => {
    if (!at || !node) { setPosition({ visibility: 'hidden' }); return; }
    const box = node.getBoundingClientRect();
    setPosition({
      top: Math.max(8, Math.min(at.y, window.innerHeight - box.height - 8)),
      left: Math.max(8, Math.min(at.x, window.innerWidth - box.width - 8)),
      width,
    });
    node.querySelector<HTMLElement>('.mi, input, select')?.focus();
  }, [at, width, node]);
  useEffect(() => {
    if (!at) return;
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const onScroll = (event: Event) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onScroll, true);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('resize', onClose); window.removeEventListener('scroll', onScroll, true); };
  }, [at, onClose]);
  if (!at) return null;
  return (
    <Portal>
      <div ref={(element) => { ref.current = element; setNode(element); }} className="pop" role="menu" style={position} onKeyDown={(event) => menuKeys(ref.current, event)} onContextMenu={(event) => event.preventDefault()}>
        {children}
      </div>
    </Portal>
  );
}

/** A thin rule between groups of menu items, and a small heading. */
export const MenuSep = () => <div className="msep" />;
export const MenuHead = ({ children }: { children: ReactNode }) => <div className="mhead">{children}</div>;
