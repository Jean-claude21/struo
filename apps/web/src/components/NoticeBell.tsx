// Spec 073: the bell — every notice a person received (phone or not), newest first, unread marked.
// Opening one marks it read and goes where it points; « mark all read » clears the count.
import { Bell, CheckCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/index.tsx';

type Notice = { id: string; kind: string; title: string; body: string | null; url: string | null; createdAt: string; read: boolean };

export function NoticeBell({ className = 'icon-btn' }: { className?: string }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ items: Notice[]; unread: number }>({ items: [], unread: 0 });
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'same-origin' });
      if (res.ok) setData(await res.json() as { items: Notice[]; unread: number });
    } catch { /* offline: keep what we have */ }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  const mark = async (ids?: string[]) => {
    await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(ids ? { ids } : {}) }).catch(() => undefined);
    await load();
  };
  const when = (iso: string) => {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return t('notices.now');
    if (minutes < 60) return t('notices.minutes', { n: minutes });
    if (minutes < 24 * 60) return t('notices.hours', { n: Math.round(minutes / 60) });
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }).format(new Date(iso));
  };
  return (
    <div className="notice-bell" ref={box}>
      <button type="button" className={className} aria-label={data.unread ? t('notices.labelUnread', { n: data.unread }) : t('notices.label')} aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void load(); }}>
        <Bell size={18} />
        {data.unread ? <span className="notice-count" aria-hidden="true">{data.unread > 99 ? '99+' : data.unread}</span> : null}
      </button>
      {open ? (
        <div className="notice-panel" role="dialog" aria-label={t('notices.label')}>
          <div className="notice-head">
            <b>{t('notices.label')}</b>
            {data.unread ? <button type="button" className="btn ghost small" onClick={() => void mark()}><CheckCheck size={14} />{t('notices.allRead')}</button> : null}
          </div>
          {data.items.length ? (
            <ul>
              {data.items.map((item) => (
                <li key={item.id} className={item.read ? '' : 'unread'}>
                  <a href={item.url ?? '#'} onClick={(event) => { if (!item.url) event.preventDefault(); if (!item.read) void mark([item.id]); }}>
                    <b>{item.title}</b>
                    {item.body ? <span>{item.body}</span> : null}
                    <small>{when(item.createdAt)}</small>
                  </a>
                </li>
              ))}
            </ul>
          ) : <p className="notice-empty">{t('notices.empty')}</p>}
          <a className="notice-settings" href="/app/account#notifications">{t('notices.settings')}</a>
        </div>
      ) : null}
    </div>
  );
}
