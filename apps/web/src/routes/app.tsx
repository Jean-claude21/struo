import { useEffect, useState } from 'react';
import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import {
  Building2, CalendarRange, ChevronsUpDown, FileText, FolderKanban, HardHat, Home, LogOut, Menu, Monitor, Moon, Palette, Plus,
  Receipt, Search, Settings, Shield, Sun, Users, Wallet, WalletCards, Contact, type LucideIcon,
} from 'lucide-react';
import { LanguageSwitch } from '@/components/PublicHeader.tsx';
import { CommandPalette } from '@/components/Palette.tsx';
import { Avatar, MenuItem, Popover } from '@/components/kit.tsx';
import { authClient } from '@/features/auth/client.ts';
import { getShell, selectCompany } from '@/features/shell/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';
import { applyTheme, readTheme, type Theme } from '@/lib/theme.ts';

export const Route = createFileRoute('/app')({
  loader: async ({ location }) => {
    const { viewer } = await getShell();
    if (!viewer) throw redirect({ to: '/login', search: { next: location.pathname } });
    if (!viewer.company) throw redirect({ to: '/onboarding' });
    return { viewer: { ...viewer, company: viewer.company } };
  },
  component: OfficeLayout,
  errorComponent: OfficeError,
});

/** A refusal or an unexpected error, in the person's language, without losing the page. */
function OfficeError({ error }: { error: unknown }) {
  const { t, errorText } = useI18n();
  return (
    <div className="public">
      <div className="card stack">
        <p className="error">{errorText(error)}</p>
        <div className="row">
          <a className="btn secondary" href="/app">{t('nav.dashboard')}</a>
          <button type="button" className="btn" onClick={() => window.location.reload()}>{t('ui.retry')}</button>
        </div>
      </div>
    </div>
  );
}

type NavItem = { to: string; key: MessageKey; icon: LucideIcon; exact?: boolean };
const WORK: NavItem[] = [
  { to: '/app', key: 'shell.today', icon: Home, exact: true },
  { to: '/app/projects', key: 'shell.sites', icon: FolderKanban },
  { to: '/app/planning', key: 'shell.planning', icon: CalendarRange },
  { to: '/app/field', key: 'shell.field', icon: HardHat },
  { to: '/app/finance', key: 'shell.finance', icon: Wallet },
  { to: '/app/expenses', key: 'shell.expenses', icon: WalletCards },
  { to: '/app/documents', key: 'shell.documents', icon: FileText },
];
const COMPANY: NavItem[] = [
  { to: '/app/clients', key: 'shell.clients', icon: Contact },
  { to: '/app/team', key: 'shell.team', icon: Users },
  { to: '/app/settings', key: 'shell.settings', icon: Settings },
];
const MOBILE: NavItem[] = [
  { to: '/app', key: 'shell.today', icon: Home, exact: true },
  { to: '/app/projects', key: 'shell.sites', icon: FolderKanban },
  { to: '/app/planning', key: 'shell.planning', icon: CalendarRange },
  { to: '/app/finance', key: 'shell.finance', icon: Wallet },
  { to: '/app/documents', key: 'shell.documents', icon: FileText },
];

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <Link to={item.to} className="nav-link" activeProps={{ className: 'nav-link active' }} activeOptions={{ exact: item.exact ?? false }} onClick={onNavigate}>
      <item.icon size={17} />
      <span className="grow trunc">{t(item.key)}</span>
    </Link>
  );
}

function OfficeLayout() {
  const { t } = useI18n();
  const { viewer } = Route.useLoaderData();
  const [palette, setPalette] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const path = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => { setTheme(readTheme()); }, []);
  useEffect(() => { setSideOpen(false); }, [path]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const typing = /input|textarea|select/iu.test((event.target as HTMLElement).tagName) || (event.target as HTMLElement).isContentEditable;
      if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) { event.preventDefault(); setPalette((open) => !open); }
      else if (event.key === '/' && !typing) { event.preventDefault(); setPalette(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const changeTheme = (next: Theme) => { applyTheme(next); setTheme(next); };
  const signOut = async () => { await authClient.signOut(); window.location.href = '/'; };
  const role = t(`roles.${viewer.company.role}` as MessageKey);

  return (
    <div className="layout">
      {sideOpen ? <button type="button" className="scrim only-m" aria-label={t('ui.close')} onClick={() => setSideOpen(false)} /> : null}
      <nav className={`sidebar ${sideOpen ? 'open' : ''}`} aria-label="Struo">
        <div className="logo"><span className="logo-mark"><HardHat size={16} /></span><span>Str<span className="accent">uo</span></span></div>
        <Popover
          width={240}
          trigger={(props) => (
            <button type="button" className="company-switch" {...props}>
              <span className="c-logo">{viewer.company.name.slice(0, 2).toUpperCase()}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="c-name trunc" style={{ display: 'block' }}>{viewer.company.name}</span>
                <span className="c-role">{role}</span>
              </span>
              <ChevronsUpDown size={15} style={{ color: 'var(--ink-faint)' }} />
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="mhead">{t('shell.myCompanies')}</div>
              {viewer.companies.map((company) => (
                <MenuItem key={company.id} icon={Building2} checked={company.id === viewer.company.id}
                  onSelect={async () => { close(); if (company.id === viewer.company.id) return; await selectCompany({ data: { orgId: company.id } }); window.location.href = '/app'; }}>
                  {company.name}
                </MenuItem>
              ))}
              <div className="msep" />
              <MenuItem icon={Plus} onSelect={() => { close(); window.location.href = '/onboarding?new=1'; }}>{t('shell.newCompany')}</MenuItem>
            </>
          )}
        </Popover>
        {WORK.map((item) => <NavLink key={item.to} item={item} />)}
        <div className="side-section">{t('shell.company')}</div>
        {COMPANY.map((item) => <NavLink key={item.to} item={item} />)}
        <div className="side-foot">
          <a href="/field" className="btn secondary small"><HardHat size={15} />{t('shell.openField')}</a>
          {viewer.platformAdmin ? <NavLink item={{ to: '/console', key: 'shell.console', icon: Shield }} /> : null}
          <button type="button" className="top-search" onClick={() => setPalette(true)} style={{ minWidth: 0 }}>
            <Search size={14} /><span className="grow" style={{ textAlign: 'left' }}>{t('ui.search')}</span><span className="kbd">Ctrl K</span>
          </button>
        </div>
      </nav>
      <div className="main-wrap">
        <header className="app-top">
          <button type="button" className="icon-btn menu-toggle" aria-label={t('ui.openMenu')} onClick={() => setSideOpen(true)}><Menu size={18} /></button>
          <button type="button" className="top-search" onClick={() => setPalette(true)} aria-label={t('ui.search')}>
            <Search size={14} /><span className="label grow" style={{ textAlign: 'left' }}>{t('ui.searchHint')}</span><span className="kbd hide-m">Ctrl K</span>
          </button>
          <span className="sp" />
          <Popover
            align="end"
            trigger={(props) => <button type="button" className="btn small" {...props}><Plus size={15} /><span className="hide-m">{t('shell.create')}</span></button>}
          >
            {(close) => (
              <>
                <MenuItem icon={FolderKanban} onSelect={() => { close(); window.location.href = '/app/projects?new=1'; }}>{t('shell.newSite')}</MenuItem>
                <MenuItem icon={Receipt} onSelect={() => { close(); window.location.href = '/app/finance?new=1'; }}>{t('shell.newInvoice')}</MenuItem>
                <MenuItem icon={WalletCards} onSelect={() => { close(); window.location.href = '/app/expenses'; }}>{t('shell.newExpense')}</MenuItem>
                <MenuItem icon={FileText} onSelect={() => { close(); window.location.href = '/app/documents'; }}>{t('shell.newDocument')}</MenuItem>
                <div className="msep" />
                <MenuItem icon={Users} onSelect={() => { close(); window.location.href = '/app/team?invite=1'; }}>{t('shell.inviteSomeone')}</MenuItem>
              </>
            )}
          </Popover>
          <Popover
            align="end"
            width={250}
            trigger={(props) => (
              <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} aria-label={viewer.name} {...props}>
                <Avatar name={viewer.name} size="md" />
              </button>
            )}
          >
            {(close) => (
              <>
                <div style={{ padding: '.5rem .6rem' }}>
                  <div style={{ fontWeight: 600 }}>{viewer.name}</div>
                  <div className="muted xsmall trunc">{viewer.email}</div>
                </div>
                <div className="msep" />
                <div className="mhead">{t('ui.theme')}</div>
                <MenuItem icon={Sun} checked={theme === 'light'} onSelect={() => changeTheme('light')}>{t('ui.themeLight')}</MenuItem>
                <MenuItem icon={Moon} checked={theme === 'dark'} onSelect={() => changeTheme('dark')}>{t('ui.themeDark')}</MenuItem>
                <MenuItem icon={Monitor} checked={theme === 'system'} onSelect={() => changeTheme('system')}>{t('ui.themeSystem')}</MenuItem>
                <div className="msep" />
                <div style={{ padding: '.25rem .6rem' }}><LanguageSwitch /></div>
                <MenuItem icon={Palette} onSelect={() => { close(); window.location.href = '/app/system'; }}>{t('shell.system')}</MenuItem>
                <MenuItem icon={LogOut} onSelect={() => { close(); void signOut(); }}>{t('shell.signOut')}</MenuItem>
              </>
            )}
          </Popover>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
      <nav className="mobile-nav" aria-label={t('ui.menu')}>
        {MOBILE.map((item) => (
          <Link key={item.to} to={item.to} activeProps={{ className: 'active' }} activeOptions={{ exact: item.exact ?? false }}>
            <item.icon size={20} />{t(item.key)}
          </Link>
        ))}
      </nav>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
