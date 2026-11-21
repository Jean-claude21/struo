// Settings › Invoicing (specs 035, 036): every choice on the left, the invoice live on the right —
// the company's latest invoice (or an example) drawn with the settings being edited. Saved in one go.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ImageUp, Plus, Trash2 } from 'lucide-react';
import { InvoiceSheet, type SheetDoc } from './InvoiceSheet.tsx';
import { Panel, useToast } from './kit.tsx';
import { getInvoicePreview, updateInvoiceSettings } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

type Preview = Awaited<ReturnType<typeof getInvoicePreview>>;
type Look = Preview['settings'];

const SWATCHES = ['#b9461e', '#2f5f8a', '#3d704e', '#6a4ba8', '#a8445f', '#2a7a78', '#1f1f1f'];

export function InvoiceLookSettings({ canWrite }: { canWrite: boolean }) {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [look, setLook] = useState<Look | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { void getInvoicePreview().then((data) => { setPreview(data); setLook(data.settings); }); }, []);
  if (!preview || !look) return <p className="muted">{t('ui.loading')}</p>;

  const set = (patch: Partial<Look>) => { setLook({ ...look, ...patch }); setDirty(true); };
  const logoUrl = look.logoKey ? `/api/files/logo/${preview.orgId}?v=${look.logoKey.slice(-12)}-${logoVersion}` : null;
  const save = async () => {
    setBusy(true);
    try {
      const { logoKey: _logo, ...rest } = look;
      await updateInvoiceSettings({ data: rest });
      setDirty(false);
      toast({ text: t('inv.saved') });
    } catch (caught) { toast({ text: errorText(caught), kind: 'err' }); } finally { setBusy(false); }
  };
  const upload = async (picked: File) => {
    const body = new FormData(); body.append('logo', picked);
    const response = await fetch('/api/settings/logo', { method: 'POST', body });
    if (!response.ok) { toast({ text: errorText(((await response.json().catch(() => ({}))) as { error?: string }).error ?? 'generic'), kind: 'err' }); return; }
    const fresh = await getInvoicePreview();
    setLook({ ...look, logoKey: fresh.settings.logoKey });
    setLogoVersion((value) => value + 1);
    toast({ text: t('inv.logoSaved') });
  };
  const removeLogo = async () => { await fetch('/api/settings/logo', { method: 'DELETE' }); setLook({ ...look, logoKey: null }); };

  const input = (key: keyof Look, label: string, options: { rows?: number; hint?: string; max?: number } = {}) => (
    <label className="field">{label}
      {options.rows
        ? <textarea rows={options.rows} value={String(look[key] ?? '')} maxLength={options.max ?? 600} onChange={(event) => set({ [key]: event.target.value || null } as Partial<Look>)} />
        : <input value={String(look[key] ?? '')} maxLength={options.max ?? 200} onChange={(event) => set({ [key]: event.target.value || null } as Partial<Look>)} />}
      {options.hint ? <span className="faint xsmall">{options.hint}</span> : null}
    </label>
  );
  const toggle = (key: keyof Look, label: string) => (
    <label className="row tight small"><input type="checkbox" checked={Boolean(look[key])} onChange={(event) => set({ [key]: event.target.checked } as Partial<Look>)} />{label}</label>
  );
  const section = (title: string, children: ReactNode, sub?: string) => <Panel title={title} sub={sub}><div className="stack" style={{ gap: '.7rem' }}>{children}</div></Panel>;

  return (
    <div className="look-layout">
      <fieldset disabled={!canWrite} className="stack look-form" style={{ border: 0, padding: 0, margin: 0 }}>
        {section(t('inv.lookTitle'), <>
          <div className="look-templates">
            {(['classic', 'modern', 'compact'] as const).map((template) => (
              <button key={template} type="button" className={`look-template ${look.template === template ? 'on' : ''}`} onClick={() => set({ template })}>
                <span className={`look-thumb t-${template}`}><i /><i /><i /></span>{t(`inv.template.${template}`)}
              </button>
            ))}
          </div>
          <div className="row tight">
            <span className="small">{t('inv.accent')}</span>
            {SWATCHES.map((color) => <button key={color} type="button" className={`swatch ${look.accentColor === color ? 'on' : ''}`} style={{ background: color }} aria-label={color} onClick={() => set({ accentColor: color })} />)}
            <input type="color" value={look.accentColor ?? '#b9461e'} onChange={(event) => set({ accentColor: event.target.value })} aria-label={t('inv.accent')} />
          </div>
          <div className="row tight">
            <span className="small">{t('inv.font')}</span>
            <select value={look.font} onChange={(event) => set({ font: event.target.value as Look['font'] })} style={{ width: 'auto' }}>
              <option value="sans">{t('inv.fontSans')}</option><option value="serif">{t('inv.fontSerif')}</option>
            </select>
          </div>
        </>, t('inv.lookSub'))}

        {section(t('inv.logo'), <>
          <div className="row tight">
            {logoUrl ? <img src={logoUrl} alt="" style={{ height: 48, maxWidth: 180, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 6, padding: 4, background: '#fff' }} /> : <span className="muted small">{t('inv.noLogo')}</span>}
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { const picked = event.target.files?.[0]; if (picked) void upload(picked); event.target.value = ''; }} />
            <button type="button" className="btn secondary small" onClick={() => file.current?.click()}><ImageUp size={14} />{t(logoUrl ? 'inv.replaceLogo' : 'inv.uploadLogo')}</button>
            {logoUrl ? <button type="button" className="btn ghost small" onClick={() => void removeLogo()}><Trash2 size={14} />{t('app.remove')}</button> : null}
          </div>
          <span className="faint xsmall">{t('inv.logoHint')}</span>
          {logoUrl ? <>
            <div className="row tight">
              <span className="small">{t('inv.logoPosition')}</span>
              {(['left', 'center', 'right'] as const).map((position) => (
                <button key={position} type="button" className={`chip small ${look.logoPosition === position ? 'selected' : ''}`} onClick={() => set({ logoPosition: position })}>{t(`inv.pos.${position}`)}</button>
              ))}
            </div>
            <label className="row tight small">{t('inv.logoSize')}<input type="range" min={24} max={160} value={look.logoHeight} onChange={(event) => set({ logoHeight: Number(event.target.value) })} />{look.logoHeight} px</label>
          </> : null}
        </>)}

        {section(t('inv.titlesTitle'), <>
          {(['advance', 'progress', 'final'] as const).map((kind) => (
            <label key={kind} className="field">{t(`finance.kinds.${kind}`)}
              <input value={look.titles[kind] ?? ''} maxLength={80} placeholder={t(`finance.kinds.${kind}`)} onChange={(event) => set({ titles: { ...look.titles, [kind]: event.target.value } })} />
            </label>
          ))}
        </>, t('inv.titlesSub'))}

        {section(t('inv.blocks'), <>
          {toggle('showClientContact', t('inv.showClientContact'))}
          {toggle('showSite', t('inv.showSite'))}
          {toggle('showUnitColumns', t('inv.showUnitColumns'))}
          {toggle('showPayments', t('inv.showPayments'))}
          {toggle('showAmountWords', t('inv.showAmountWords'))}
          {toggle('showSignature', t('inv.showSignature'))}
          {look.showSignature ? <div className="form-grid">{input('signerName', t('inv.signerName'), { max: 120 })}{input('signerTitle', t('inv.signerTitle'), { max: 120 })}</div> : null}
        </>)}

        {section(t('inv.customFields'), <>
          {look.customFields.map((field, index) => (
            <div key={index} className="row tight nowrap">
              <input value={field.label} placeholder={t('inv.fieldLabel')} maxLength={60} style={{ flex: 1, minWidth: 0 }}
                onChange={(event) => set({ customFields: look.customFields.map((item, position) => (position === index ? { ...item, label: event.target.value } : item)) })} />
              <input value={field.value} placeholder={t('inv.fieldValue')} maxLength={200} style={{ flex: 2, minWidth: 0 }}
                onChange={(event) => set({ customFields: look.customFields.map((item, position) => (position === index ? { ...item, value: event.target.value } : item)) })} />
              <button type="button" className="icon-btn sm" aria-label={t('app.remove')} onClick={() => set({ customFields: look.customFields.filter((_, position) => position !== index) })}><Trash2 size={13} /></button>
            </div>
          ))}
          {look.customFields.length < 12 ? <button type="button" className="btn ghost small" onClick={() => set({ customFields: [...look.customFields, { label: '', value: '' }] })}><Plus size={14} />{t('inv.addField')}</button> : null}
        </>, t('inv.customFieldsSub'))}

        {section(t('inv.numbering'), <div className="form-grid">
          {input('numberPrefix', t('inv.prefix'), { max: 12 })}
          <label className="field">{t('inv.padding')}<input type="number" min={2} max={8} value={look.numberPadding} onChange={(event) => set({ numberPadding: Number(event.target.value) })} /></label>
          <label className="field">{t('inv.dueDays')}<input type="number" min={0} max={365} value={look.dueDays} onChange={(event) => set({ dueDays: Number(event.target.value) })} /></label>
          {toggle('numberYearly', t('inv.yearly'))}
        </div>, t('inv.numberingExample', { example: `${look.numberPrefix}-${look.numberYearly ? `${new Date().getFullYear()}-` : ''}${'1'.padStart(look.numberPadding, '0')}` }))}

        {section(t('inv.legal'), <>
          <div className="form-grid">{input('legalName', t('inv.legalName'))}{input('taxId', t('inv.taxId'), { max: 60 })}{input('tradeRegister', t('inv.tradeRegister'), { max: 80 })}
            {input('phone', t('inv.phone'), { max: 60 })}{input('email', t('inv.email'))}</div>
          {input('address', t('inv.address'), { rows: 2, max: 400 })}
        </>, t('inv.legalSub'))}

        {section(t('inv.payment'), <>
          {input('bankDetails', t('inv.bank'), { rows: 3, hint: t('inv.bankHint') })}
          {input('mobileMoney', t('inv.mobileMoney'), { rows: 2, max: 300 })}
          {input('paymentTerms', t('inv.paymentTerms'), { rows: 2, hint: t('inv.paymentTermsHint') })}
          {input('footer', t('inv.footer'), { rows: 2 })}
          {toggle('clientCanDeclare', t('inv.clientCanDeclare'))}
          <span className="faint xsmall">{t('inv.paymentInSpace')}</span>
        </>)}
      </fieldset>

      <div className="look-preview">
        <div className="row tight" style={{ marginBottom: '.5rem' }}>
          <b className="grow">{t('inv.livePreview')}</b>
          <span className="faint xsmall">{preview.sample ? t('inv.previewSample') : t('inv.previewReal', { number: preview.doc.number })}</span>
        </div>
        <div className="look-paper"><InvoiceSheet doc={preview.doc as SheetDoc} look={look} logoUrl={logoUrl} /></div>
        {canWrite ? (
          <div className="row" style={{ marginTop: '.75rem' }}>
            <button type="button" className="btn" disabled={busy || !dirty} onClick={() => void save()}>{t('app.save')}</button>
            {!dirty ? <span className="small" style={{ color: 'var(--ok)' }}><Check size={14} /> {t('inv.saved')}</span> : <span className="small muted">{t('inv.unsaved')}</span>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
