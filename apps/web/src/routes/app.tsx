import { homeOf, screenOf, sees, type Screen } from '@struo/core/permissions';
import { NoticeBell } from '@/components/NoticeBell.tsx';
import { PushPrompt } from '@/components/PushToggle.tsx';
import { BrandMark } from '@/components/BrandMark.tsx';
import { useEffect, useRef, useState } from 'react';
import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  BarChart3, Building2, CalendarRange, ChevronsUpDown, FileText, FolderKanban, HardHat, Home, LogOut, Menu, Monitor, Moon, Palette, Plus,
  Keyboard, ListChecks, MailWarning, Sparkles, Receipt, Search, Settings, Shield, Sun, UserRound, Users, Wallet, WalletCards, Contact, type LucideIcon,
} from 'lucide-react';
import { LanguageSwitch } from '@/components/PublicHeader.tsx';
import { CommandPalette } from '@/components/Palette.tsx';
import { AssistantButton, IntelligenceProvider } from '@/components/Intelligence.tsx';
import { Avatar, MenuItem, Modal, Popover } from '@/components/kit.tsx';
import { authClient } from '@/features/auth/client.ts';
import { clearSnapshot } from '@/features/field/store.ts';
import { getShell, selectCompany } from '@/features/shell/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';
import { applyTheme, readTheme, type Theme } from '@/lib/theme.ts';
import { AnnouncementBar, FeedbackButton, OfficeLicenceBar } from '@/components/Platform.tsx';

export const Route = createFileRoute('/app')({
  loader: async ({ location }) => {
    const { viewer } = await getShell();
    if (!viewer) throw redirect({ to: '/login', search: { next: location.pathname } });
    // Spec 074: a platform admin needs no company — the console is their place.
    if (!viewer.company) throw redirect({ to: viewer.platformAdmin ? '/console' : '/onboarding' });
    // Spec 045: a role only opens its own screens; anything else leads to where it starts.
    const screen = screenOf(location.pathname);
    if (screen && !sees(viewer.company.role, screen)) {
      const home = homeOf(viewer.company.role);
      if (home.startsWith('/field')) throw redirect({ href: home });
      throw redirect({ to: home });
    }
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

type NavItem = { to: string; key: MessageKey; icon: LucideIcon; exact?: boolean; screen?: Screen };
const WORK: NavItem[] = [
  { to: '/app', key: 'shell.today', icon: Home, exact: true, screen: 'today' },
  { to: '/app/projects', key: 'shell.sites', icon: FolderKanban, screen: 'projects' },
  { to: '/app/planning', key: 'shell.planning', icon: CalendarRange, screen: 'planning' },
  { to: '/app/tasks', key: 'tasks.nav', icon: ListChecks, screen: 'tasks' },
  { to: '/app/crew', key: 'crew.nav', icon: HardHat, screen: 'crew' },
  { to: '/app/indicators', key: 'kpi.navLabel', icon: BarChart3, screen: 'indicators' },
  { to: '/app/field', key: 'shell.field', icon: HardHat, screen: 'field' },
  { to: '/app/finance', key: 'shell.finance', icon: Wallet, screen: 'finance' },
  { to: '/app/expenses', key: 'shell.expenses', icon: WalletCards, screen: 'expenses' },
  { to: '/app/documents', key: 'shell.documents', icon: FileText, screen: 'documents' },
];
const COMPANY: NavItem[] = [
  { to: '/app/clients', key: 'shell.clients', icon: Contact, screen: 'clients' },
  { to: '/app/team', key: 'shell.team', icon: Users, screen: 'team' },
  { to: '/app/intelligence', key: 'ai.navLabel', icon: Sparkles, screen: 'intelligence' },
  { to: '/app/settings', key: 'shell.settings', icon: Settings, screen: 'settings' },
];
const MOBILE: NavItem[] = [
  { to: '/app', key: 'shell.today', icon: Home, exact: true, screen: 'today' },
  { to: '/app/projects', key: 'shell.sites', icon: FolderKanban, screen: 'projects' },
  { to: '/app/planning', key: 'shell.planning', icon: CalendarRange, screen: 'planning' },
  { to: '/app/finance', key: 'shell.finance', icon: Wallet, screen: 'finance' },
  { to: '/app/documents', key: 'shell.documents', icon: FileText, screen: 'documents' },
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

// Keyboard: « G » then a letter goes to a page; « N » creates on the pages that have something to create.
const GO_KEYS: Record<string, string> = {
  a: '/app', c: '/app/projects', p: '/app/planning', t: '/app/field', f: '/app/finance', d: '/app/documents',
  e: '/app/expenses', l: '/app/clients', q: '/app/team', s: '/app/settings',
};
const CREATE_ON: Record<string, string> = {
  '/app/projects': '/app/projects?new=1', '/app/finance': '/app/finance?new=1', '/app/expenses': '/app/expenses?new=1',
  '/app/team': '/app/team?invite=1', '/app/clients': '/app/clients?new=1', '/app/planning': '/app/planning?new=1', '/app/documents': '/app/documents?new=1',
};
const SHORTCUTS: [string[], MessageKey][] = [
  [['Ctrl', 'K'], 'shell.kPalette'], [['Ctrl', 'J'], 'ai.open'], [['/'], 'shell.kSearch'], [['?'], 'shell.kHelp'], [['N'], 'shell.kNew'],
  [['G', 'A'], 'shell.today'], [['G', 'C'], 'shell.sites'], [['G', 'P'], 'shell.planning'], [['G', 'T'], 'shell.field'],
  [['G', 'F'], 'shell.finance'], [['G', 'E'], 'shell.expenses'], [['G', 'D'], 'shell.documents'], [['G', 'L'], 'shell.clients'],
  [['G', 'Q'], 'shell.team'], [['G', 'S'], 'shell.settings'], [['Échap'], 'shell.kEscape'],
];

function OfficeLayout() {
  const { t } = useI18n();
  const { viewer } = Route.useLoaderData();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const goPending = useRef(false);
  const navigate = useNavigate();
  const [sideOpen, setSideOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const path = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => { setTheme(readTheme()); }, []);
  useEffect(() => { setSideOpen(false); }, [path]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const typing = /input|textarea|select/iu.test((event.target as HTMLElement).tagName) || (event.target as HTMLElement).isContentEditable;
      if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) { event.preventDefault(); setPalette((open) => !open); return; }
      if (typing || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('.modal, .pop')) return;
      if (event.key === '/') { event.preventDefault(); setPalette(true); return; }
      if (event.key === '?') { event.preventDefault(); setHelp(true); return; }
      // « G » then a letter: go to a page (within 1.2 s).
      if (goPending.current) {
        goPending.current = false;
        const target = GO_KEYS[event.key.toLowerCase()];
        if (target) { event.preventDefault(); void navigate({ to: target }); }
        return;
      }
      if (event.key === 'g' || event.key === 'G') { goPending.current = true; window.setTimeout(() => { goPending.current = false; }, 1200); return; }
      // « N »: create on the current page (a site, an invoice, an expense…).
      if (event.key === 'n' || event.key === 'N') {
        const create = CREATE_ON[window.location.pathname];
        if (create) { event.preventDefault(); window.location.href = create; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const changeTheme = (next: Theme) => { applyTheme(next); setTheme(next); };
  const signOut = async () => { await clearSnapshot().catch(() => undefined); await authClient.signOut(); window.location.href = '/'; };
  const role = t(`roles.${viewer.company.role}` as MessageKey);
  // A role only sees the pages it may open.
  const allowed = (item: NavItem) => !item.screen || sees(viewer.company.role, item.screen);

  return (
    <IntelligenceProvider>
    <div className="layout">
      {sideOpen ? <button type="button" className="scrim only-m" aria-label={t('ui.close')} onClick={() => setSideOpen(false)} /> : null}
      <nav className={`sidebar ${sideOpen ? 'open' : ''}`} aria-label="Struo">
        <div className="logo"><BrandMark size={26} /><span>struo</span></div>
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
        {WORK.filter(allowed).map((item) => <NavLink key={item.to} item={item} />)}
        <div className="side-section">{t('shell.company')}</div>
        {COMPANY.filter(allowed).map((item) => <NavLink key={item.to} item={item} />)}
        <div className="side-foot">
          <a href="/field" className="btn secondary small"><HardHat size={15} />{t('shell.openField')}</a>
          {viewer.platformAdmin ? <NavLink item={{ to: '/console', key: 'shell.console', icon: Shield }} /> : null}
          <button type="button" className="top-search" onClick={() => setPalette(true)} style={{ minWidth: 0 }}>
            <Search size={14} /><span className="grow" style={{ textAlign: 'left' }}>{t('ui.search')}</span><span className="kbd">Ctrl K</span>
          </button>
          <button type="button" className="btn ghost small" style={{ justifyContent: 'flex-start' }} onClick={() => void signOut()}><LogOut size={15} />{t('shell.signOut')}</button>
        </div>
      </nav>
      <div className="main-wrap">
        <header className="app-top">
          <button type="button" className="icon-btn menu-toggle" aria-label={t('ui.openMenu')} onClick={() => setSideOpen(true)}><Menu size={18} /></button>
          <button type="button" className="top-search" onClick={() => setPalette(true)} aria-label={t('ui.search')}>
            <Search size={14} /><span className="label grow" style={{ textAlign: 'left' }}>{t('ui.searchHint')}</span><span className="kbd hide-m">Ctrl K</span>
          </button>
          <span className="sp" />
          <NoticeBell />
          <AssistantButton />
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
                <MenuItem icon={UserRound} onSelect={() => { close(); void navigate({ to: '/app/account' }); }}>{t('account.title')}</MenuItem>
                <div className="msep" />
                <div className="mhead">{t('ui.theme')}</div>
                <MenuItem icon={Sun} checked={theme === 'light'} onSelect={() => changeTheme('light')}>{t('ui.themeLight')}</MenuItem>
                <MenuItem icon={Moon} checked={theme === 'dark'} onSelect={() => changeTheme('dark')}>{t('ui.themeDark')}</MenuItem>
                <MenuItem icon={Monitor} checked={theme === 'system'} onSelect={() => changeTheme('system')}>{t('ui.themeSystem')}</MenuItem>
                <div className="msep" />
                <div style={{ padding: '.25rem .6rem' }}><LanguageSwitch /></div>
                <MenuItem icon={Keyboard} onSelect={() => { close(); setHelp(true); }} right="?">{t('shell.shortcuts')}</MenuItem>
                <MenuItem icon={Palette} onSelect={() => { close(); window.location.href = '/app/system'; }}>{t('shell.system')}</MenuItem>
                <MenuItem icon={LogOut} onSelect={() => { close(); void signOut(); }}>{t('shell.signOut')}</MenuItem>
              </>
            )}
          </Popover>
        </header>
        <main className="main">
          {!viewer.emailVerified && path !== '/app/account' ? (
            <div className="notice warn small row tight" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
              <MailWarning size={16} />
              <span>{t('account.banner', { email: viewer.email })}</span>
              <Link to="/app/account" className="btn small secondary" style={{ marginLeft: 'auto' }}>{t('account.bannerAction')}</Link>
            </div>
          ) : null}
          <AnnouncementBar />
          <OfficeLicenceBar role={viewer.company.role} />
          <PushPrompt />
          <Outlet />
        </main>
        <FeedbackButton />
      </div>
      <nav className="mobile-nav" aria-label={t('ui.menu')}>
        {MOBILE.filter(allowed).map((item) => (
          <Link key={item.to} to={item.to} activeProps={{ className: 'active' }} activeOptions={{ exact: item.exact ?? false }}>
            <item.icon size={20} />{t(item.key)}
          </Link>
        ))}
      </nav>
      <CommandPalette open={palette} onClose={() => setPalette(false)} role={viewer.company.role} />
      <Modal open={help} onClose={() => setHelp(false)} title={t('shell.shortcuts')}>
        <div className="shortcuts">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label} className="alert-row"><span className="grow">{t(label)}</span><span className="row tight">{keys.map((key) => <span key={key} className="kbd">{key}</span>)}</span></div>
          ))}
        </div>
      </Modal>
    </div>
    </IntelligenceProvider>
  );
}
