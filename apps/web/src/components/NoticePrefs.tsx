// Spec 073: each person chooses, per kind of notice, whether it reaches their phone and their inbox.
// The bell in the app always keeps everything.
import { useEffect, useState } from 'react';
import { useToast } from './kit.tsx';
import { getNoticePrefs, saveNoticePref } from '@/features/office/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

type Pref = { kind: string; push: boolean; email: boolean };

/** The kinds that concern a role (a site lead is not told about payments, an accountant not about the field). */
const FOR_ROLE: Record<string, string[]> = {
  site_lead: ['review', 'task', 'materialUpdate', 'note'],
  accountant: ['claim', 'task', 'note'],
  engineer: ['report', 'incident', 'material', 'note', 'task'],
};

export function NoticePrefs({ role }: { role: string }) {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const [prefs, setPrefs] = useState<Pref[] | null>(null);
  useEffect(() => { void getNoticePrefs().then(setPrefs).catch(() => setPrefs([])); }, []);
  if (!prefs) return <p className="small muted" style={{ margin: 0 }}>{t('ui.loading')}</p>;
  const shown = prefs.filter((pref) => !FOR_ROLE[role] || FOR_ROLE[role]!.includes(pref.kind));
  const change = async (pref: Pref, patch: Partial<Pref>) => {
    const next = { ...pref, ...patch };
    setPrefs(prefs.map((item) => (item.kind === pref.kind ? next : item)));
    try { await saveNoticePref({ data: next }); }
    catch (caught) { setPrefs(prefs); toast({ text: errorText(caught), kind: 'err' }); }
  };
  return (
    <div className="stack" style={{ gap: '.6rem' }}>
      <p className="small muted" style={{ margin: 0 }}>{t('notices.prefsHelp')}</p>
      <div className="table-wrap">
        <table className="notice-prefs">
          <thead><tr><th scope="col">{t('notices.kindCol')}</th><th scope="col">{t('notices.pushCol')}</th><th scope="col">{t('notices.emailCol')}</th></tr></thead>
          <tbody>
            {shown.map((pref) => (
              <tr key={pref.kind}>
                <td>{t(`notices.kinds.${pref.kind}` as MessageKey)}</td>
                <td><input type="checkbox" aria-label={`${t(`notices.kinds.${pref.kind}` as MessageKey)} · ${t('notices.pushCol')}`} checked={pref.push} onChange={(event) => void change(pref, { push: event.target.checked })} /></td>
                <td><input type="checkbox" aria-label={`${t(`notices.kinds.${pref.kind}` as MessageKey)} · ${t('notices.emailCol')}`} checked={pref.email} onChange={(event) => void change(pref, { email: event.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
