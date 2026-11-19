import { useState, type ReactNode } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';
import { Modal } from './kit.tsx';

// ---------------------------------------------------------------- formatting

const decimalsOf = (currency: string) => {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
  } catch {
    return 0;
  }
};

export function formatMoney(locale: string, minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return '—';
  const decimals = decimalsOf(currency);
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'currency', currency, maximumFractionDigits: decimals, minimumFractionDigits: decimals,
  }).format(minor / 10 ** decimals);
}

/** Amount typed by a person → minor units (null when invalid). */
export function parseMoney(text: string, currency: string): number | null {
  const clean = text.replace(/[\s  ]/gu, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/u.test(clean)) return null;
  const decimals = decimalsOf(currency);
  const [whole, fraction = ''] = clean.split('.');
  if (fraction.length > decimals) return null;
  return Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, '0') || 0);
}

export function formatDate(locale: string, value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/u.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export const todayIso = (offsetDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- small components

export function Money({ minor, currency }: { minor: number | null | undefined; currency: string }) {
  const { locale } = useI18n();
  return <span className="nowrap">{formatMoney(locale, minor, currency)}</span>;
}

export function DateText({ value, time }: { value: string | null | undefined; time?: boolean }) {
  const { locale } = useI18n();
  return <span className="nowrap">{formatDate(locale, value, time)}</span>;
}

export function Badge({ tone, children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>;
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="row" style={{ gap: '.5rem', flexWrap: 'nowrap' }}>
      <div className="progress grow" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="small nowrap">{value} %</span>
    </div>
  );
}

export function Kpi({ label, value, bad }: { label: string; value: ReactNode; bad?: boolean }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className={`value ${bad ? 'bad' : ''}`}>{value}</div>
    </div>
  );
}

export function Empty({ text }: { text?: string }) {
  const { t } = useI18n();
  return <p className="muted">{text ?? t('app.empty')}</p>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>
        {label} {hint ? <span className="muted small">({hint})</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (value: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button key={item.value} type="button" role="tab" aria-selected={item.value === value} className={`tab ${item.value === value ? 'active' : ''}`} onClick={() => onChange(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Runs a server action, shows its refusal in the person's language, and reloads the page data
 * (router.invalidate) when it succeeds.
 */
export function useAction() {
  const router = useRouter();
  const { errorText } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async <T,>(work: () => Promise<T>, options: { reload?: boolean } = {}): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const result = await work();
      if (options.reload !== false) await router.invalidate();
      // A successful action without a value still answers « done ».
      return (result === undefined ? true : result) as T;
    } catch (caught) {
      setError(errorText(caught));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { run, error, busy, setError };
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}

/**
 * A form in a modal, opened by its button — or driven from outside (`open` / `onOpenChange`, e.g. a
 * card dropped on « Paid » opens the payment form), in which case `hideTrigger` hides the button.
 */
export function DialogButton({
  label,
  title,
  secondary,
  small,
  children,
  open: controlled,
  onOpenChange,
  hideTrigger,
  wide,
}: {
  label: string;
  title: string;
  secondary?: boolean;
  small?: boolean;
  children: (close: () => void) => ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  wide?: boolean;
}) {
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const setOpen = (value: boolean) => { if (controlled === undefined) setOwn(value); onOpenChange?.(value); };
  return (
    <>
      {hideTrigger ? null : (
        <button type="button" className={`btn ${secondary ? 'secondary' : ''} ${small ? 'small' : ''}`} onClick={() => setOpen(true)}>
          {label}
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide={wide}>
        {open ? children(() => setOpen(false)) : null}
      </Modal>
    </>
  );
}

export function FormButtons({ onCancel, busy, submitLabel }: { onCancel: () => void; busy?: boolean; submitLabel?: string }) {
  const { t } = useI18n();
  return (
    <div className="pair" style={{ marginTop: '1rem' }}>
      <button type="button" className="btn secondary" onClick={onCancel}>
        {t('app.cancel')}
      </button>
      <button type="submit" className="btn" disabled={busy}>
        {submitLabel ?? t('app.save')}
      </button>
    </div>
  );
}

export function T({ k, params }: { k: MessageKey; params?: Record<string, string | number> }) {
  const { t } = useI18n();
  return <>{t(k, params)}</>;
}

/** Reads a form into a plain object of strings. */
export const formData = (form: HTMLFormElement) =>
  Object.fromEntries(Array.from(new FormData(form).entries()).map(([key, value]) => [key, String(value)])) as Record<string, string>;

export const orNull = (value: string | undefined) => (value && value.trim() ? value.trim() : null);
