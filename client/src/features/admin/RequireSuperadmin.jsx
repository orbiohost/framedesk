import { Outlet } from 'react-router-dom';
import { useCurrentUser } from '../auth/hooks.js';
import { NotFoundPage } from '../../pages/NotFoundPage.jsx';

// The server refuses admin calls anyway; this just keeps the screen hidden.
export function RequireSuperadmin() {
  const { data: user } = useCurrentUser();
  return user?.isSuperadmin ? <Outlet /> : <NotFoundPage />;
}
