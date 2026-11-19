import { Lock, Users } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { cn } from '../../lib/cn.js';
import { readLocal, writeLocal } from '../../lib/storage.js';
import { useSaveQuickNote } from './hooks.js';
import { NoteTextEditor } from './NoteTextEditor.jsx';
import { ProjectPicker } from './ProjectPicker.jsx';

const VISIBILITY_KEY = 'quick-notes:visibility';
const MAX_BODY = 10000;

function rememberedVisibility() {
  return readLocal(VISIBILITY_KEY) === 'workspace' ? 'workspace' : 'private';
}

export function VisibilityToggle({ value, onChange }) {
  const shared = value === 'workspace';
  const Icon = shared ? Users : Lock;
  return (
    <button
      type="button"
      onClick={() => onChange(shared ? 'private' : 'workspace')}
      aria-pressed={shared}
      title={shared ? 'Everyone in this workspace can read it' : 'Only you can see it'}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors',
        shared ? 'bg-lavender text-ink' : 'text-muted hover:bg-subtle hover:text-ink',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {shared ? 'Team' : 'Only me'}
    </button>
  );
}

/**
 * Writes a new note, or edits `note`.
 * collapsible: starts as a single line and opens up on focus (the page's capture box).
 * defaultProjectIds: projects a new note starts linked to.
 */
export function NoteComposer({
  workspaceId,
  note,
  defaultProjectIds = [],
  collapsible = false,
  autoFocus = false,
  onDone,
  onCancel,
}) {
  const save = useSaveQuickNote(workspaceId);
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [projectIds, setProjectIds] = useState(
    note ? note.projects.map((project) => project.id) : defaultProjectIds,
  );
  const [visibility, setVisibility] = useState(note?.visibility ?? rememberedVisibility);
  const [expanded, setExpanded] = useState(!collapsible);
  const [dictationError, setDictationError] = useState(null);

  const isOpen = expanded || body.length > 0 || title.length > 0;
  const canSave = (body.trim().length > 0 || title.trim().length > 0) && body.length <= MAX_BODY;

  function changeVisibility(next) {
    setVisibility(next);
    if (!note) writeLocal(VISIBILITY_KEY, next);
  }

  function reset() {
    setTitle('');
    setBody('');
    setProjectIds(defaultProjectIds);
    setExpanded(!collapsible);
    save.reset();
  }

  function submit(event) {
    event?.preventDefault();
    if (!canSave || save.isPending) return;
    save.mutate(
      { id: note?.id, title: title.trim() || null, body, projectIds, visibility },
      {
        onSuccess: (saved) => {
          if (!note) reset();
          onDone?.(saved);
        },
      },
    );
  }

  function cancel() {
    if (note || !collapsible) onCancel?.();
    else reset();
  }

  // The title field. The editor below handles the same two keys itself.
  function onKeyDown(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit(event);
    if (event.key === 'Escape' && collapsible && !note) {
      event.preventDefault();
      reset();
      event.currentTarget.blur();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-line/70 bg-surface focus-within:border-line rounded-2xl border shadow-sm transition-shadow focus-within:shadow-md"
    >
      {save.error && (
        <Alert tone="error" className="m-3 mb-0">
          {save.error.message}
        </Alert>
      )}
      {dictationError && (
        <Alert tone="error" className="m-3 mb-0">
          {dictationError}
        </Alert>
      )}
      {isOpen && (
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={160}
          placeholder="Title (optional)"
          aria-label="Note title"
          className="placeholder:text-muted/70 w-full rounded-t-2xl bg-transparent px-4 pb-1 pt-3.5 text-[15px] font-semibold outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      )}
      <NoteTextEditor
        value={body}
        onChange={setBody}
        onFocus={() => setExpanded(true)}
        onSubmit={submit}
        onEscape={collapsible && !note ? reset : undefined}
        showToolbar={isOpen}
        workspaceId={workspaceId}
        onDictationError={setDictationError}
        autoFocus={autoFocus}
        placeholder={isOpen ? 'Write your thought… add #tags to group notes' : 'Take a note…'}
        aria-label="Note"
        className={cn(
          'scrollbar-thin cursor-text',
          isOpen ? 'max-h-[50vh] min-h-28 overflow-y-auto py-1.5' : 'py-3.5',
        )}
      />
      {isOpen && (
        <div className="border-line/60 flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
          <ProjectPicker workspaceId={workspaceId} value={projectIds} onChange={setProjectIds} />
          <VisibilityToggle value={visibility} onChange={changeVisibility} />
          <span className="ml-auto flex items-center gap-2">
            <span className="text-muted hidden text-[11px] sm:inline">Ctrl + Enter to save</span>
            {body.length > MAX_BODY * 0.9 && (
              <span
                className={cn(
                  'text-[11px] tabular-nums',
                  body.length > MAX_BODY ? 'text-danger' : 'text-muted',
                )}
              >
                {body.length}/{MAX_BODY}
              </span>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={save.isPending} disabled={!canSave}>
              {note ? 'Save' : 'Add note'}
            </Button>
          </span>
        </div>
      )}
    </form>
  );
}
