import { Check, LayoutGrid, Loader2, Lock, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { cn } from '../../lib/cn.js';
import { useMoodboards, useSendToMoodboard } from '../moodboards/hooks.js';
import { ProjectPicker } from '../quickNotes/ProjectPicker.jsx';
import { useSaveQuickNote } from '../quickNotes/hooks.js';

// Text picked in an AI answer (or a whole answer), sent to Notes or a moodboard.

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Only me', icon: Lock },
  { value: 'workspace', label: 'Team', icon: Users },
];
const NOTE_MAX = 10_000;
const BOARD_NOTE_MAX = 4_000;

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function titleFrom(text) {
  const line = (text ?? '').split('\n').find((part) => part.trim()) ?? '';
  return clip(line.replace(/^[#>*\-\s]+/, '').trim(), 80);
}

function Preview({ text }) {
  return (
    <blockquote className="bg-subtle text-ink/80 border-line max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border-l-4 px-3 py-2 text-sm">
      {text}
    </blockquote>
  );
}

// "Add to notes": a new quick note holding the text.
export function SaveTextNoteDialog({ workspaceId, text, projectId = null, onClose }) {
  const [title, setTitle] = useState(() => titleFrom(text));
  const [projectIds, setProjectIds] = useState(projectId ? [projectId] : []);
  const [visibility, setVisibility] = useState('private');
  const save = useSaveQuickNote(workspaceId);
  const navigate = useNavigate();
  const body = clip(text, NOTE_MAX);

  function submit(event) {
    event.preventDefault();
    save.mutate({ title: title.trim() || undefined, body, projectIds, visibility });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={save.isSuccess ? 'Added to notes' : 'Add to notes'}
      description={
        save.isSuccess
          ? undefined
          : 'Saved as a quick note. Add it to a later question with #.'
      }
    >
      {save.isSuccess ? (
        <div className="space-y-4">
          <p className="text-muted flex items-center gap-2 text-sm">
            <Check className="text-success h-4 w-4" aria-hidden="true" />
            The note is in Quick notes.
          </p>
          <DialogActions>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/w/${workspaceId}/notes?note=${save.data.id}`);
              }}
            >
              Open note
            </Button>
          </DialogActions>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {save.error && <Alert tone="error">{save.error.message}</Alert>}
          <Preview text={body} />
          <TextField
            id="ai-text-note-title"
            label="Title"
            value={title}
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Projects</p>
            <ProjectPicker workspaceId={workspaceId} value={projectIds} onChange={setProjectIds} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Who can read it</p>
            <SegmentedControl
              label="Who can read it"
              options={VISIBILITY_OPTIONS}
              value={visibility}
              onChange={setVisibility}
            />
          </div>
          <DialogActions>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Add note
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}

// "Send to moodboard": the text becomes a sticky note on the board picked.
export function SendToMoodboardDialog({ workspaceId, text, onClose }) {
  const boards = useMoodboards(workspaceId);
  const send = useSendToMoodboard(workspaceId);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const body = clip(text, BOARD_NOTE_MAX);
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (boards.data ?? []).filter((board) => board.title.toLowerCase().includes(needle));
  }, [boards.data, query]);

  function pick(board) {
    send.mutate({ boardId: board.id, text: body }, { onSuccess: () => setSentTo(board) });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={sentTo ? 'Added to moodboard' : 'Send to moodboard'}
      description={sentTo ? undefined : 'It is added to the board as a sticky note.'}
    >
      {sentTo ? (
        <div className="space-y-4">
          <p className="text-muted flex items-center gap-2 text-sm">
            <Check className="text-success h-4 w-4" aria-hidden="true" />
            Added a note to “{sentTo.title}”.
          </p>
          <DialogActions>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/w/${workspaceId}/moodboards/${sentTo.id}`);
              }}
            >
              Open board
            </Button>
          </DialogActions>
        </div>
      ) : (
        <div className="space-y-4">
          {send.error && <Alert tone="error">{send.error.message}</Alert>}
          <Preview text={body} />
          <TextField
            id="ai-send-board-search"
            label="Moodboard"
            placeholder="Search boards"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
          <div className="border-line/60 max-h-64 overflow-y-auto rounded-xl border">
            {boards.isPending ? (
              <Loader2 className="text-muted mx-auto my-6 h-5 w-5 animate-spin" aria-hidden="true" />
            ) : boards.isError ? (
              <p className="text-danger p-3 text-sm">{boards.error.message}</p>
            ) : list.length === 0 ? (
              <p className="text-muted p-3 text-sm">
                {boards.data?.length ? 'No boards match' : 'No moodboards yet. Create one first.'}
              </p>
            ) : (
              list.map((board) => (
                <button
                  key={board.id}
                  type="button"
                  disabled={send.isPending}
                  onClick={() => pick(board)}
                  className={cn(
                    'hover:bg-subtle flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-60',
                  )}
                >
                  <LayoutGrid className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{board.title}</span>
                  {send.isPending && send.variables?.boardId === board.id ? (
                    <Loader2 className="text-muted h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <span className="text-muted shrink-0 text-xs">
                      {board.counts?.items ?? 0} items
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
          <DialogActions>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </DialogActions>
        </div>
      )}
    </Dialog>
  );
}
