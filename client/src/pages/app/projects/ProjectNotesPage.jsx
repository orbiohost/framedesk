import { NotebookPen } from 'lucide-react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Alert } from '../../../components/ui/Alert.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { useQuickNotes } from '../../../features/quickNotes/hooks.js';
import { NoteComposer } from '../../../features/quickNotes/NoteComposer.jsx';
import { NoteList } from '../../../features/quickNotes/NoteList.jsx';

// The project's Notes tab: your notes and the team's shared notes linked to it.
export function ProjectNotesPage() {
  const { workspace, project } = useOutletContext();
  const navigate = useNavigate();
  const {
    data: notes,
    isPending,
    isError,
    error,
  } = useQuickNotes(workspace.id, {
    projectId: project.id,
  });

  function filterByTag(tag) {
    navigate(`/w/${workspace.id}/notes?project=${project.id}&tag=${encodeURIComponent(tag)}`);
  }

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <NoteComposer workspaceId={workspace.id} defaultProjectIds={[project.id]} collapsible />
      </div>

      {isError && <Alert tone="error">{error.message}</Alert>}
      {isPending && <Skeleton className="h-40 w-full" />}

      {notes?.length === 0 && (
        <EmptyState icon={NotebookPen} title="No notes for this project yet">
          Ideas, references and things to try for {project.title}. Write one above.
        </EmptyState>
      )}

      {notes?.length > 0 && (
        <>
          <NoteList
            notes={notes}
            workspaceId={workspace.id}
            onTagClick={filterByTag}
            hideProjectId={project.id}
          />
          <Link
            to={`/w/${workspace.id}/notes?project=${project.id}`}
            className="text-muted hover:text-ink inline-block text-sm underline underline-offset-4"
          >
            Open in Quick notes
          </Link>
        </>
      )}
    </div>
  );
}
