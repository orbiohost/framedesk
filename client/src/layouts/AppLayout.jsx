import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { Avatar } from '../components/ui/Avatar.jsx';
import { FullPageMessage } from '../components/ui/FullPageMessage.jsx';
import { Logo } from '../components/ui/Logo.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';
import { AiAssistant, useAiEnabled } from '../features/ai/AiAssistant.jsx';
import { useCurrentUser } from '../features/auth/hooks.js';
import { VerifyEmailBanner } from '../features/auth/VerifyEmailBanner.jsx';
import { PlanStatusBanner } from '../features/billing/PlanStatusBanner.jsx';
import { QuickNoteButton } from '../features/quickNotes/QuickNoteButton.jsx';
import { UploadTray } from '../features/files/UploadTray.jsx';
import { useWorkspace } from '../features/workspaces/hooks.js';
import { rememberWorkspace } from '../features/workspaces/lastWorkspace.js';
import { canView } from '../features/workspaces/roles.js';
import { cn } from '../lib/cn.js';
import { BottomNav } from './BottomNav.jsx';
import { GlobalSearch } from './GlobalSearch.jsx';
import { NotificationsMenu } from './NotificationsMenu.jsx';
import { Sidebar } from './Sidebar.jsx';

function LayoutSkeleton() {
  return (
    <div>
      <div className="bg-surface flex min-h-screen gap-4 p-4">
        <Skeleton className="hidden w-56 lg:block" />
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-40 w-full max-w-3xl" />
        </div>
      </div>
    </div>
  );
}

function TopBar({ workspace }) {
  const { data: user } = useCurrentUser();
  const { pathname } = useLocation();
  const team = canView(workspace);
  // Phones: search hides behind an icon, like an app bar, and closes on navigation.
  const [searchOpenOn, setSearchOpenOn] = useState(null);
  const searchOpen = searchOpenOn === pathname;
  const searchRowRef = useRef(null);

  useEffect(() => {
    if (searchOpen) searchRowRef.current?.querySelector('input')?.focus();
  }, [searchOpen]);

  return (
    <div
      style={{ viewTransitionName: 'top-bar' }}
      className="bg-surface/95 supports-[backdrop-filter]:bg-surface/85 border-line/70 sticky top-0 z-20 select-none border-b px-3 pt-[max(0.25rem,env(safe-area-inset-top))] backdrop-blur-md sm:static sm:border-b-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:backdrop-blur-none"
    >
      <header className="short:pb-2 short:pt-0 flex h-14 items-center gap-2 sm:h-auto sm:gap-3 sm:px-2 sm:pb-3 sm:pt-1 md:gap-4">
        <Link
          to={`/w/${workspace.id}`}
          aria-label="FrameDesk home"
          className="min-w-0 shrink rounded-lg px-1 py-1"
        >
          <Logo />
        </Link>

        <div className="flex min-w-0 flex-1 justify-center">
          {team && (
            <GlobalSearch workspaceId={workspace.id} className="hidden w-full max-w-md md:block" />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {team && (
            <button
              type="button"
              onClick={() => setSearchOpenOn(searchOpen ? null : pathname)}
              aria-label={searchOpen ? 'Close search' : 'Search'}
              aria-expanded={searchOpen}
              className="bg-subtle grid h-10 w-10 place-items-center rounded-full active:scale-95 md:hidden"
            >
              {searchOpen ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
          <span className="hidden md:block">
            <ThemeToggle />
          </span>
          <span className="hidden sm:block md:hidden">
            <ThemeToggle compact />
          </span>
          {team && <QuickNoteButton workspaceId={workspace.id} />}
          {team && <NotificationsMenu workspaceId={workspace.id} />}
          {user && (
            <NavLink
              to={`/w/${workspace.id}/account`}
              className="bg-subtle hover:bg-line/60 flex items-center gap-2 rounded-full p-1 sm:pr-4"
            >
              <Avatar name={user.name} src={user.avatarUrl} size="sm" className="ring-0" />
              <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
                {user.name.split(' ')[0]}
              </span>
            </NavLink>
          )}
        </div>
      </header>
      {team && searchOpen && (
        <div ref={searchRowRef} className="animate-[fade-in_150ms_ease-out] pb-2.5 md:hidden">
          <GlobalSearch workspaceId={workspace.id} className="w-full" />
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { workspaceId } = useParams();
  const { pathname } = useLocation();
  const { data: workspace, isPending, isError, error, refetch } = useWorkspace(workspaceId);
  const aiEnabled = useAiEnabled(workspace);
  // The mobile menu belongs to the page it was opened on, so navigating closes it.
  const [navOpenedOn, setNavOpenedOn] = useState(null);
  const isNavOpen = navOpenedOn === pathname;
  // The dashboard (workspace home) fits the window instead of scrolling.
  const fitsScreen = pathname.replace(/\/$/, '') === `/w/${workspaceId}`;
  // The AI page is a full-height chat with no floating AI button.
  const onAiPage = pathname.replace(/\/$/, '') === `/w/${workspaceId}/ai`;

  useEffect(() => {
    if (workspace) rememberWorkspace(workspace.id);
  }, [workspace]);

  if (isPending) return <LayoutSkeleton />;

  if (isError) {
    // Not ours (e.g. a link kept from another account's session, or a deleted
    // workspace): /app sends the user to one of their own workspaces instead.
    if (error?.status === 404) return <Navigate to="/app" replace />;
    return (
      <FullPageMessage title="We can't load this workspace">
        Something went wrong on our side.{' '}
        <button
          type="button"
          onClick={() => refetch()}
          className="text-ink underline underline-offset-4"
        >
          Try again
        </button>
      </FullPageMessage>
    );
  }

  return (
    <div>
      {/* The app frame fills the whole window, edge to edge. */}
      <div className="bg-surface flex min-h-[100dvh] flex-col sm:min-h-screen sm:p-3 lg:h-screen lg:min-h-0">
        <TopBar workspace={workspace} />

        {/* Phones: edge to edge like a native app. Larger: a rounded panel. */}
        <div className="bg-bg short:gap-3 short:p-3 flex min-h-0 flex-1 gap-4 p-3 sm:rounded-[22px] lg:rounded-[28px] lg:p-4">
          <Sidebar workspace={workspace} isOpen={isNavOpen} onClose={() => setNavOpenedOn(null)} />

          {/* Other pages scroll here. On large screens the dashboard is pinned to
              this panel's height instead, and its widgets scroll inside themselves. */}
          <div
            className={cn(
              'scrollbar-thin min-w-0 flex-1 lg:overflow-y-auto lg:pr-1',
              fitsScreen && 'fit:flex fit:flex-col fit:overflow-hidden',
            )}
          >
            {/* Banners and page share one column, so their edges line up. */}
            <div
              className={cn(
                'w-full sm:px-2',
                fitsScreen && 'fit:flex fit:min-h-0 fit:flex-1 fit:flex-col',
              )}
            >
              <PlanStatusBanner workspace={workspace} />
              <VerifyEmailBanner />
              <main
                className={cn(
                  // Room for the bottom tab bar (and the floating AI button) below lg.
                  onAiPage
                    ? 'pb-[calc(4.25rem+env(safe-area-inset-bottom))]'
                    : 'pb-[calc(8rem+env(safe-area-inset-bottom))]',
                  'pt-2 lg:pb-2',
                  fitsScreen && 'fit:flex fit:min-h-0 fit:flex-1 fit:flex-col',
                )}
              >
                <Outlet context={{ workspace }} />
              </main>
            </div>
          </div>
        </div>
      </div>
      <BottomNav
        workspace={workspace}
        menuOpen={isNavOpen}
        onOpenMenu={() => setNavOpenedOn(isNavOpen ? null : pathname)}
      />
      <AiAssistant key={workspace.id} workspace={workspace} />
      <UploadTray raised={aiEnabled} />
    </div>
  );
}
