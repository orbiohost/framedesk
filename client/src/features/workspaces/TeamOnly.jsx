import { Outlet, useOutletContext } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { canView } from './roles.js';

// Wraps team-only pages (projects, clients, tasks, calendar). Client-role members
// will work through review links instead (Phase 4).
export function TeamOnly() {
  const context = useOutletContext();
  if (!canView(context.workspace)) {
    return (
      <EmptyState title="This area is for the studio team">
        You&apos;re a client in this workspace. Review links the team shares with you will open
        directly.
      </EmptyState>
    );
  }
  return <Outlet context={context} />;
}
