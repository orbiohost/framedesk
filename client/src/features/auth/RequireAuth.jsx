import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageMessage } from '../../components/ui/FullPageMessage.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useCurrentUser } from './hooks.js';

export function RequireAuth() {
  const { data: user, isPending, isError } = useCurrentUser();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex min-h-screen">
        <Skeleton className="hidden w-64 rounded-none md:block" />
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-32 w-full max-w-3xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <FullPageMessage title="We can't reach FrameDesk">
        The server isn&apos;t responding. Check your connection and refresh the page.
      </FullPageMessage>
    );
  }

  if (!user) {
    // The query string comes along: the AI connector consent page lives in it.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
