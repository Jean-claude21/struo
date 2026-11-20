// Command palette (Ctrl K / ⌘K): search the company and run commands from the keyboard.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import {
  Building2, CalendarRange, FileText, FolderKanban, HardHat, Home, Moon, Plus, Receipt, Search, Settings, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import { searchEverything } from '@/features/shell/server.ts';
import { useAssistant } from './Intelligence.tsx';
import { useI18n } from '@/i18n/index.tsx';
import { applyTheme, effectiveDark, readTheme } from '@/lib/theme.ts';
import { StatusChip } from './kit.tsx';
import { screenOf, sees, type Role } from '@struo/core/permissions';

const PATHS: Record<string, string> = {
  'c-today': '/app', 'c-sites': '/app/projects', 'c-plan': '/app/planning', 'c-fin': '/app/finance', 'c-docs': '/app/documents',
  'c-field': '/app/field', 'c-team': '/app/team', 'c-set': '/app/settings', 'a-site': '/app/projects', 'a-inv': '/app/finance', 'a-invite': '/app/team',
};

type Item = { id: string; group: string; icon: LucideIcon; label: string; detail?: ReactNode; run: () => void };

export function CommandPalette({ open, onClose, role }: { open: boolean; onClose: () => void; role: Role }) {
  const assistant = useAssistant();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Awaited<ReturnType<typeof searchEverything>>>([]);
  const [highlight, setHighlight] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(''); setHits([]); setHighlight(0);
    window.setTimeout(() => input.current?.focus(), 10);
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) { setHits([]); return; }
    const handle = window.setTimeout(() => {
      searchEverything({ data: { q: query } }).then(setHits).catch(() => setHits([]));
    }, 160);
    return () => window.clearTimeout(handle);
  }, [query, open]);

  const go = (to: string, search?: Record<string, string>) => () => { onClose(); void navigate({ to, search: search as never }); };
  // Spec 045: a role is only offered its own screens.
  const mine = (path: string) => { const screen = screenOf(path); return !screen || sees(role, screen); };
  const commands: Item[] = useMemo(() => [
    { id: 'c-today', group: t('shell.goTo'), icon: Home, label: t('shell.today'), run: go('/app') },
    { id: 'c-sites', group: t('shell.goTo'), icon: FolderKanban, label: t('shell.sites'), run: go('/app/projects') },
    { id: 'c-plan', group: t('shell.goTo'), icon: CalendarRange, label: t('shell.planning'), run: go('/app/planning') },
    { id: 'c-fin', group: t('shell.goTo'), icon: Wallet, label: t('shell.finance'), run: go('/app/finance') },
    { id: 'c-docs', group: t('shell.goTo'), icon: FileText, label: t('shell.documents'), run: go('/app/documents') },
    { id: 'c-field', group: t('shell.goTo'), icon: HardHat, label: t('shell.field'), run: go('/app/field') },
    { id: 'c-team', group: t('shell.goTo'), icon: Users, label: t('shell.team'), run: go('/app/team') },
    { id: 'c-set', group: t('shell.goTo'), icon: Settings, label: t('shell.settings'), run: go('/app/settings') },
    { id: 'a-site', group: t('shell.actions'), icon: Plus, label: t('shell.newSite'), run: go('/app/projects', { new: '1' }) },
    { id: 'a-inv', group: t('shell.actions'), icon: Receipt, label: t('shell.newInvoice'), run: go('/app/finance', { new: '1' }) },
    { id: 'a-invite', group: t('shell.actions'), icon: Users, label: t('shell.inviteSomeone'), run: go('/app/team', { invite: '1' }) },
    { id: 'a-theme', group: t('shell.actions'), icon: Moon, label: t('shell.toggleTheme'), run: () => { applyTheme(effectiveDark(readTheme()) ? 'light' : 'dark'); onClose(); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ].filter((item) => mine(PATHS[item.id] ?? '')), [t, role]);

  const q = query.trim().toLowerCase();
  const kindIcon = { project: Building2, client: Users, invoice: Receipt, document: FileText } as const;
  const kindGroup = { project: t('shell.sitesFound'), client: t('shell.clientsFound'), invoice: t('shell.invoicesFound'), document: t('shell.documentsFound') } as const;
  const found: Item[] = hits.map((hit) => ({
    id: `${hit.kind}-${hit.id}`,
    group: kindGroup[hit.kind],
    icon: kindIcon[hit.kind],
    label: hit.title,
    detail: hit.detail ?? (hit.status ? <StatusChip shape="todo" label={hit.status} /> : undefined),
    run: hit.kind === 'project' ? go(`/app/projects/${hit.id}`)
      : hit.kind === 'client' ? go('/app/clients')
      : hit.kind === 'invoice' ? go('/app/finance', { invoice: hit.id })
      : go('/app/documents', { doc: hit.id }),
  }));
  const askItem: Item[] = q.length >= 3 ? [{ id: 'ask', group: t('shell.actions'), icon: Search, label: t('shell.askAssistant', { q: query.trim() }), run: () => { onClose(); assistant.open(query.trim()); } }] : [];
  const items = [...found, ...commands.filter((command) => !q || command.label.toLowerCase().includes(q)), ...askItem];

  useEffect(() => { setHighlight(0); }, [query, hits.length]);

  if (!open) return null;
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight((index) => Math.min(items.length - 1, index + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight((index) => Math.max(0, index - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); items[highlight]?.run(); }
  };
  let lastGroup = '';
  return createPortal(
    <>
      <button type="button" className="scrim" aria-label={t('ui.close')} onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('ui.search')} onKeyDown={onKeyDown}>
        <div className="palette-in">
          <Search size={18} style={{ color: 'var(--ink-faint)' }} />
          <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ui.searchHint')} aria-label={t('ui.search')} />
        </div>
        <div className="palette-list" role="listbox">
          {items.length === 0 ? <p className="muted small" style={{ padding: '.75rem' }}>{t('ui.noResults')}</p> : null}
          {items.map((item, index) => {
            const head = item.group !== lastGroup ? <div className="mhead">{item.group}</div> : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {head}
                <button type="button" role="option" aria-selected={index === highlight} className={`mi ${index === highlight ? 'hl' : ''}`}
                  onMouseEnter={() => setHighlight(index)} onClick={item.run} style={{ minHeight: 38 }}>
                  <item.icon size={16} />
                  <span className="grow trunc">{item.label}</span>
                  {item.detail ? <span className="r trunc" style={{ maxWidth: 200 }}>{item.detail}</span> : null}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot"><span>{t('shell.paletteNavigate')}</span><span>{t('shell.paletteOpen')}</span><span>{t('shell.paletteClose')}</span></div>
      </div>
    </>,
    document.body,
  );
}
