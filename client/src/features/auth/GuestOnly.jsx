import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser } from './hooks.js';

// Auth pages: signed-in users are sent on to the app (or where they were headed).
export function GuestOnly() {
  const { data: user, isPending } = useCurrentUser();
  const location = useLocation();

  if (isPending) return null;
  if (user) return <Navigate to={location.state?.from ?? '/app'} replace />;
  return <Outlet />;
}
