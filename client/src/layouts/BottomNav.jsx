import { CalendarDays, FolderKanban, LayoutGrid, ListTodo, Menu } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { canView } from '../features/workspaces/roles.js';
import { cn } from '../lib/cn.js';
import { useCounts } from './Sidebar.jsx';

// Phones and tablets: an app-style tab bar along the bottom edge, like a
// native Android app. "More" opens the full menu (the sidebar drawer).
// Large screens keep the sidebar instead.

function TabIcon({ icon: Icon, active, count }) {
  return (
    <span
      className={cn(
        'relative grid h-8 w-14 place-items-center rounded-full transition-colors duration-200',
        active ? 'bg-lavender text-ink dark:text-ink' : 'text-muted',
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.9} aria-hidden="true" />
      {count > 0 && (
        <span className="bg-accent text-accent-ink absolute -top-1 right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums leading-none">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  );
}

const TAB_CLASS =
  'flex min-w-0 flex-1 select-none flex-col items-center gap-1 pb-1.5 pt-2 text-[11px] font-medium transition-transform active:scale-95';

function Tab({ to, end, label, icon, count }) {
  return (
    <NavLink to={to} end={end} viewTransition className={TAB_CLASS}>
      {({ isActive }) => (
        <>
          <TabIcon icon={icon} active={isActive} count={count} />
          <span className={cn('truncate', isActive ? 'text-ink' : 'text-muted')}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function BottomNav({ workspace, menuOpen, onOpenMenu }) {
  const counts = useCounts(workspace);
  const base = `/w/${workspace.id}`;
  const team = canView(workspace);

  return (
    <nav
      aria-label="Main"
      style={{ viewTransitionName: 'bottom-nav' }}
      className="border-line/70 bg-surface/95 supports-[backdrop-filter]:bg-surface/85 fixed inset-x-0 bottom-0 z-[25] flex border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <Tab to={base} end label="Home" icon={LayoutGrid} />
      {team && (
        <>
          <Tab to={`${base}/projects`} label="Projects" icon={FolderKanban} />
          <Tab to={`${base}/tasks`} label="Tasks" icon={ListTodo} count={counts.myOpenTasks} />
          <Tab to={`${base}/calendar`} label="Calendar" icon={CalendarDays} />
        </>
      )}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-expanded={menuOpen}
        aria-label="More: open the full menu"
        className={TAB_CLASS}
      >
        <TabIcon icon={Menu} active={menuOpen} />
        <span className={menuOpen ? 'text-ink' : 'text-muted'}>More</span>
      </button>
    </nav>
  );
}
