import { LayoutDashboard, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { TextAreaField } from '../../components/ui/TextAreaField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { useFileUrl } from '../../features/moodboards/BoardItem.jsx';
import {
  useCreateMoodboard,
  useDeleteMoodboard,
  useMoodboards,
} from '../../features/moodboards/hooks.js';
import { useProjects } from '../../features/projects/hooks.js';
import { canEdit } from '../../features/workspaces/roles.js';
import { cn } from '../../lib/cn.js';
import { formatDate } from '../../lib/dates.js';

function CoverTile({ workspaceId, fileId }) {
  const { url } = useFileUrl(workspaceId, fileId);
  return url ? (
    <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
  ) : (
    <div className="bg-subtle h-full w-full" />
  );
}

// Up to four images in a little grid, like the board itself.
function Cover({ workspaceId, fileIds }) {
  if (fileIds.length === 0) {
    return (
      <div className="widget-lavender grid h-full w-full place-items-center">
        <LayoutDashboard className="text-accent h-8 w-8" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'grid h-full w-full gap-0.5',
        fileIds.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
        fileIds.length > 2 && 'grid-rows-2',
      )}
    >
      {fileIds.map((fileId, index) => (
        <div
          key={fileId}
          className={cn('overflow-hidden', fileIds.length === 3 && index === 0 && 'row-span-2')}
        >
          <CoverTile workspaceId={workspaceId} fileId={fileId} />
        </div>
      ))}
    </div>
  );
}

function NewBoardDialog({ workspace, open, defaultProjectId, onClose }) {
  const create = useCreateMoodboard(workspace.id);
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects(workspace.id, {}, { enabled: open });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');

  function submit(event) {
    event.preventDefault();
    create.mutate(
      {
        title: title.trim() || 'Untitled moodboard',
        description: description.trim() || undefined,
        projectIds: projectId ? [projectId] : [],
      },
      { onSuccess: (board) => navigate(`/w/${workspace.id}/moodboards/${board.id}`) },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New moodboard"
      description="Collect references for a look, a shoot or a brand. Paste images straight onto it."
    >
      <form onSubmit={submit} className="space-y-4">
        {create.error && <Alert tone="error">{create.error.message}</Alert>}
        <TextField
          id="board-title"
          label="Name"
          autoFocus
          maxLength={160}
          placeholder="e.g. Monsoon campaign — look & feel"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextAreaField
          id="board-description"
          label="What is it for? (optional, helps the AI)"
          rows={3}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <SelectField
          id="board-project"
          label="Project"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          placeholder="No project"
          options={projects.map((project) => ({ value: project.id, label: project.title }))}
        />
        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create board
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export function MoodboardsPage() {
  const { workspace } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectFilter = searchParams.get('project') ?? '';
  const {
    data: boards,
    isPending,
    isError,
    error,
  } = useMoodboards(workspace.id, projectFilter ? { projectId: projectFilter } : {});
  const { data: projects = [] } = useProjects(workspace.id);
  const remove = useDeleteMoodboard(workspace.id);
  const [creating, setCreating] = useState(searchParams.get('new') === '1');
  const [deleting, setDeleting] = useState(null);
  const editable = canEdit(workspace);

  return (
    <>
      <PageHeader
        title="Moodboards"
        description="Images, video, colours, notes and sketches on one canvas, then an AI creative brief from it."
        actions={
          editable && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New moodboard
            </Button>
          )
        }
      />

      {projects.length > 0 && (
        <div className="mb-5 max-w-xs">
          <SelectField
            id="board-filter"
            label="Show boards for"
            value={projectFilter}
            onChange={(event) =>
              setSearchParams(event.target.value ? { project: event.target.value } : {})
            }
            placeholder="All projects"
            options={projects.map((project) => ({ value: project.id, label: project.title }))}
          />
        </div>
      )}

      {isError && <Alert tone="error">{error.message}</Alert>}
      {isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-64 rounded-3xl" />
          ))}
        </div>
      )}
      {boards?.length === 0 && (
        <EmptyState
          icon={LayoutDashboard}
          title={projectFilter ? 'No moodboards for this project yet' : 'No moodboards yet'}
          action={
            editable && (
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" /> New moodboard
              </Button>
            )
          }
        >
          Paste references, upload clips, drop in colours and sketch ideas, then let the AI write
          the creative brief.
        </EmptyState>
      )}
      {boards?.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => (
            <li
              key={board.id}
              className="bg-surface border-line/60 shadow-soft group relative overflow-hidden rounded-3xl border"
            >
              <Link to={`/w/${workspace.id}/moodboards/${board.id}`} className="block">
                <div className="h-40 overflow-hidden">
                  <Cover workspaceId={workspace.id} fileIds={board.coverFileIds} />
                </div>
                <div className="space-y-1 p-4">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{board.title}</span>
                    {board.analysed && (
                      <Sparkles
                        className="text-accent h-3.5 w-3.5 shrink-0"
                        aria-label="Has an AI brief"
                      />
                    )}
                  </p>
                  <p className="text-muted truncate text-xs">
                    {board.projects.length
                      ? board.projects.map((project) => project.title).join(', ')
                      : 'No project'}{' '}
                    · {board.counts.items} items
                    {board.counts.sketches ? ` · ${board.counts.sketches} sketch strokes` : ''}
                  </p>
                  <p className="text-muted text-xs">Updated {formatDate(board.updatedAt)}</p>
                </div>
              </Link>
              {editable && (
                <button
                  type="button"
                  onClick={() => setDeleting(board)}
                  aria-label={`Delete ${board.title}`}
                  className="bg-surface/90 text-muted hover:text-danger absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full opacity-0 shadow-sm transition-opacity focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <NewBoardDialog
        key={creating ? 'open' : 'closed'}
        workspace={workspace}
        open={creating}
        defaultProjectId={searchParams.get('project') ?? ''}
        onClose={() => setCreating(false)}
      />
      <Dialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.title ?? ''}"?`}
        description="The board goes. Its images and videos stay in Drive → Moodboards."
      >
        {remove.error && <Alert tone="error">{remove.error.message}</Alert>}
        <DialogActions>
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
          >
            Delete board
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
