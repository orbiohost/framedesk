import { format, isToday } from 'date-fns';
import { ArrowRight, NotebookPen, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { readLocal, writeLocal } from '../../lib/storage.js';
import { useMyNote, useSaveNote } from '../notes/hooks.js';
import { useQuickNotes } from '../quickNotes/hooks.js';
import { NoteCard } from '../quickNotes/NoteCard.jsx';
import { QuickNoteDialog } from '../quickNotes/QuickNoteButton.jsx';
import { DictateButton } from '../transcripts/DictateButton.jsx';

const SAVE_DELAY_MS = 800;
const MAX_NOTE_CHARS = 5000;
const NOTES_SHOWN = 6;
const TAB_KEY = 'dashboard:notes-tab';
const TABS = [
  { value: 'notes', label: 'Notes' },
  { value: 'scratch', label: 'Scratchpad' },
];

function savedLabel(iso) {
  if (!iso) return 'Only you can see this';
  const date = new Date(iso);
  return `Saved ${isToday(date) ? `today, ${format(date, 'HH:mm')}` : format(date, 'd MMM')}`;
}

// The private scratchpad: one free-form page, saved as you type.
function ScratchpadEditor({ workspaceId, note }) {
  const [text, setText] = useState(note.body);
  const [sentText, setSentText] = useState(note.body);
  const [dictationError, setDictationError] = useState(null);
  const save = useSaveNote(workspaceId);
  const { mutate } = save;

  // Save shortly after typing stops.
  useEffect(() => {
    if (text === sentText) return undefined;
    const timer = setTimeout(() => {
      setSentText(text);
      mutate(text);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, sentText, mutate]);

  const dirty = text !== sentText;
  let status = savedLabel(note.updatedAt);
  if (dictationError) status = dictationError;
  if (save.isError) status = `Not saved: ${save.error.message}`;
  else if (dirty || save.isPending) status = 'Saving…';

  return (
    <>
      <label htmlFor="quick-note" className="sr-only">
        Scratchpad
      </label>
      <textarea
        id="quick-note"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_NOTE_CHARS}
        rows={4}
        placeholder="Jot something down… e.g. Revamp sidebar before Friday 🔥"
        className="placeholder:text-ink/45 scrollbar-thin mt-3 min-h-12 w-full flex-1 resize-none bg-transparent text-sm font-medium leading-6 outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        <p
          className={cn(
            'min-w-0 truncate text-xs',
            save.isError || dictationError ? 'text-danger' : 'text-ink/60',
          )}
          title={status}
        >
          {status}
        </p>
        <DictateButton
          workspaceId={workspaceId}
          onError={setDictationError}
          // Spoken text goes on a new line at the end, and the autosave picks it up.
          onText={(spoken) =>
            setText((current) =>
              (current.trim() ? `${current.trimEnd()}\n${spoken}` : spoken).slice(
                0,
                MAX_NOTE_CHARS,
              ),
            )
          }
        />
      </div>
    </>
  );
}

function Scratchpad({ workspaceId }) {
  const { data: note, isPending } = useMyNote(workspaceId);
  if (isPending) return <Skeleton className="bg-surface/40 mt-3 h-24" />;
  return <ScratchpadEditor workspaceId={workspaceId} note={note} />;
}

// The newest quick notes (pinned first), with tickable to-dos.
function RecentNotes({ workspaceId, onAdd }) {
  const { data: notes, isPending, isError, error } = useQuickNotes(workspaceId);

  if (isPending) return <Skeleton className="bg-surface/40 mt-3 h-24" />;
  if (isError) return <p className="text-danger mt-3 text-sm">{error.message}</p>;
  if (notes.length === 0) {
    return (
      <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-3 py-4 text-center">
        <p className="text-ink/70 text-sm">Ideas, to-do lists, things to remember.</p>
        <button
          type="button"
          onClick={onAdd}
          className="bg-surface/80 hover:bg-surface inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium shadow-sm"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add your first note
        </button>
      </div>
    );
  }

  return (
    <>
      <ul className="scrollbar-thin fit:min-h-0 fit:overflow-y-auto -mx-1 mt-3 flex-1 space-y-2.5 px-1 pb-1">
        {notes.slice(0, NOTES_SHOWN).map((note) => (
          <li key={note.id}>
            <NoteCard workspaceId={workspaceId} note={note} compact />
          </li>
        ))}
      </ul>
      <Link
        to={`/w/${workspaceId}/notes`}
        className="text-ink/70 hover:text-ink mt-2 inline-flex items-center gap-1 self-start text-xs font-medium"
      >
        {notes.length > NOTES_SHOWN ? `All ${notes.length} notes` : 'Open quick notes'}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </>
  );
}

// Quick notes (with to-dos) plus the private scratchpad, on one dashboard tile.
export function QuickNote({ workspaceId, className }) {
  const [tab, setTab] = useState(() => (readLocal(TAB_KEY) === 'scratch' ? 'scratch' : 'notes'));
  const [isAdding, setIsAdding] = useState(false);

  function changeTab(next) {
    setTab(next);
    writeLocal(TAB_KEY, next);
  }

  return (
    <section
      className={cn(
        'widget-pink shadow-soft fit:min-h-0 relative flex min-h-48 flex-col overflow-hidden rounded-[28px] p-5',
        className,
      )}
    >
      <header className="flex items-center gap-2">
        <span className="bg-surface/60 grid h-10 w-10 shrink-0 place-items-center rounded-full backdrop-blur">
          <NotebookPen className="h-5 w-5" aria-hidden="true" />
        </span>
        <div
          role="tablist"
          aria-label="Notes"
          className="bg-surface/50 flex min-w-0 rounded-full p-0.5"
        >
          {TABS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={tab === option.value}
              onClick={() => changeTab(option.value)}
              className={cn(
                'truncate rounded-full px-3 py-1 text-xs font-medium transition-colors',
                tab === option.value
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink/60 hover:text-ink',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {tab === 'notes' && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            aria-label="Add a quick note"
            title="Add a quick note (Alt + N)"
            className="bg-surface/80 hover:bg-surface ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full shadow-sm"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </header>

      {tab === 'notes' ? (
        <RecentNotes workspaceId={workspaceId} onAdd={() => setIsAdding(true)} />
      ) : (
        <Scratchpad workspaceId={workspaceId} />
      )}

      <QuickNoteDialog
        workspaceId={workspaceId}
        open={isAdding}
        onClose={() => setIsAdding(false)}
      />
    </section>
  );
}
