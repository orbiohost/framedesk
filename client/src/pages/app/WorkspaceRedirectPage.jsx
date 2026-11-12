import { Navigate } from 'react-router-dom';
import { FullPageMessage } from '../../components/ui/FullPageMessage.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useWorkspaces } from '../../features/workspaces/hooks.js';
import { pickStartingWorkspace } from '../../features/workspaces/lastWorkspace.js';

// /app: send the user to the workspace they used last, or help them create one.
export function WorkspaceRedirectPage() {
  const { data: workspaces, isPending, isError } = useWorkspaces();

  if (isPending) {
    return (
      <div className="p-10">
        <Skeleton className="h-10 w-72" />
      </div>
    );
  }

  if (isError) {
    return (
      <FullPageMessage title="We can't load your workspaces">
        Refresh the page in a moment. If it keeps happening, contact support.
      </FullPageMessage>
    );
  }

  if (workspaces.length === 0) return <Navigate to="/app/new-workspace" replace />;
  return <Navigate to={`/w/${pickStartingWorkspace(workspaces).id}`} replace />;
}
