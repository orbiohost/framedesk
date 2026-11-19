import { PictureInPicture2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { cn } from '../../lib/cn.js';
import { useQuickNotes, useSaveQuickNote } from './hooks.js';
import { VisibilityToggle } from './NoteComposer.jsx';
import { NoteMarkdown } from './NoteMarkdown.jsx';
import { NoteTextEditor } from './NoteTextEditor.jsx';
import { ProjectPicker } from './ProjectPicker.jsx';
import { MAX_PINNED, usePinnedNotes } from './pinnedNotes.js';
import { useNoteDraft } from './useNoteDraft.js';

function saveLabel({ status, dirty }) {
  if (status === 'error') return 'Couldn’t save';
  if (status === 'saving' || dirty) return 'Saving…';
  if (status === 'saved') return 'Saved';
  return 'Saves as you type';
}

function WindowBody({ workspaceId, note, onClose }) {
  const draft = useNoteDraft(workspaceId, note);
  const save = useSaveQuickNote(workspaceId);
  const screen = usePinnedNotes(workspaceId);
  const [visibility, setVisibility] = useState(note.visibility);
  const [projectIds, setProjectIds] = useState(() => note.projects.map((project) => project.id));
  const [dictationError, setDictationError] = useState(null);
  const onScreen = screen.isPinned(note.id);

  function changeProjects(next) {
    setProjectIds(next);
    save.mutate({ id: note.id, projectIds: next });
  }

  function changeVisibility(next) {
    setVisibility(next);
    save.mutate({ id: note.id, visibility: next });
  }

  if (!note.isMine) {
    return (
      <div className="space-y-3">
        {note.title && <p className="text-xl font-semibold tracking-tight">{note.title}</p>}
        <NoteMarkdown text={note.body} className="text-[15px]" />
        <p className="text-muted text-xs">
          By {note.author?.name ?? 'a teammate'}. Only they can edit it.
        </p>
      </div>
    );
  }

  return (
    <div className="-mx-6 -mb-5">
      <input
        value={draft.draft.title}
        onChange={(event) => draft.change('title', event.target.value)}
        maxLength={160}
        placeholder="Title"
        aria-label="Note title"
        className="placeholder:text-muted/60 w-full bg-transparent px-6 pb-2 text-xl font-semibold tracking-tight outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <div className="border-line/70 border-y pt-1.5">
        <NoteTextEditor
          value={draft.draft.body}
          onChange={(body) => draft.change('body', body)}
          onSubmit={async () => {
            await draft.flush();
            onClose();
          }}
          workspaceId={workspaceId}
          onDictationError={setDictationError}
          autoFocus
          placeholder="Write… #tags group notes, [ ] makes a to-do"
          aria-label="Note"
          className="scrollbar-thin max-h-[60dvh] min-h-[45dvh] overflow-y-auto !px-6 py-3 [&_.tiptap]:text-base"
        />
      </div>
      {(dictationError || draft.error) && (
        <p className="text-danger px-6 pt-2 text-xs">{dictationError || draft.error}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <ProjectPicker workspaceId={workspaceId} value={projectIds} onChange={changeProjects} />
        <VisibilityToggle value={visibility} onChange={changeVisibility} />
        <button
          type="button"
          onClick={() => (onScreen ? screen.unpin(note.id) : screen.pin(note.id))}
          disabled={!onScreen && screen.full}
          title={!onScreen && screen.full ? `Up to ${MAX_PINNED} on screen` : undefined}
          aria-pressed={onScreen}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors disabled:opacity-40',
            onScreen ? 'bg-ink text-surface' : 'text-muted hover:bg-subtle hover:text-ink',
          )}
        >
          <PictureInPicture2 className="h-3.5 w-3.5" aria-hidden="true" />
          {onScreen ? 'On screen' : 'Pin to screen'}
        </button>
        <span className="text-muted ml-auto text-xs">{saveLabel(draft)}</span>
        <Link
          to={`/w/${workspaceId}/notes`}
          onClick={onClose}
          className="text-muted hover:text-ink text-xs underline-offset-4 hover:underline"
        >
          All notes
        </Link>
        <button
          type="button"
          onClick={async () => {
            await draft.flush();
            onClose();
          }}
          className="bg-ink text-surface hover:bg-ink/90 h-8 rounded-lg px-3.5 text-xs font-medium"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// A note opened big: the full editor in a window over the page (from a
// sticky note or the header's Notes panel). noteId null: closed.
// note: the note itself when the caller has it (a card); the live copy from
// the notes list is used when there is one.
export function NoteWindow({ workspaceId, noteId, note: given = null, onClose }) {
  const notes = useQuickNotes(workspaceId, {}, { enabled: Boolean(noteId) && !given });
  const live = noteId ? (notes.data ?? []).find((entry) => entry.id === noteId) : null;
  const note = noteId ? (live ?? (given?.id === noteId ? given : null)) : null;
  return (
    <Dialog
      open={Boolean(noteId)}
      onClose={onClose}
      title={note?.isMine === false ? 'Shared note' : 'Note'}
      wide="lg"
    >
      {note ? (
        <WindowBody key={note.id} workspaceId={workspaceId} note={note} onClose={onClose} />
      ) : notes.isPending ? (
        <div className="bg-subtle h-40 animate-pulse rounded-xl" aria-hidden="true" />
      ) : (
        <p className="text-muted text-sm">This note isn’t available any more.</p>
      )}
    </Dialog>
  );
}
