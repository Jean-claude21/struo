// The map of the company's sites (spec 045): where each site is, its state at a glance (incident,
// to watch, up to date, done), a filter by state, and a card with the essentials of the chosen site.
// Leaflet and the OpenStreetMap tiles are loaded in the browser only; without coordinates a site is
// listed under the map with the way to add them.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, MapPin, TriangleAlert } from 'lucide-react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { Panel, Progress, useRelative } from './kit.tsx';
import { useI18n } from '@/i18n/index.tsx';

export type MapSite = {
  id: string; code: string; name: string; status: string; progressPct: number; health: string;
  latitude: number | null; longitude: number | null; location: string | null; lastReportAt: string | null; openIncidents: number;
};
type State = 'bad' | 'warn' | 'ok' | 'done';
const STALE_DAYS = 3;
/** Leaflet is a UMD bundle: depending on the bundler the API is the module or its default export. */
const loadLeaflet = async () => { const mod = await import('leaflet'); return ((mod as unknown as { default?: typeof mod }).default ?? mod); };

/** One state per site, worst first: an open incident or overdue money, then silence or slipping cash. */
export function siteState(site: MapSite, now = Date.now()): State {
  if (site.status === 'done') return 'done';
  if (site.openIncidents > 0 || site.health === 'critical') return 'bad';
  const silent = site.status === 'active' && (!site.lastReportAt || now - new Date(site.lastReportAt).getTime() > STALE_DAYS * 86_400_000);
  if (site.health === 'weak' || silent) return 'warn';
  return 'ok';
}

export function SitesMap({ sites }: { sites: MapSite[] }) {
  const { t } = useI18n();
  const ago = useRelative();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const [filter, setFilter] = useState<'all' | 'bad' | 'warn'>('all');
  const [chosen, setChosen] = useState<string | null>(null);
  const [ready, setReady] = useState(0);
  const placed = useMemo(() => sites.filter((site) => site.latitude !== null && site.longitude !== null), [sites]);
  const visible = placed.filter((site) => filter === 'all' || siteState(site) === filter);
  const count = (state: State) => placed.filter((site) => siteState(site) === state).length;
  const current = sites.find((site) => site.id === chosen) ?? null;

  // Build the map once, in the browser.
  useEffect(() => {
    let cancelled = false;
    void loadLeaflet().then((L) => {
      if (cancelled || !box.current || map.current) return;
      map.current = L.map(box.current, { scrollWheelZoom: false, attributionControl: true, zoomControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map.current);
      map.current.setView([0, 0], 2);
      setReady((value) => value + 1);
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; markers.current.clear(); };
  }, []);

  // Draw the markers of the filter and fit the view on them.
  useEffect(() => {
    if (!map.current) return;
    void loadLeaflet().then((L) => {
      const instance = map.current;
      if (!instance) return;
      markers.current.forEach((marker) => marker.remove());
      markers.current.clear();
      for (const site of visible) {
        const state = siteState(site);
        const icon = L.divIcon({
          className: '',
          html: `<span class="site-pin ${state}${site.id === chosen ? ' on' : ''}"><i></i><b>${site.code.replace(/[<>&"]/gu, '')}</b></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        const marker = L.marker([site.latitude!, site.longitude!], { icon, title: `${site.code} · ${site.name}`, keyboard: true, riseOnHover: true })
          .on('click', () => setChosen(site.id))
          .on('keypress', () => setChosen(site.id))
          .addTo(instance);
        markers.current.set(site.id, marker);
      }
      if (visible.length) {
        const bounds = L.latLngBounds(visible.map((site) => [site.latitude!, site.longitude!] as [number, number]));
        instance.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filter, chosen, placed.length]);

  const missing = sites.filter((site) => site.status !== 'done' && (site.latitude === null || site.longitude === null));
  const label = (state: State) => t(`sitesMap.state.${state}`);
  return (
    <Panel title={t('sitesMap.title')} sub={t('sitesMap.sub')} flush
      actions={(
        <div className="seg" role="group" aria-label={t('sitesMap.filter')}>
          {(['all', 'bad', 'warn'] as const).map((value) => (
            <button key={value} type="button" className={filter === value ? 'on' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {value === 'all' ? t('sitesMap.all', { n: placed.length }) : `${label(value)} · ${count(value)}`}
            </button>
          ))}
        </div>
      )}>
      <div className="sites-map">
        <div ref={box} className="sites-map-canvas" role="region" aria-label={t('sitesMap.title')} />
        <aside className="sites-map-card" aria-live="polite">
          {current ? (
            <>
              <span className={`site-state ${siteState(current)}`}><i />{label(siteState(current))}</span>
              <h3>{current.code} · {current.name}</h3>
              {current.location ? <p className="muted small"><MapPin size={13} />{current.location}</p> : null}
              <Progress value={current.progressPct} label />
              <p className="small">{current.lastReportAt ? t('sitesMap.lastReport', { when: ago(current.lastReportAt) }) : t('sitesMap.noReport')}</p>
              {current.openIncidents ? <p className="small bad-text"><TriangleAlert size={14} />{t('sitesMap.incidents', { n: current.openIncidents })}</p> : null}
              <Link to="/app/projects/$projectId" params={{ projectId: current.id }} className="btn small secondary">{t('sitesMap.open')}<ArrowRight size={14} /></Link>
            </>
          ) : (
            <>
              <p className="muted small" style={{ margin: 0 }}>{t('sitesMap.pick')}</p>
              <ul className="sites-map-legend">
                {(['bad', 'warn', 'ok', 'done'] as const).map((state) => <li key={state}><span className={`site-state ${state}`}><i />{label(state)}</span><b>{count(state)}</b></li>)}
              </ul>
            </>
          )}
        </aside>
      </div>
      {missing.length ? <p className="faint xsmall" style={{ margin: 0, padding: '.6rem 1rem' }}>{t('sitesMap.missing', { n: missing.length, codes: missing.map((site) => site.code).join(', ') })}</p> : null}
    </Panel>
  );
}
