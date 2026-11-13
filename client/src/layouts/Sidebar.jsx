import {
  Captions,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  DatabaseBackup,
  FolderKanban,
  FolderOpen,
  HardDrive,
  LayoutGrid,
  LifeBuoy,
  ListTodo,
  LogOut,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar.jsx';
import { useCurrentUser, useLogout } from '../features/auth/hooks.js';
import { needsUpgrade } from '../features/billing/pricing.js';
import { UpgradeSidebarCard } from '../features/billing/UpgradeSidebarCard.jsx';
import { useProjects } from '../features/projects/hooks.js';
import { useTasks } from '../features/tasks/hooks.js';
import { useTranscriptionEnabled } from '../features/transcripts/hooks.js';
import { canAdminister, canManage, canView } from '../features/workspaces/roles.js';
import { StorageDetailsDialog } from '../features/workspaces/StorageDetailsDialog.jsx';
import { StorageMeter } from '../features/workspaces/StorageMeter.jsx';
import { WorkspaceSwitcher } from '../features/workspaces/WorkspaceSwitcher.jsx';
import { cn } from '../lib/cn.js';
import { readLocal, writeLocal } from '../lib/storage.js';
import { useDismiss } from '../lib/useDismiss.js';

const OPEN_PROJECT_STATUSES = ['draft', 'active', 'pending', 'review'];
const PROJECT_LINKS_SHOWN = 6;

function useCounts(workspace) {
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
      { to: `${base}/calendar`, label: 'Calendar', icon: CalendarDays },
      { to: `${base}/drive`, label: 'Drive', icon: HardDrive },
      ...(transcription ? [{ to: `${base}/transcribe`, label: 'Transcribe', icon: Captions }] : []),
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
        'ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-center text-[10px] leading-none font-semibold tabular-nums',
        active ? 'bg-surface/20 text-current' : 'bg-lavender text-accent dark:text-ink',
      )}
    >
      {count}
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
          'relative flex items-center rounded-full text-[13px] transition-colors',
          compact ? 'mx-auto h-9 w-9 justify-center' : 'gap-2.5 py-2 pl-3 pr-2',
          isActive ? 'pill-active font-medium' : 'text-ink/75 hover:bg-surface hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {compact ? (
            count > 0 && (
              <span className="bg-accent absolute right-1 top-1 h-1.5 w-1.5 rounded-full" />
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
    <div className="text-muted mb-1 mt-4 flex items-center justify-between px-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hover:text-ink flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
      >
        {label}
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')}
          aria-hidden="true"
        />
      </button>
      {action}
    </div>
  );
}

function WorkspaceProjects({ workspace, openProjects }) {
  const [expanded, setExpanded] = useState(true);
  const base = `/w/${workspace.id}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="hover:bg-surface flex w-full items-center gap-2 rounded-full py-2 pl-3 pr-2 text-left text-[13px]"
      >
        {expanded ? (
          <ChevronDown className="text-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="text-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate font-medium">Ongoing projects</span>
        <CountBadge count={openProjects.length} />
      </button>

      {expanded && (
        <ul className="border-line ml-5 mt-0.5 space-y-0.5 border-l pl-2">
          {openProjects.length === 0 && (
            <li className="text-muted px-2.5 py-1 text-xs">No open projects</li>
          )}
          {openProjects.slice(0, PROJECT_LINKS_SHOWN).map((project) => (
            <li key={project.id}>
              <NavLink
                to={`${base}/projects/${project.id}`}
                className={({ isActive }) =>
                  cn(
                    'block truncate rounded-full px-2.5 py-1 text-xs transition-colors',
                    isActive
                      ? 'bg-lavender text-ink font-medium'
                      : 'text-muted hover:bg-surface hover:text-ink',
                  )
                }
              >
                {project.title}
              </NavLink>
            </li>
          ))}
          {openProjects.length > PROJECT_LINKS_SHOWN && (
            <li>
              <Link
                to={`${base}/projects`}
                className="text-accent block px-2.5 py-1 text-xs font-medium hover:underline"
              >
                View all {openProjects.length}
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

const MENU_LINK =
  'hover:bg-subtle flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-ink/80 hover:text-ink';

// The profile button opens a menu with account and workspace admin pages.
// Clicking the meter opens what is using the space (videos, images, ...).
function SidebarStorage({ workspace, compact }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="See what is using your storage"
        aria-label={compact ? 'Storage' : undefined}
        className={cn(
          'hover:bg-subtle mb-1.5 block text-left',
          compact
            ? 'text-muted hover:text-ink mx-auto grid h-9 w-9 place-items-center rounded-full'
            : 'mx-1 rounded-xl px-2 py-1.5',
        )}
      >
        {compact ? (
          <HardDrive className="h-4 w-4" aria-hidden="true" />
        ) : (
          <StorageMeter
            usedBytes={workspace.storage.usedBytes}
            limitBytes={workspace.storage.limitBytes}
          />
        )}
      </button>
      <StorageDetailsDialog open={open} onClose={() => setOpen(false)} workspace={workspace} />
    </>
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
            'border-line/70 bg-surface shadow-lift absolute bottom-full z-20 mb-2 rounded-2xl border p-1.5',
            compact ? 'left-0 w-56' : 'inset-x-0',
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
              className="text-muted hover:bg-subtle hover:text-danger flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm disabled:opacity-50"
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
          'bg-surface shadow-soft hover:bg-surface/80 flex w-full items-center text-left',
          compact ? 'justify-center rounded-full p-1' : 'gap-2 rounded-2xl p-1.5',
        )}
      >
        {user ? (
          <Avatar name={user.name} src={user.avatarUrl} size="sm" />
        ) : (
          <UserRound className="text-muted h-4 w-4" aria-hidden="true" />
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
      className="text-muted hover:bg-surface hover:text-ink hidden h-8 w-8 shrink-0 place-items-center rounded-full transition-colors lg:grid"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

export function Sidebar({ workspace, isOpen, onClose }) {
  const counts = useCounts(workspace);
  const transcription = useTranscriptionEnabled(workspace.id);
  const [menuOpen, toggleMenu] = useSection('menu');
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
          'bg-bg scrollbar-thin fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col overflow-y-auto overflow-x-hidden px-3 py-4',
          'transition-[transform,width] duration-200 lg:static lg:z-auto lg:translate-x-0 lg:bg-transparent lg:p-0',
          compact ? 'lg:w-11' : 'lg:w-52',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-3 flex justify-end lg:hidden">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="text-muted hover:bg-surface grid h-9 w-9 place-items-center rounded-full"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className={cn('flex items-center gap-1.5', compact && 'flex-col-reverse gap-2')}>
          <div className={cn('min-w-0', !compact && 'flex-1')}>
            <WorkspaceSwitcher current={workspace} compact={compact} />
          </div>
          <CollapseToggle collapsed={compact} onToggle={toggleCollapsed} />
        </div>

        <div className="flex-1 pb-3">
          {compact ? (
            <div className="border-line mx-auto my-3 w-6 border-t" />
          ) : (
            <SectionHeading label="Menu" open={menuOpen} onToggle={toggleMenu} />
          )}
          {(menuOpen || compact) && (
            <nav className="space-y-0.5" aria-label="Workspace">
              {menuItems(workspace, counts, { transcription }).map((item) => (
                <NavItem key={item.to} {...item} compact={compact} />
              ))}
            </nav>
          )}

          {!compact && canView(workspace) && (
            <>
              <SectionHeading
                label="Workspace"
                open={workspaceOpen}
                onToggle={toggleWorkspace}
                action={
                  canManage(workspace) && (
                    <Link
                      to={`/w/${workspace.id}/projects?new=1`}
                      aria-label="New project"
                      title="New project"
                      className="hover:text-ink grid h-6 w-6 place-items-center rounded-full"
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

        {compact ? (
          needsUpgrade(workspace) &&
          canAdminister(workspace) && (
            <Link
              to={`/w/${workspace.id}/upgrade`}
              title="Upgrade"
              aria-label="Upgrade"
              className="widget-lavender text-accent mx-auto mb-1.5 grid h-9 w-9 place-items-center rounded-full"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </Link>
          )
        ) : (
          <UpgradeSidebarCard workspace={workspace} />
        )}
        <SidebarStorage workspace={workspace} compact={compact} />
        <AccountFooter workspace={workspace} compact={compact} />
      </aside>
    </>
  );
}
