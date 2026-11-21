// Checklists of the company (spec 048): each one is daily, tied to a phase, or on demand; its points
// are one per line. Unticked points sent from the field become an incident with its task.
import { useEffect, useState, type FormEvent } from 'react';
import { ClipboardCheck, Trash2 } from 'lucide-react';
import { EmptyState, Panel, useToast } from './kit.tsx';
import { archiveChecklistTemplate, getChecklistSettings, saveChecklistTemplate } from '@/features/settings/server.ts';
import { useI18n } from '@/i18n/index.tsx';

type Settings = Awaited<ReturnType<typeof getChecklistSettings>>;
type Template = Settings['templates'][number];

export function ChecklistSettings() {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<Settings | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const load = async () => setData(await getChecklistSettings());
  useEffect(() => { void load(); }, []);
  if (!data) return <p className="muted">…</p>;
  const save = async (event: FormEvent<HTMLFormElement>, id: string | null) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const mode = text('mode') as Template['mode'];
    try {
      await saveChecklistTemplate({ data: { id, template: { name: text('name'), items: text('items').split('\n').map((line) => line.trim()).filter(Boolean), mode, phaseName: mode === 'phase' ? text('phaseName') : null } } });
      toast({ text: t('ui.saved') }); setEditing(null); await load();
    } catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  const remove = async (id: string) => {
    try { await archiveChecklistTemplate({ data: { id } }); await load(); } catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  const editor = (template: Template | null) => (
    <form className="stack" onSubmit={(event) => void save(event, template?.id ?? null)}>
      <label className="field">{t('checklists.name')}<input name="name" required maxLength={120} defaultValue={template?.name ?? ''} /></label>
      <div className="form-grid">
        <label className="field">{t('checklists.when')}
          <select name="mode" defaultValue={template?.mode ?? 'daily'}>
            {(['daily', 'phase', 'on_demand'] as const).map((mode) => <option key={mode} value={mode}>{t(`checklists.modes.${mode}`)}</option>)}
          </select>
        </label>
        <label className="field">{t('checklists.phase')}
          <input name="phaseName" list="checklist-phases" maxLength={120} defaultValue={template?.phaseName ?? ''} placeholder={t('checklists.phaseHint')} />
          <datalist id="checklist-phases">{data.phaseNames.map((name) => <option key={name} value={name} />)}</datalist>
        </label>
      </div>
      <label className="field">{t('checklists.items')}<textarea name="items" required rows={6} defaultValue={(template?.items ?? []).join('\n')} placeholder={t('checklists.itemsHint')} /></label>
      <div className="row"><button type="submit" className="btn small">{t('app.save')}</button><button type="button" className="btn ghost small" onClick={() => setEditing(null)}>{t('app.cancel')}</button></div>
    </form>
  );
  return (
    <Panel title={t('checklists.title')} sub={t('checklists.sub')}
      actions={data.canWrite && editing !== 'new' ? <button type="button" className="btn small" onClick={() => setEditing('new')}>{t('checklists.add')}</button> : null}>
      <div className="stack">
        {editing === 'new' ? <div className="card">{editor(null)}</div> : null}
        {data.templates.length ? data.templates.map((template) => (
          <div key={template.id} className="card stack" style={{ gap: '.4rem' }}>
            {editing === template.id ? editor(template) : (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>{template.name}</b>
                  <span className="row tight">
                    <span className="badge">{template.mode === 'phase' ? t('checklists.duringPhase', { phase: template.phaseName ?? '' }) : t(`checklists.modes.${template.mode}`)}</span>
                    {data.canWrite ? <button type="button" className="btn ghost small" onClick={() => setEditing(template.id)}>{t('docs.edit')}</button> : null}
                    {data.canWrite ? <button type="button" className="icon-btn" aria-label={t('checklists.remove')} onClick={() => void remove(template.id)}><Trash2 size={15} /></button> : null}
                  </span>
                </div>
                <p className="small muted" style={{ margin: 0 }}>{template.items.join(' · ')}</p>
              </>
            )}
          </div>
        )) : <EmptyState icon={ClipboardCheck} title={t('checklists.none')} />}
      </div>
    </Panel>
  );
}
