import { format, isToday } from 'date-fns';
import { CheckCheck, MessagesSquare, SendHorizontal, Smile, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { insertSpokenText } from '../../lib/insertText.js';
import { useDismiss } from '../../lib/useDismiss.js';
import { useCurrentUser } from '../auth/hooks.js';
import { useDeleteMessage, useMessages, useSendMessage } from '../chat/hooks.js';
import { DictateButton } from '../transcripts/DictateButton.jsx';
import { canAdminister } from '../workspaces/roles.js';
import { Widget } from './Widget.jsx';

const QUICK_EMOJI = ['👍', '👋', '🔥', '🎉', '✅', '🙏', '😄', '👀'];

function stamp(iso) {
  const date = new Date(iso);
  return isToday(date) ? format(date, 'HH:mm') : format(date, 'd MMM, HH:mm');
}

function EmojiPicker({ onPick }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(ref, isOpen, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Add an emoji"
        aria-expanded={isOpen}
        className="text-muted hover:text-ink grid h-8 w-8 place-items-center rounded-full"
      >
        <Smile className="h-4 w-4" aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="border-line/70 bg-surface shadow-lift absolute bottom-full right-0 z-20 mb-2 grid grid-cols-4 gap-1 rounded-2xl border p-2">
          {QUICK_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onPick(emoji);
                close();
              }}
              className="hover:bg-subtle grid h-9 w-9 place-items-center rounded-xl text-lg"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Bubble({ message, mine, canDelete, onDelete }) {
  return (
    <li className={cn('group flex flex-col', mine ? 'items-end' : 'items-start')}>
      <div className={cn('flex max-w-[85%] items-center gap-1.5', mine && 'flex-row-reverse')}>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2 text-sm shadow-sm',
            mine ? 'bg-lavender rounded-tr-md' : 'bg-subtle rounded-tl-md',
          )}
        >
          {!mine && (
            <p className="text-danger mb-0.5 text-xs font-semibold dark:text-pink-300">
              {message.author?.name ?? 'Former member'}
            </p>
          )}
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(message.id)}
            aria-label="Delete message"
            className="text-muted hover:text-danger grid h-7 w-7 place-items-center rounded-full opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      <span className="text-muted mt-1 flex items-center gap-1 px-1 text-[11px] tabular-nums">
        {mine && <CheckCheck className="text-accent h-3.5 w-3.5" aria-hidden="true" />}
        {stamp(message.createdAt)}
      </span>
    </li>
  );
}

export function TeamChat({ workspace, className }) {
  const { data: user } = useCurrentUser();
  const { data: messages, isPending, isError, error } = useMessages(workspace.id);
  const send = useSendMessage(workspace.id);
  const remove = useDeleteMessage(workspace.id);
  const [draft, setDraft] = useState('');
  const [dictationError, setDictationError] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const isAdmin = canAdminister(workspace);
  const lastId = messages?.at(-1)?.id;

  // Keep the newest message in view as messages arrive.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastId]);

  function submit(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body, { onSuccess: () => setDraft('') });
  }

  return (
    <Widget
      icon={MessagesSquare}
      title={`${workspace.name} chat`}
      className={className}
      bodyClassName="flex flex-col fit:overflow-y-hidden"
    >
      <ul
        ref={listRef}
        className="scrollbar-thin fit:h-auto fit:min-h-0 fit:flex-1 -mx-1 flex h-72 flex-col gap-3 overflow-y-auto px-1 pb-2"
        aria-live="polite"
        aria-label="Messages"
      >
        {isPending && (
          <>
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-12 w-1/2 self-end" />
          </>
        )}
        {isError && <li className="text-danger text-sm">{error.message}</li>}
        {messages?.length === 0 && (
          <li className="text-muted m-auto text-center text-sm">
            No messages yet. Say hello to the team 👋
          </li>
        )}
        {messages?.map((message) => {
          const mine = message.author?.id === user?.id;
          return (
            <Bubble
              key={message.id}
              message={message}
              mine={mine}
              canDelete={mine || isAdmin}
              onDelete={(id) => remove.mutate(id)}
            />
          );
        })}
      </ul>

      {send.error && <p className="text-danger mb-2 text-xs">{send.error.message}</p>}
      {dictationError && <p className="text-danger mb-2 text-xs">{dictationError}</p>}

      <form
        onSubmit={submit}
        className="bg-subtle mt-2 flex items-center gap-1.5 rounded-full py-1 pl-4 pr-1"
      >
        <label htmlFor="chat-draft" className="sr-only">
          Message
        </label>
        <input
          id="chat-draft"
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          placeholder="Message here..."
          autoComplete="off"
          className="placeholder:text-muted min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
        />
        <EmojiPicker
          onPick={(emoji) => {
            setDraft((text) => text + emoji);
            inputRef.current?.focus();
          }}
        />
        <DictateButton
          workspaceId={workspace.id}
          variant="icon"
          label="Speak your message"
          onError={setDictationError}
          onText={(text) => insertSpokenText(inputRef.current, text)}
          className="h-10 min-w-10"
        />
        <button
          type="submit"
          disabled={!draft.trim() || send.isPending}
          aria-label="Send message"
          className="pill-active grid h-10 w-10 shrink-0 place-items-center rounded-full transition-opacity disabled:opacity-40"
        >
          <SendHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </Widget>
  );
}
