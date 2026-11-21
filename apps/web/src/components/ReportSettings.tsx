// What the client report shows, and whether it leaves every Monday (spec 049). Its look (logo,
// colour, font) is the invoice look, set in « Invoicing ».
import { useEffect, useState } from 'react';
import { Panel, useToast } from './kit.tsx';
import { getInvoiceSettings, updateInvoiceSettings } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

type Look = Awaited<ReturnType<typeof getInvoiceSettings>>;

export function ReportSettings({ canWrite }: { canWrite: boolean }) {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const [look, setLook] = useState<Look | null>(null);
  useEffect(() => { void getInvoiceSettings().then(setLook); }, []);
  if (!look) return <p className="muted">…</p>;
  const save = async (patch: Partial<Look>) => {
    setLook({ ...look, ...patch });
    try { await updateInvoiceSettings({ data: patch as Record<string, unknown> }); toast({ text: t('ui.saved') }); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  const toggle = (key: 'reportShowProgress' | 'reportShowMilestones' | 'reportShowChanges' | 'reportWeekly', label: string) => (
    <label className="check"><input type="checkbox" checked={look[key]} disabled={!canWrite} onChange={(event) => void save({ [key]: event.target.checked })} />{label}</label>
  );
  return (
    <Panel title={t('clientReport.settingsTitle')} sub={t('clientReport.settingsSub')}>
      <div className="stack">
        <label className="field">{t('clientReport.intro')}
          <textarea rows={3} maxLength={1000} defaultValue={look.reportIntro ?? ''} disabled={!canWrite} placeholder={t('clientReport.introPlaceholder')}
            onBlur={(event) => { if (event.target.value !== (look.reportIntro ?? '')) void save({ reportIntro: event.target.value || null }); }} />
        </label>
        <label className="field">{t('clientReport.photosCount')}
          <select value={look.reportPhotos} disabled={!canWrite} onChange={(event) => void save({ reportPhotos: Number(event.target.value) })} style={{ width: 'auto' }}>
            {[0, 4, 8, 12, 16, 24].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        {toggle('reportShowProgress', t('clientReport.showProgress'))}
        {toggle('reportShowMilestones', t('clientReport.showMilestones'))}
        {toggle('reportShowChanges', t('clientReport.showChanges'))}
        {toggle('reportWeekly', t('clientReport.weekly'))}
        <p className="small muted" style={{ margin: 0 }}>{t('clientReport.lookHint')}</p>
      </div>
    </Panel>
  );
}
