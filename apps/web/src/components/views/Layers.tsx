// Layers (spec 032): like a professional calendar, each source (a site, a kind of item) can be shown or
// hidden with a check; « only this one » isolates it (double click, or its menu); « all » brings
// everything back. The choice is a per-device convenience, remembered per view key.
import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Layers as LayersIcon } from 'lucide-react';
import { useI18n } from '@/i18n/index.tsx';
import { ContextMenu, MenuItem, Popover, type MenuAt } from '../kit.tsx';

export interface Layer { key: string; label: string; color?: string; count?: number; hint?: string }

const STORE = 'struo.layers.';

/** Which layers are hidden, remembered per key. New layers are shown by default. */
export function useLayers(key: string) {
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try { setHidden(JSON.parse(localStorage.getItem(STORE + key) ?? '[]') as string[]); } catch { setHidden([]); }
  }, [key]);
  const save = useCallback((next: string[]) => {
    setHidden(next);
    try { localStorage.setItem(STORE + key, JSON.stringify(next)); } catch { /* not remembered */ }
  }, [key]);
  return {
    hidden,
    isOn: (layer: string) => !hidden.includes(layer),
    toggle: (layer: string) => save(hidden.includes(layer) ? hidden.filter((item) => item !== layer) : [...hidden, layer]),
    only: (layer: string, all: string[]) => save(all.filter((item) => item !== layer)),
    showAll: () => save([]),
    hideAll: (all: string[]) => save(all),
  };
}

export type LayerState = ReturnType<typeof useLayers>;

/** The row of checkable layers above a calendar or a timeline. */
export function LayerBar({ layers, state, title }: { layers: Layer[]; state: LayerState; title: string }) {
  const { t } = useI18n();
  const [menu, setMenu] = useState<{ at: MenuAt; key: string } | null>(null);
  const keys = layers.map((layer) => layer.key);
  const shown = layers.filter((layer) => state.isOn(layer.key)).length;
  if (!layers.length) return null;
  const many = layers.length > 8;
  const chips = layers.map((layer) => {
    const on = state.isOn(layer.key);
    return (
      <label key={layer.key} className={`layer ${on ? 'on' : ''}`} title={layer.hint ?? t('views.layerHint')}
        onDoubleClick={(event) => { event.preventDefault(); state.only(layer.key, keys); }}
        onContextMenu={(event) => { event.preventDefault(); setMenu({ at: { x: event.clientX, y: event.clientY }, key: layer.key }); }}>
        <input type="checkbox" checked={on} onChange={() => state.toggle(layer.key)} style={{ ['--c' as string]: layer.color ?? 'var(--brand)' }} />
        <span className="trunc">{layer.label}</span>
        {layer.count !== undefined ? <span className="faint xsmall">{layer.count}</span> : null}
      </label>
    );
  });
  return (
    <div className="layerbar" role="group" aria-label={title}>
      <span className="row tight small muted nowrap"><LayersIcon size={14} />{title} <b>{shown}/{layers.length}</b></span>
      {many ? (
        <Popover width={300} trigger={(props) => <button type="button" className="btn ghost small" {...props}>{t('views.chooseLayers')}</button>}>
          {() => <div className="stack" style={{ gap: 2, padding: 4, maxHeight: 360, overflow: 'auto' }}>{chips}</div>}
        </Popover>
      ) : chips}
      <span className="sp" />
      <button type="button" className="btn ghost small" disabled={shown === layers.length} onClick={state.showAll}><Eye size={14} />{t('views.showAll')}</button>
      <button type="button" className="btn ghost small" disabled={shown === 0} onClick={() => state.hideAll(keys)}><EyeOff size={14} />{t('views.hideAll')}</button>
      <ContextMenu at={menu?.at ?? null} onClose={() => setMenu(null)}>
        {menu ? (
          <>
            <MenuItem icon={Eye} onSelect={() => { state.only(menu.key, keys); setMenu(null); }}>{t('views.onlyThis')}</MenuItem>
            <MenuItem icon={state.isOn(menu.key) ? EyeOff : Eye} onSelect={() => { state.toggle(menu.key); setMenu(null); }}>
              {state.isOn(menu.key) ? t('views.hideThis') : t('views.showThis')}
            </MenuItem>
          </>
        ) : null}
      </ContextMenu>
    </div>
  );
}
