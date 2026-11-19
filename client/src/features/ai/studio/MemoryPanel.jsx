import { Brain, Check, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { Switch } from '../../../components/ui/Switch.jsx';
import { cn } from '../../../lib/cn.js';
import { ConfirmDialog } from '../../files/FileDialogs.jsx';
import {
  useAddMemory,
  useAiMemory,
  useClearMemory,
  useDeleteMemory,
  useMemoryPreferences,
  useUpdateMemory,
} from '../studioHooks.js';

const MAX_LENGTH = 300;

function MemoryRow({ workspaceId, memory, agentName }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(memory.text);
  const update = useUpdateMemory(workspaceId);
  const remove = useDeleteMemory(workspaceId);

  function saveEdit() {
    const next = text.trim();
    if (next.length < 2 || next === memory.text) {
      setEditing(false);
      setText(memory.text);
      return;
    }
    update.mutate({ id: memory.id, text: next }, { onSuccess: () => setEditing(false) });
  }

  return (
    <li
      className={cn(
        'group flex items-start gap-3 px-4 py-3 transition-opacity',
        remove.isPending && 'opacity-40',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full',
          memory.source === 'auto'
            ? 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-400/15 dark:text-fuchsia-200'
            : 'bg-subtle text-muted',
        )}
        title={memory.source === 'auto' ? 'Learnt from a chat' : 'Added by you'}
      >
        {memory.source === 'auto' ? (
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Brain className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            value={text}
            maxLength={MAX_LENGTH}
            autoFocus
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveEdit();
              if (event.key === 'Escape') {
                setEditing(false);
                setText(memory.text);
              }
            }}
            aria-label="Edit memory"
            className="border-line bg-surface focus:border-accent/60 h-9 w-full rounded-lg border px-2.5 text-sm outline-none"
          />
        ) : (
          <p className="text-sm">{memory.text}</p>
        )}
        <p className="text-muted mt-0.5 text-[11px]">
          {memory.source === 'auto' ? 'Learnt from a chat' : 'Added by you'}
          {agentName ? ` · only ${agentName}` : ''} ·{' '}
          {new Date(memory.updatedAt).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        {editing ? (
          <>
            <Button size="icon" variant="ghost" aria-label="Save" onClick={saveEdit}>
              <Check className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Cancel"
              onClick={() => {
                setEditing(false);
                setText(memory.text);
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </>
        ) : (
          <>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Edit memory"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Forget this"
              onClick={() => remove.mutate(memory.id)}
              className="hover:!text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

// What the assistant remembers about you, and the switches for it.
export function MemoryPanel({ workspaceId, agents = [] }) {
  const memory = useAiMemory(workspaceId);
  const prefs = useMemoryPreferences(workspaceId);
  const add = useAddMemory(workspaceId);
  const clear = useClearMemory(workspaceId);
  const [draft, setDraft] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));

  if (memory.isPending) return <Skeleton className="h-64 w-full rounded-3xl" />;
  if (memory.isError) return <Alert tone="error">{memory.error.message}</Alert>;
  const { memories, preferences } = memory.data;

  function submit(event) {
    event.preventDefault();
    const text = draft.trim();
    if (text.length < 2) return;
    add.mutate({ text }, { onSuccess: () => setDraft('') });
  }

  return (
    <div className="space-y-4">
      <div className="border-line/70 bg-surface shadow-soft space-y-3 rounded-3xl border p-4 sm:p-5">
        <Switch
          checked={preferences.memoryEnabled}
          onChange={(value) => prefs.mutate({ memoryEnabled: value })}
          label="Memory"
          description="the assistant starts every chat knowing these things"
        />
        <div className={cn(!preferences.memoryEnabled && 'pointer-events-none opacity-50')}>
          <Switch
            checked={preferences.autoMemory}
            onChange={(value) => prefs.mutate({ autoMemory: value })}
            label="Learn from my chats"
            description="saves useful facts you mention (uses a little AI usage)"
          />
        </div>
        <p className="text-muted text-xs">
          Memories are private to you. Say “remember that…” or “forget…” in any chat, or manage them
          here.
        </p>
      </div>

      <div className="border-line/70 bg-surface shadow-soft overflow-hidden rounded-3xl border">
        <form onSubmit={submit} className="border-line/60 flex gap-2 border-b p-3">
          <input
            value={draft}
            maxLength={MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add something to remember, e.g. “I run a wedding films studio in Jaipur”"
            aria-label="New memory"
            className="border-line bg-subtle/60 focus:border-accent/60 focus:ring-accent/15 h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none focus:ring-4"
          />
          <Button type="submit" loading={add.isPending} disabled={draft.trim().length < 2}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Remember</span>
          </Button>
        </form>
        {add.error && (
          <Alert tone="error" className="m-3">
            {add.error.message}
          </Alert>
        )}
        {memories.length === 0 ? (
          <EmptyState icon={Brain} title="Nothing remembered yet" className="py-10">
            Tell the assistant about yourself in a chat, or add a memory above.
          </EmptyState>
        ) : (
          <>
            <ul className="divide-line/60 divide-y">
              {memories.map((item) => (
                <MemoryRow
                  key={item.id}
                  workspaceId={workspaceId}
                  memory={item}
                  agentName={item.agentId ? (agentNames.get(item.agentId) ?? 'an assistant') : null}
                />
              ))}
            </ul>
            <div className="border-line/60 text-muted flex items-center justify-between border-t px-4 py-2.5 text-xs">
              <span>
                {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
              </span>
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="hover:text-danger font-medium transition-colors"
              >
                Forget everything
              </button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Forget everything?"
        confirmLabel="Forget all"
        pending={clear.isPending}
        error={clear.error?.message}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => clear.mutate({}, { onSuccess: () => setConfirmClear(false) })}
      >
        All {memories.length} memories will be deleted. This can’t be undone.
      </ConfirmDialog>
    </div>
  );
}
