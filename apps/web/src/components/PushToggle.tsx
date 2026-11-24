// Spec 052: a team member turns notifications on for this phone (or browser). Tasks, incidents,
// reports to review, thread messages and material requests then reach them where they are.
import { Bell, BellOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from './kit.tsx';
import { getPushKey, subscribeMemberPush } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

function keyBytes(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob((value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/gu, '+').replace(/_/gu, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

type State = 'loading' | 'unsupported' | 'off' | 'on' | 'denied';

export function PushToggle({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [state, setState] = useState<State>('loading');
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      const { key: value } = await getPushKey().catch(() => ({ key: null }));
      if (!live) return;
      setKey(value);
      if (!supported || !value) { setState('unsupported'); return; }
      if (Notification.permission === 'denied') { setState('denied'); return; }
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (live) setState(subscription && Notification.permission === 'granted' ? 'on' : 'off');
    })();
    return () => { live = false; };
  }, []);
  const enable = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState(permission === 'denied' ? 'denied' : 'off'); return; }
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription()) ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key!) });
      await subscribeMemberPush({ data: { subscription: subscription.toJSON() } });
      setState('on');
      toast({ text: t('teamPush.on') });
    } catch { toast({ text: t('teamPush.failed'), kind: 'err' }); }
  };
  if (state === 'loading' || state === 'unsupported') return compact ? null : <p className="small muted" style={{ margin: 0 }}>{state === 'unsupported' ? t('teamPush.unsupported') : '…'}</p>;
  if (compact && state !== 'off') return null;
  if (state === 'on') return <p className="small ok-text row tight" style={{ margin: 0 }}><Bell size={15} />{t('teamPush.isOn')}</p>;
  if (state === 'denied') return <p className="small muted row tight" style={{ margin: 0 }}><BellOff size={15} />{t('teamPush.denied')}</p>;
  return (
    <section className={compact ? 'card stack push-card' : 'stack'} style={{ gap: '.5rem' }}>
      {compact ? <b>{t('teamPush.askTitle')}</b> : null}
      <p className="small" style={{ margin: 0 }}>{t('teamPush.askText')}</p>
      <button type="button" className="btn secondary" onClick={() => void enable()}><Bell size={16} />{t('teamPush.enable')}</button>
    </section>
  );
}
