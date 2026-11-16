import {
  Captions,
  CalendarDays,
  ChevronDown,
  ChevronsUpDown,
  DatabaseBackup,
  FolderKanban,
  HardDrive,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  ListTodo,
  LogOut,
  MonitorDown,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Receipt,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar.jsx';
import { AI_GRADIENT, AI_TEXT } from '../features/ai/aiStyle.js';
import { useAiStatus } from '../features/ai/hooks.js';
import { UsageRing } from '../features/ai/AiUsage.jsx';
import { AiUsageDialog } from '../features/ai/AiUsageDialog.jsx';
import { useCurrentUser, useLogout } from '../features/auth/hooks.js';
import { openInstall } from '../features/install/InstallApp.jsx';
import { useInstallState } from '../features/install/installState.js';
import { needsUpgrade } from '../features/billing/pricing.js';
import { useProjects } from '../features/projects/hooks.js';
import { useTasks } from '../features/tasks/hooks.js';
import { useTranscriptionEnabled } from '../features/transcripts/hooks.js';
import { canAdminister, canManage, canView } from '../features/workspaces/roles.js';
import { StorageDetailsDialog } from '../features/workspaces/StorageDetailsDialog.jsx';
import { planLabel } from '../features/workspaces/planLabel.js';
import { WorkspaceSwitcher } from '../features/workspaces/WorkspaceSwitcher.jsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';
import { cn } from '../lib/cn.js';
import { formatBytes } from '../lib/format.js';
import { readLocal, writeLocal } from '../lib/storage.js';
import { useDismiss } from '../lib/useDismiss.js';

const OPEN_PROJECT_STATUSES = ['draft', 'active', 'pending', 'review'];
const PROJECT_LINKS_SHOWN = 5;

export function useCounts(workspace) {
  const enabled = canView(workspace);
  const { data: projects = [] } = useProjects(workspace.id, {}, { enabled });
  const { data: myTasks = [] } = useTasks(workspace.id, { assignee: 'me' }, { enabled });
  const openProjects = projects.filter((project) => OPEN_PROJECT_STATUSES.includes(project.status));
  return {
    openProjects,
    myOpenTasks: myTasks.filter((task) => task.status !== 'done').length,
  };
}

function menuItems(workspace, counts, { transcription }) {
  const base = `/w/${workspace.id}`;
  const items = [{ to: base, label: 'Dashboard', icon: LayoutGrid, end: true }];
  if (canView(workspace)) {
    items.push(
      {
        to: `${base}/projects`,
        label: 'Projects',
        icon: FolderKanban,
        count: counts.openProjects.length,
      },
      { to: `${base}/tasks`, label: 'My tasks', icon: ListTodo, count: counts.myOpenTasks },
      { to: `${base}/notes`, label: 'Quick notes', icon: NotebookPen },
      { to: `${base}/moodboards`, label: 'Moodboards', icon: LayoutDashboard },
      { to: `${base}/calendar`, label: 'Calendar', icon: CalendarDays },
      { to: `${base}/drive`, label: 'Drive', icon: HardDrive },
      ...(transcription ? [{ to: `${base}/transcribe`, label: 'Transcribe', icon: Captions }] : []),
      { to: `${base}/social`, label: 'Social Media', icon: Share2 },
      { to: `${base}/clients`, label: 'Clients', icon: Users },
    );
  }
  return items;
}

function CountBadge({ count, active }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        // leading-none + a fixed 20px circle keeps a single digit dead centre;
        // longer counts grow sideways from min-w-5 with a little padding.
        'ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-center text-[10px] font-semibold tabular-nums leading-none transition-colors',
        active ? 'bg-surface/20 text-current' : 'bg-lavender text-accent dark:text-ink',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function NavItem({ to, label, icon: Icon, end, count, compact }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex items-center rounded-full text-[13px] font-medium transition-all duration-150',
          compact ? 'mx-auto h-9 w-9 justify-center' : 'gap-2.5 px-3 py-2',
          isActive ? 'pill-active shadow-sm' : 'text-ink/75 hover:bg-subtle hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {compact ? (
            count > 0 && (
              <span className="bg-accent absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ring-2 ring-surface" />
            )
          ) : (
            <>
              <span className="truncate">{label}</span>
              <CountBadge count={count} active={isActive} />
            </>
          )}
        </>
      )}
    </NavLink>
  );
}

// Its own sidebar section: a bright "Ask AI" link to the assistant page, with
// how much of the current 5-hour session is used. Hidden while the assistant is off.
function AiSection({ workspace, compact }) {
  const status = useAiStatus(workspace.id, { enabled: canView(workspace) });
  if (!status.data?.enabled) return null;
  const to = `/w/${workspace.id}/ai`;
  const sessionPercent = status.data.credits?.session?.percent ?? 0;

  if (compact) {
    return (
      <NavLink
        to={to}
        title="Ask AI"
        aria-label="Ask AI"
        className={cn(
          AI_GRADIENT,
          'mx-auto mt-2 grid h-9 w-9 place-items-center rounded-full text-white shadow-sm shadow-fuchsia-500/30 transition-transform hover:scale-105 active:scale-95',
        )}
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </NavLink>
    );
  }

  return (
    <div className="border-line/70 mt-2.5 border-t pt-2.5">
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn(
            'group flex items-center gap-2.5 rounded-full py-1.5 pl-2 pr-2.5 text-[13px] transition-all',
            isActive
              ? 'bg-subtle/90 shadow-soft ring-1 ring-accent/30 font-medium'
              : 'text-ink/75 hover:bg-subtle hover:text-ink',
          )
        }
      >
        <span
          className={cn(
            AI_GRADIENT,
            'grid h-6 w-6 shrink-0 place-items-center rounded-full text-white shadow-sm shadow-fuchsia-500/30 transition-transform group-hover:scale-110',
          )}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className={cn(AI_TEXT, 'truncate font-semibold')}>Ask AI</span>
        <span
          className="text-muted ml-auto flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums"
          title={`${sessionPercent}% of this 5-hour session used`}
        >
          <UsageRing percent={sessionPercent} size={14} />
          {sessionPercent}%
        </span>
      </NavLink>
    </div>
  );
}

// A section heading that remembers whether it is collapsed.
function useSection(key) {
  const storageKey = `sidebar:${key}`;
  const [open, setOpen] = useState(() => readLocal(storageKey) !== 'closed');
  function toggle() {
    writeLocal(storageKey, open ? 'closed' : 'open');
    setOpen(!open);
  }
  return [open, toggle];
}

function SectionHeading({ label, open, onToggle, action }) {
  return (
    <div className="text-muted mb-1 mt-3.5 flex items-center justify-between px-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-muted/80 hover:text-ink flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors"
      >
        {label}
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform duration-200', !open && '-rotate-90')}
          aria-hidden="true"
        />
      </button>
      {action}
    </div>
  );
}

function WorkspaceProjects({ workspace, openProjects }) {
  const base = `/w/${workspace.id}`;
  if (openProjects.length === 0) {
    return <p className="text-muted/70 px-3 py-1.5 text-xs italic">No open projects</p>;
  }
  return (
    <ul className="space-y-0.5">
      {openProjects.slice(0, PROJECT_LINKS_SHOWN).map((project) => (
        <li key={project.id}>
          <NavLink
            to={`${base}/projects/${project.id}`}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-2.5 rounded-full py-1.5 pl-3 pr-2 text-xs transition-colors',
                isActive
                  ? 'bg-lavender/70 dark:bg-lavender/30 text-ink font-medium shadow-xs'
                  : 'text-ink/70 hover:bg-subtle hover:text-ink',
              )
            }
          >
            <span
              className="bg-accent/60 group-hover:bg-accent h-1.5 w-1.5 shrink-0 rounded-full transition-colors"
              aria-hidden="true"
            />
            <span className="truncate">{project.title}</span>
          </NavLink>
        </li>
      ))}
      {openProjects.length > PROJECT_LINKS_SHOWN && (
        <li>
          <Link
            to={`${base}/projects`}
            className="text-accent hover:text-accent/80 block px-3 py-1 text-xs font-medium hover:underline transition-colors"
          >
            View all {openProjects.length}
          </Link>
        </li>
      )}
    </ul>
  );
}

const MENU_LINK =
  'hover:bg-subtle flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-ink/80 hover:text-ink';

// One thin labelled bar (storage, AI): a button that opens its details.
function MiniMeter({ label, value, percent, tone, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="hover:bg-surface/90 dark:hover:bg-surface/60 block w-full rounded-xl px-2 py-1.5 text-left transition-colors"
    >
      <span className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-ink/80 font-medium">{label}</span>
        <span className={cn('truncate tabular-nums', tone === 'danger' ? 'text-danger' : 'text-muted')}>
          {value}
        </span>
      </span>
      <span className="bg-line/80 mt-1.5 block h-1.5 overflow-hidden rounded-full">
        <span
          className={cn(
            'block h-full rounded-full transition-[width] duration-700',
            tone === 'danger'
              ? 'bg-danger'
              : tone === 'warning'
                ? 'bg-warning'
                : (tone ?? 'bg-accent'),
          )}
          style={{ width: `${Math.max(percent, percent > 0 ? 4 : 0)}%` }}
        />
      </span>
    </button>
  );
}

// The plan, storage and AI usage in one small card above the account button.
// Collapsed, it is three icons.
function PlanCard({ workspace, compact }) {
  const status = useAiStatus(workspace.id, { enabled: canView(workspace) });
  const [dialog, setDialog] = useState(null); // 'storage' | 'ai'
  const credits = status.data?.enabled ? status.data.credits : null;
  const { usedBytes, limitBytes } = workspace.storage;
  const storagePercent = limitBytes > 0 ? Math.min((usedBytes / limitBytes) * 100, 100) : 0;
  const session = credits?.session.percent ?? 0;
  const aiFull = credits && credits.limitedBy !== null && credits.extra === 0;
  const showUpgrade = needsUpgrade(workspace) && canAdminister(workspace);
  const upgradeTo = `/w/${workspace.id}/upgrade`;

  const dialogs = (
    <>
      <StorageDetailsDialog
        open={dialog === 'storage'}
        onClose={() => setDialog(null)}
        workspace={workspace}
      />
      {credits && (
        <AiUsageDialog
          workspace={workspace}
          status={status.data}
          open={dialog === 'ai'}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );

  if (compact) {
    const iconButton =
      'text-muted hover:bg-subtle hover:text-ink mx-auto grid h-9 w-9 place-items-center rounded-full transition-colors';
    return (
      <div className="mb-2 space-y-1">
        <div className="border-line/70 mx-auto mb-1.5 w-6 border-t" />
        {showUpgrade && (
          <Link
            to={upgradeTo}
            title="Upgrade"
            aria-label="Upgrade"
            className="widget-lavender text-accent mx-auto grid h-9 w-9 place-items-center rounded-full transition-transform hover:scale-105"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
        {credits && (
          <button
            type="button"
            onClick={() => setDialog('ai')}
            title="AI usage limits"
            aria-label={`AI usage: ${session}% of this session`}
            className={iconButton}
          >
            <UsageRing percent={session} size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setDialog('storage')}
          title="See what is using your storage"
          aria-label="Storage"
          className={iconButton}
        >
          <HardDrive className="h-4 w-4" aria-hidden="true" />
        </button>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="bg-subtle/60 border-line/70 mb-2 rounded-2xl border p-2 transition-colors">
      <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-0.5">
        <span className="truncate text-[11px] font-semibold">{planLabel(workspace.billing)}</span>
        {showUpgrade && (
          <Link
            to={upgradeTo}
            className="text-accent hover:text-accent/80 inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold hover:underline transition-colors"
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Upgrade
          </Link>
        )}
      </div>
      <MiniMeter
        label="Storage"
        value={`${formatBytes(usedBytes)} / ${formatBytes(limitBytes)}`}
        percent={storagePercent}
        tone={storagePercent >= 90 ? 'danger' : undefined}
        onClick={() => setDialog('storage')}
        title="See what is using your storage"
      />
      {credits && (
        <MiniMeter
          label="AI"
          value={aiFull ? 'Limit reached' : `${session}% · week ${credits.weekly.percent}%`}
          percent={session}
          tone={session >= 100 ? 'danger' : session >= 80 ? 'warning' : AI_GRADIENT}
          onClick={() => setDialog('ai')}
          title="AI usage limits"
        />
      )}
      {dialogs}
    </div>
  );
}

function AccountFooter({ workspace, compact }) {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(containerRef, isOpen, close);
  const install = useInstallState();
  const base = `/w/${workspace.id}`;

  function signOut() {
    close();
    logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) });
  }

  return (
    <div ref={containerRef} className="relative">
      {isOpen && (
        <div
          role="menu"
          className={cn(
            'border-line/70 bg-surface/95 shadow-lift animate-[fade-in_120ms_ease-out] absolute bottom-full z-20 mb-2 rounded-2xl border p-1.5 backdrop-blur-md',
            compact ? 'left-0 w-60' : 'inset-x-0',
          )}
        >
          <Link to={`${base}/account`} onClick={close} role="menuitem" className={MENU_LINK}>
            <UserRound className="h-4 w-4" aria-hidden="true" />
            Your profile
          </Link>
          <Link
            to={`${base}/account?tab=billing`}
            onClick={close}
            role="menuitem"
            className={MENU_LINK}
          >
            <Receipt className="h-4 w-4" aria-hidden="true" />
            Billing &amp; invoices
          </Link>
          <Link
            to={`${base}/account?tab=connectors`}
            onClick={close}
            role="menuitem"
            className={MENU_LINK}
          >
            <Plug className="h-4 w-4" aria-hidden="true" />
            AI connectors
          </Link>
          {canAdminister(workspace) && (
            <>
              <Link to={`${base}/settings`} onClick={close} role="menuitem" className={MENU_LINK}>
                <Settings className="h-4 w-4" aria-hidden="true" />
                Workspace settings
              </Link>
              <Link to={`${base}/backup`} onClick={close} role="menuitem" className={MENU_LINK}>
                <DatabaseBackup className="h-4 w-4" aria-hidden="true" />
                Backup &amp; restore
              </Link>
            </>
          )}
          <Link to={`${base}/support`} onClick={close} role="menuitem" className={MENU_LINK}>
            <LifeBuoy className="h-4 w-4" aria-hidden="true" />
            Help &amp; support
          </Link>
          {!install.installed && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                openInstall();
              }}
              className={cn(MENU_LINK, 'w-full text-left')}
            >
              <MonitorDown className="h-4 w-4" aria-hidden="true" />
              Install app
            </button>
          )}
          {user?.isSuperadmin && (
            <Link to="/admin" onClick={close} role="menuitem" className={MENU_LINK}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Admin
            </Link>
          )}
          <div className="border-line mt-1 border-t pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              disabled={logout.isPending}
              className="text-muted hover:bg-subtle hover:text-danger flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={compact ? user?.name : undefined}
        aria-label={compact ? 'Account menu' : undefined}
        className={cn(
          'border-line/70 bg-surface/90 shadow-soft hover:bg-surface hover:border-line flex w-full items-center border text-left transition-all',
          compact ? 'justify-center rounded-full p-1.5' : 'gap-2.5 rounded-2xl p-2',
        )}
      >
        {user ? (
          <Avatar name={user.name} src={user.avatarUrl} size="sm" className="shrink-0" />
        ) : (
          <span className="bg-subtle grid h-8 w-8 shrink-0 place-items-center rounded-full">
            <UserRound className="text-muted h-4 w-4" aria-hidden="true" />
          </span>
        )}
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{user?.name}</span>
              {user?.email && (
                <span className="text-muted block truncate text-[11px]">{user.email}</span>
              )}
            </span>
            <ChevronsUpDown className="text-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </>
        )}
      </button>
    </div>
  );
}

// Icon-only toggle in the sidebar header (desktop only).
function CollapseToggle({ collapsed, onToggle }) {
  const label = collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)';
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
      className="text-muted hover:bg-subtle hover:text-ink hidden h-8 w-8 shrink-0 place-items-center rounded-full transition-colors lg:grid"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

export function Sidebar({ workspace, isOpen, onClose }) {
  const counts = useCounts(workspace);
  const transcription = useTranscriptionEnabled(workspace.id);
  const [workspaceOpen, toggleWorkspace] = useSection('workspace');
  const [collapsed, setCollapsed] = useState(() => readLocal('sidebar:collapsed') === '1');
  // The mobile drawer always shows full width; collapsing is a desktop view.
  const compact = collapsed && !isOpen;

  const toggleCollapsed = useCallback(() => {
    setCollapsed((was) => {
      writeLocal('sidebar:collapsed', was ? '0' : '1');
      return !was;
    });
  }, []);

  // Ctrl+B / Cmd+B toggles the sidebar, as in most editors and dashboards.
  useEffect(() => {
    function onKey(event) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b') return;
      const target = event.target;
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
        return;
      event.preventDefault();
      toggleCollapsed();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  return (
    <>
      {isOpen && (
        <div
          className="bg-ink/30 fixed inset-0 z-30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'bg-surface/95 fixed inset-y-0 left-0 z-40 flex w-[min(18.5rem,85vw)] shrink-0 flex-col overflow-hidden px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl backdrop-blur-xl',
          // Desktop: its own panel beside the page, so the two never run together.
          'transition-[transform,width] duration-200 lg:static lg:z-auto lg:translate-x-0',
          'lg:bg-surface/85 lg:border-line/70 lg:shadow-soft lg:rounded-3xl lg:border lg:p-2.5 lg:backdrop-blur-xl',
          compact ? 'lg:w-[3.75rem]' : 'lg:w-60',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-3 flex items-center justify-between lg:hidden">
          <span className="sm:hidden">
            <ThemeToggle compact />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="text-muted hover:bg-subtle hover:text-ink ml-auto grid h-9 w-9 place-items-center rounded-full transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className={cn('flex items-center gap-1.5', compact && 'flex-col gap-2')}>
          <div className={cn('min-w-0', !compact && 'flex-1')}>
            <WorkspaceSwitcher current={workspace} compact={compact} />
          </div>
          <CollapseToggle collapsed={compact} onToggle={toggleCollapsed} />
        </div>

        {/* Only this middle part scrolls; the switcher and account stay put. */}
        <div className="scrollbar-thin -mx-1 mt-2.5 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-2">
          {compact && <div className="border-line/70 mx-auto mb-2 w-6 border-t" />}
          <nav className="space-y-0.5" aria-label="Workspace">
            {menuItems(workspace, counts, { transcription }).map((item) => (
              <NavItem key={item.to} {...item} compact={compact} />
            ))}
          </nav>

          <AiSection workspace={workspace} compact={compact} />

          {!compact && canView(workspace) && (
            <>
              <SectionHeading
                label="Ongoing projects"
                open={workspaceOpen}
                onToggle={toggleWorkspace}
                action={
                  canManage(workspace) && (
                    <Link
                      to={`/w/${workspace.id}/projects?new=1`}
                      aria-label="New project"
                      title="New project"
                      className="text-muted hover:bg-subtle hover:text-ink grid h-6 w-6 place-items-center rounded-full transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  )
                }
              />
              {workspaceOpen && (
                <WorkspaceProjects workspace={workspace} openProjects={counts.openProjects} />
              )}
            </>
          )}
        </div>

        <PlanCard workspace={workspace} compact={compact} />
        <AccountFooter workspace={workspace} compact={compact} />
      </aside>
    </>
  );
}
