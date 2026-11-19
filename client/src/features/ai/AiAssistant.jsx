import { useQueryClient } from '@tanstack/react-query';
import {
  BookmarkCheck,
  BookmarkPlus,
  Check,
  Copy,
  FileSearch,
  FileText,
  Film,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  MessageSquarePlus,
  NotebookPen,
  Maximize2,
  PanelLeftClose,
  RotateCcw,
  Sparkles,
  SquarePen,
  Wand2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { invalidateFeatures } from '../../lib/workspaceKeys.js';
import { readLocal, removeLocal, writeLocal } from '../../lib/storage.js';
import { useCurrentUser } from '../auth/hooks.js';
import { PreviewDialog } from '../files/FileDialogs.jsx';
import { useUploads } from '../files/hooks.js';
import { addUploads } from '../files/uploadStore.js';
import { canAdminister, canEdit, canView } from '../workspaces/roles.js';
import { onAiRequest, setAiAvailable, takeAiRequest } from './aiBridge.js';
import {
  AiComposer,
  FileChip,
  IMAGE_STYLE_OPTIONS,
  MAX_ATTACHMENTS,
  MAX_NOTES,
  MAX_SKILLS,
  NoteChip,
  QuoteBlock,
  ScopeChip,
  WHOLE_DRIVE,
  SkillChip,
  categoryOf,
} from './AiComposer.jsx';
import { AgentBadge } from './AgentBadge.jsx';
import { AiImageResult, ImagePending } from './AiImageResult.jsx';
import { AgentPicker } from './AgentPicker.jsx';
import { ModelPicker, pickModel, readModelChoice, writeModelChoice } from './ModelPicker.jsx';
import { useAiAgents } from './studioHooks.js';
import { SaveAnswerDialog } from './SaveAnswerDialog.jsx';
import { SelectionMenu } from './SelectionMenu.jsx';
import { SaveTextNoteDialog, SendToMoodboardDialog } from './SendTextDialogs.jsx';
import { AiHistory } from './AiHistory.jsx';
import { AiMessageText, toPlainText } from './AiMessageText.jsx';
import { LimitReached, UsageButton } from './AiUsage.jsx';
import { AiResetButton } from './AiUsageDialog.jsx';
import { AI_GRADIENT, AI_TEXT } from './aiStyle.js';
import {
  aiKey,
  askAiStream,
  createAiImage,
  fetchAiUploadFolder,
  useAiStatus,
  useAiThread,
  useAiThreads,
  useDeleteThread,
  useRenameThread,
} from './hooks.js';

export { AI_GRADIENT };

const SUGGESTIONS = [
  { icon: Film, text: 'What did we upload this week?' },
  { icon: FileSearch, text: 'Find clips with people talking to the camera' },
  { icon: FileText, text: 'Summarise the documents in my Drive' },
  { icon: Wand2, text: 'Which videos mention a deadline or a price?' },
];

// When a project is picked or files are attached, the starters are about them.
const PROJECT_SUGGESTIONS = [
  { icon: FileSearch, text: 'Summarise this project’s files' },
  { icon: Film, text: 'Which clips are ready to use?' },
  { icon: Wand2, text: 'What feedback or changes were asked for?' },
  { icon: FileText, text: 'List anything with a deadline or a price' },
];
const FILE_SUGGESTIONS = [
  { icon: FileText, text: 'Summarise this' },
  { icon: Film, text: 'List the key moments with timestamps' },
  { icon: Wand2, text: 'Suggest a title, caption and tags' },
  { icon: FileSearch, text: 'Is anything wrong or missing?' },
];

// The chat each workspace was last on, so the corner panel and the AI page agree.
const threadStorageKey = (workspaceId) => `ai:thread:${workspaceId}`;
// The assistant new chats start with.
const agentStorageKey = (workspaceId) => `ai:agent:${workspaceId}`;

// The assistant's round avatar. `busy` adds a turning gradient ring.
function AiAvatar({ busy = false, size = 'md' }) {
  const box = size === 'lg' ? 'h-14 w-14' : 'h-7 w-7';
  const icon = size === 'lg' ? 'h-6 w-6' : 'h-3.5 w-3.5';
  return (
    <span className={cn('relative grid shrink-0 place-items-center rounded-full', box)}>
      {busy && <span className="ai-orbit absolute -inset-[3px] rounded-full" aria-hidden="true" />}
      <span
        className={cn(
          AI_GRADIENT,
          'relative grid h-full w-full place-items-center rounded-full text-white',
          busy && 'ring-surface ring-2',
        )}
      >
        <Sparkles className={icon} aria-hidden="true" />
      </span>
    </span>
  );
}

function libraryLine(library) {
  if (!library || library.total === 0) {
    return 'Upload videos, audio, images or documents and I’ll study them for you.';
  }
  if (library.waiting > 0) return `I’m studying ${library.waiting} of your files right now.`;
  return `You have ${library.total} files; I read the ones you ask about.`;
}

function AgentWelcome({ agent, onPick, compact }) {
  const starters = agent.starters?.length
    ? agent.starters
    : ['What can you help me with?', 'Show me what you know'];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
      <div className="relative animate-[ai-float_4s_ease-in-out_infinite]">
        <AgentBadge agent={agent} size="xl" className="shadow-lg" />
      </div>
      <div className="max-w-md px-2">
        <p className="text-xl font-semibold tracking-tight">{agent.name}</p>
        <p className="text-muted mt-1.5 text-sm">
          {agent.description || 'Your custom assistant. Ask it anything.'}
        </p>
        {agent.createdBy && agent.visibility === 'workspace' && (
          <p className="text-muted/80 mt-1 text-xs">Made by {agent.createdBy.name}</p>
        )}
      </div>
      <div className={cn('grid w-full gap-2', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
        {starters.map((text, index) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            style={{ animationDelay: `${index * 60}ms` }}
            className="border-line/70 hover:border-accent/40 hover:bg-subtle/60 flex animate-[ai-rise_320ms_ease-out_both] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left text-sm transition-colors"
          >
            <Wand2 className="text-accent h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-ink/85">{text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Welcome({ status, onPick, compact, scope, attachments, agent }) {
  const { data: user } = useCurrentUser();
  const name = user?.name?.split(' ')[0];
  if (agent && !scope && !attachments.length) {
    return <AgentWelcome agent={agent} onPick={onPick} compact={compact} />;
  }
  const suggestions = attachments.length
    ? FILE_SUGGESTIONS
    : scope
      ? PROJECT_SUGGESTIONS
      : SUGGESTIONS;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
      <div className="relative animate-[ai-float_4s_ease-in-out_infinite]">
        <span
          className={cn(AI_GRADIENT, 'absolute inset-0 rounded-full opacity-40 blur-xl')}
          aria-hidden="true"
        />
        <AiAvatar size="lg" />
      </div>
      <div className="max-w-md px-2">
        <p className="text-xl font-semibold tracking-tight">
          {name ? (
            <>
              Hi <span className={AI_TEXT}>{name}</span>, what are we looking for?
            </>
          ) : (
            'What are we looking for?'
          )}
        </p>
        <p className="text-muted mt-1.5 text-sm">
          {attachments.length ? (
            `Ask anything about the ${attachments.length === 1 ? 'attached file' : 'attached files'}.`
          ) : scope ? (
            `Questions now use only the files in ${scope.title}.`
          ) : (
            <>
              {libraryLine(status.library)} Type <Kbd>/</Kbd> for a project, <Kbd>@</Kbd> for a
              file, <Kbd>#</Kbd> for a saved note or <Kbd>!</Kbd> for a skill.
            </>
          )}
        </p>
      </div>
      <div className={cn('grid w-full gap-2', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
        {suggestions.map(({ icon: Icon, text }, index) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            style={{ animationDelay: `${index * 60}ms` }}
            className="border-line/70 hover:border-accent/40 hover:bg-subtle/60 group flex animate-[ai-rise_320ms_ease-out_both] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left text-sm transition-colors"
          >
            <span className="bg-lavender text-accent dark:text-ink grid h-8 w-8 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-110">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-ink/85">{text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="border-line bg-subtle rounded-md border px-1.5 py-0.5 font-mono text-xs">
      {children}
    </kbd>
  );
}

function UserMessage({ message: raw }) {
  // A question asked with "//" shows the Whole Drive chip.
  const message = raw.wholeDrive && !raw.project ? { ...raw, project: WHOLE_DRIVE } : raw;
  return (
    <div className="flex animate-[ai-rise_220ms_ease-out_both] flex-col items-end gap-1.5">
      {message.quote && <QuoteBlock text={message.quote} className="max-w-[88%]" />}
      {(message.kind === 'image' ||
        message.project ||
        message.attachments?.length > 0 ||
        message.notes?.length > 0 ||
        message.skills?.length > 0) && (
        <div className="flex max-w-[88%] flex-wrap justify-end gap-1.5">
          {message.kind === 'image' && (
            <span
              className={cn(
                AI_GRADIENT,
                'inline-flex items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-xs font-medium text-white',
              )}
            >
              <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Image
              {message.imageOptions?.aspectRatio && ` · ${message.imageOptions.aspectRatio}`}
              {message.imageOptions?.style && message.imageOptions.style !== 'none'
                ? ` · ${IMAGE_STYLE_OPTIONS.find((option) => option.value === message.imageOptions.style)?.label ?? ''}`
                : ''}
            </span>
          )}
          {message.project && <ScopeChip project={message.project} />}
          {message.skills?.map((skill) => (
            <SkillChip key={skill.id} skill={skill} />
          ))}
          {message.notes?.map((note) => (
            <NoteChip key={note.id} note={note} />
          ))}
          {message.attachments?.map((file) => (
            <FileChip key={file.id} file={file} />
          ))}
        </div>
      )}
      <p className="pill-active max-w-[88%] whitespace-pre-wrap break-words rounded-[20px] rounded-br-md px-4 py-2.5 text-sm shadow-sm">
        {message.text}
      </p>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(toPlainText(text));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy answer'}
      title={copied ? 'Copied' : 'Copy'}
      className="text-muted hover:bg-subtle hover:text-ink grid h-7 w-7 place-items-center rounded-lg transition-colors"
    >
      {copied ? (
        <Check className="text-success h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

// Saves the answer as a quick note; once saved, opens Quick notes instead.
function SaveNoteButton({ workspaceId, savedNoteId, onSave }) {
  const className =
    'text-muted hover:bg-subtle hover:text-ink grid h-7 w-7 place-items-center rounded-lg transition-colors';
  if (savedNoteId) {
    return (
      <Link
        to={`/w/${workspaceId}/notes`}
        aria-label="Saved to notes. Open Quick notes"
        title="Saved to notes"
        className={className}
      >
        <BookmarkCheck className="text-success h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onSave}
      aria-label="Save answer to notes"
      title="Save to notes"
      className={className}
    >
      <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

function MessageAction({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-muted hover:bg-subtle hover:text-ink grid h-7 w-7 place-items-center rounded-lg transition-colors"
    >
      {children}
    </button>
  );
}

function AiMessage({
  message,
  files,
  onOpenFile,
  workspaceId,
  savedNoteId,
  onSave,
  onUseAsReference,
  onRetryImage,
  onNewChat,
  onSendToBoard,
}) {
  const images = (message.images ?? []).map((id) => files.get(id)).filter(Boolean);
  const isImage = message.kind === 'image';
  const savable = onSave && message.text !== '_Stopped._' && !isImage;
  return (
    <div className="group flex animate-[ai-rise_260ms_ease-out_both] gap-3">
      <AiAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((file) => (
              <AiImageResult
                key={file.id}
                workspaceId={workspaceId}
                file={file}
                onOpen={onOpenFile}
                onUseAsReference={onUseAsReference}
                onRetry={onRetryImage}
              />
            ))}
          </div>
        )}
        {isImage && message.images?.length > 0 && images.length === 0 && (
          <p className="text-muted mb-1 text-xs italic">This image was deleted from Drive.</p>
        )}
        {/* Selecting text in here opens the selection menu. */}
        <div data-ai-answer="">
          <AiMessageText text={message.text} files={files} onOpenFile={onOpenFile} />
        </div>
        <div
          className={cn(
            'text-muted mt-1 flex h-7 items-center gap-1 text-[11px] opacity-100 transition-opacity sm:group-hover:opacity-100',
            // A saved answer keeps its tick in view.
            !savedNoteId && 'sm:opacity-0',
          )}
        >
          <CopyButton text={message.text} />
          {savable && (
            <SaveNoteButton workspaceId={workspaceId} savedNoteId={savedNoteId} onSave={onSave} />
          )}
          {savable && onSendToBoard && (
            <MessageAction label="Send to moodboard" onClick={onSendToBoard}>
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            </MessageAction>
          )}
          {savable && onNewChat && (
            <MessageAction label="New chat from this reply" onClick={onNewChat}>
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
            </MessageAction>
          )}
          {message.stopped && <span className="px-1">Stopped</span>}
          {message.modelName && <span className="px-1">{message.modelName}</span>}
          {message.credits > 0 && (
            <span className="px-1">
              {message.credits} {message.credits === 1 ? 'credit' : 'credits'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Writes the streamed answer out character by character. Text arrives from
// the server in bursts; this plays it at a steady pace, speeding up when it
// falls behind, and calls onFinished once everything has been shown.
function StreamingAnswer({ text, done, files, onOpenFile, onFinished }) {
  const [shown, setShown] = useState(0);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    let frame;
    function tick() {
      setShown((current) => {
        const remaining = textRef.current.length - current;
        if (remaining <= 0) return current;
        return current + Math.max(1, Math.ceil(remaining / 18));
      });
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const caughtUp = shown >= text.length;
  // onFinished is a new function on every parent render, so keep the latest in
  // a ref instead of an effect dependency, and call it exactly once. (Calling
  // it again on each re-render saved the answer over and over until React
  // stopped with "Maximum update depth exceeded".)
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });
  const finishedRef = useRef(false);
  useEffect(() => {
    if (done && caughtUp && !finishedRef.current) {
      finishedRef.current = true;
      onFinishedRef.current();
    }
  }, [done, caughtUp]);

  // A citation that is only half written would show as raw text; hold it back.
  const visible = text.slice(0, shown).replace(/\[\[[^\]]*\]?$/, '');
  return (
    <div className="flex gap-3">
      <AiAvatar busy={!done} />
      <div className="min-w-0 flex-1 pt-0.5">
        <AiMessageText text={visible} files={files} onOpenFile={onOpenFile} />
        {!caughtUp || !done ? (
          <span
            className="bg-ink/70 ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse rounded-full"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
}

// Before the first word: a turning ring, the step the server says it is on,
// and a sweeping highlight.
function Thinking({ status }) {
  return (
    <div className="flex animate-[ai-rise_220ms_ease-out_both] items-center gap-3" role="status">
      <AiAvatar busy />
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span
          key={status}
          className="ai-shimmer-text animate-[ai-rise_260ms_ease-out_both] truncate"
        >
          {status || 'Thinking'}
        </span>
        <span className="flex shrink-0 gap-1" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="h-1.5 w-1.5 animate-[ai-dot_1.2s_ease-in-out_infinite] rounded-full bg-fuchsia-500"
              style={{ animationDelay: `${dot * 0.15}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children, className, ...props }) {
  const Component = props.to ? Link : 'button';
  return (
    <Component
      type={props.to ? undefined : 'button'}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'text-muted hover:bg-subtle hover:text-ink grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-50 sm:h-8 sm:w-8',
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

function mergeFiles(current, added) {
  const byId = new Map((current ?? []).map((file) => [file.id, file]));
  for (const file of added ?? []) byId.set(file.id, file);
  return [...byId.values()];
}

// variant "panel": the floating window (full screen on phones); "page": the AI page.
export function AiChat({ workspace, status, onClose, variant = 'panel' }) {
  const isPage = variant === 'page';
  const queryClient = useQueryClient();
  const canBuy = canAdminister(workspace);
  const [threadId, setThreadIdState] = useState(() => readLocal(threadStorageKey(workspace.id)));
  const threads = useAiThreads(workspace.id);
  const thread = useAiThread(workspace.id, threadId);
  const renameThread = useRenameThread(workspace.id);
  const deleteThread = useDeleteThread(workspace.id);
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState(null);
  // Files for the next question: { key, id?, name, category, uploadId? }.
  // Uploads get their id once stored (progress comes from the upload store).
  const [attached, setAttached] = useState([]);
  // Saved notes for the next question, picked with "#": { id, title }.
  const [pickedNotes, setPickedNotes] = useState([]);
  // Skills for the next question, picked with "!": { id, name, emoji }.
  const [pickedSkills, setPickedSkills] = useState([]);
  // Text the next question is about: picked in an answer, or a whole earlier
  // answer a new chat started from. { text } or null.
  const [quote, setQuote] = useState(null);
  // Text picked in an answer, being sent to Notes ({ text }) or a moodboard.
  const [textNote, setTextNote] = useState(null);
  const [boardText, setBoardText] = useState(null);
  // "Create image" mode: the next send makes a picture; attachments are references.
  const [imageMode, setImageModeState] = useState(false);
  const [imageOptions, setImageOptions] = useState({ aspectRatio: '1:1', style: 'none' });
  const canMakeImages = canEdit(workspace) && Boolean(status.images);
  // The FrameDesk model for chat answers and for images, remembered per device.
  const [modelChoice, setModelChoiceState] = useState(() => ({
    chat: readModelChoice('chat'),
    image: readModelChoice('image'),
  }));
  const chatModel = pickModel(status.models, 'chat', modelChoice.chat);
  const imageModel = pickModel(status.models, 'image', modelChoice.image);
  // Reference images per request: the plan's allowance, capped by the image
  // model (Cloudflare FLUX takes 4).
  const maxReferences = imageModel?.maxReferences ?? status.images?.maxReferences ?? 3;
  const attachLimit = imageMode ? maxReferences : MAX_ATTACHMENTS;
  function setModelChoice(kind, key) {
    writeModelChoice(kind, key);
    setModelChoiceState((current) => ({ ...current, [kind]: key }));
    // A model with fewer reference slots drops the extra references.
    const next = pickModel(status.models, kind, key);
    if (kind === 'image' && imageMode && typeof next?.maxReferences === 'number') {
      setAttached((current) => current.slice(0, next.maxReferences));
    }
  }

  function setImageMode(on) {
    setImageModeState(on);
    if (on) {
      // Only images can be references, and only as many as the plan allows.
      setAttached((current) =>
        current.filter((file) => (file.category ?? 'image') === 'image').slice(0, maxReferences),
      );
      setPickedSkills([]);
      setPickedNotes([]);
      setScope(null);
      setQuote(null);
    }
  }
  // The assistant a new chat is with (null: FrameDesk AI).
  const [agentChoice, setAgentChoiceState] = useState(() =>
    readLocal(agentStorageKey(workspace.id)),
  );
  const agents = useAiAgents(workspace.id);
  // The answer whose "Save to notes" dialog is open: { message, question }.
  const [saving, setSaving] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const uploads = useUploads();
  const inputRef = useRef(null);
  const [openFile, setOpenFile] = useState(null);
  // On a phone or in the panel, history slides over the chat.
  const [historyOpen, setHistoryOpen] = useState(false);
  // While an answer is being written: { question, text, status, done, result, error }.
  const [stream, setStream] = useState(null);
  const committedRef = useRef(null);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);

  function setAgentChoice(id) {
    setAgentChoiceState(id);
    if (id) writeLocal(agentStorageKey(workspace.id), id);
    else removeLocal(agentStorageKey(workspace.id));
  }

  const setThreadId = useCallback(
    (id) => {
      setThreadIdState(id);
      if (id) writeLocal(threadStorageKey(workspace.id), id);
      else removeLocal(threadStorageKey(workspace.id));
    },
    [workspace.id],
  );

  // "Open chat" on a saved note links to /ai?thread=…: show that chat.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedThread = isPage ? searchParams.get('thread') : null;
  useEffect(() => {
    if (!linkedThread) return;
    if (/^[a-f\d]{24}$/i.test(linkedThread)) setThreadId(linkedThread);
    setSearchParams(
      (params) => {
        params.delete('thread');
        return params;
      },
      { replace: true },
    );
  }, [linkedThread, setThreadId, setSearchParams]);

  // A chat deleted elsewhere (or gone) falls back to a new one.
  useEffect(() => {
    if (thread.isError && thread.error?.status === 404) setThreadId(null);
  }, [thread.isError, thread.error, setThreadId]);

  // Stop a running answer when the chat closes.
  useEffect(() => () => abortRef.current?.abort(), []);

  const attachments = useMemo(
    () =>
      attached.map((file) => {
        if (!file.uploadId) return { ...file, status: 'ready' };
        const upload = uploads.find((item) => item.id === file.uploadId);
        if (!upload)
          return { ...file, status: file.id ? 'ready' : 'error', error: 'Upload stopped' };
        if (upload.status === 'done') {
          return upload.fileId
            ? { ...file, id: upload.fileId, status: 'ready' }
            : { ...file, status: 'error', error: 'Upload finished but could not be attached' };
        }
        if (upload.status === 'error' || upload.status === 'paused') {
          return { ...file, status: 'error', error: upload.error ?? 'Upload paused' };
        }
        return {
          ...file,
          status: 'uploading',
          progress: upload.size ? upload.uploadedBytes / upload.size : 0,
        };
      }),
    [attached, uploads],
  );

  const messages = threadId ? (thread.data?.messages ?? []) : [];
  // An open chat keeps its own assistant; a new one uses the choice.
  const threadAgent = threadId ? (thread.data?.thread.agent ?? null) : undefined;
  const agentList = agents.data ?? [];
  const chosenAgent = agentList.find((agent) => agent.id === agentChoice) ?? null;
  const activeAgent =
    threadAgent === undefined
      ? chosenAgent
      : threadAgent
        ? (agentList.find((agent) => agent.id === threadAgent.id) ?? {
            ...threadAgent,
            color: 'slate',
          })
        : null;
  const savedNotes = thread.data?.savedNotes ?? {};
  const files = useMemo(
    () => new Map((thread.data?.files ?? []).map((file) => [file.id, file])),
    [thread.data?.files],
  );
  const credits = status.credits;
  const limited = credits.total <= 0;
  const busy = Boolean(stream && !stream.error && !stream.done);
  const working = Boolean(stream && !stream.error);

  // Follow the answer as it grows, unless the person scrolled up to read.
  useEffect(() => {
    const node = scrollRef.current;
    // The welcome screen (no messages yet) stays at its top.
    if (node && stickToBottom.current && (stream || messages.length > 0)) {
      node.scrollTop = node.scrollHeight;
    }
  });

  function onScroll() {
    const node = scrollRef.current;
    if (!node) return;
    stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
  }

  const commit = useCallback(
    (result) => {
      // Each answer is saved into the chat once, however often this is called.
      if (committedRef.current === result) return;
      committedRef.current = result;
      // Clear the live answer first, so it is gone before the cache updates
      // below re-render the chat.
      setStream(null);
      const id = result.thread.id;
      queryClient.setQueryData(aiKey(workspace.id, 'thread', id), (current) => ({
        ...current,
        thread: result.thread,
        messages: [...(current?.messages ?? []), ...result.messages],
        files: mergeFiles(current?.files, result.files),
      }));
      queryClient.setQueryData(aiKey(workspace.id, 'threads'), (list) => [
        result.thread,
        ...(list ?? []).filter((item) => item.id !== id),
      ]);
      queryClient.setQueryData(aiKey(workspace.id, 'status'), (current) =>
        current ? { ...current, credits: result.credits } : current,
      );
    },
    [queryClient, workspace.id],
  );

  // "Create image": not streamed; a placeholder shows until the picture is back.
  async function sendImage(text, options = imageOptions, references = attachments) {
    if (references.some((file) => file.status && file.status !== 'ready')) return;
    const prompt = text.trim();
    if (prompt.length < 3 || working || limited) return;
    const refs = references.filter((file) => file.id);
    const sentAttachments = attached;
    setDraft('');
    setAttached([]);
    setUploadError(null);
    stickToBottom.current = true;
    setStream({
      question: {
        text: prompt,
        kind: 'image',
        imageOptions: options,
        attachments: refs.map(({ id, name, category }) => ({ id, name, category })),
      },
      image: true,
      ratio: options.aspectRatio,
      text: '',
      status: refs.length
        ? `Creating your image from ${refs.length} ${refs.length === 1 ? 'reference' : 'references'}…`
        : 'Creating your image…',
      done: false,
      result: null,
      error: null,
    });
    try {
      const result = await createAiImage(workspace.id, {
        prompt,
        ...(threadId && { threadId }),
        ...(!threadId && chosenAgent && { agentId: chosenAgent.id }),
        ...(refs.length && { referenceFileIds: refs.map((file) => file.id) }),
        aspectRatio: options.aspectRatio,
        style: options.style,
        ...(imageModel && { modelKey: imageModel.key }),
      });
      if (result.created) setThreadId(result.thread.id);
      commit(result);
      // The new picture is in Drive now.
      invalidateFeatures(queryClient, workspace.id, ['files', 'folders']);
    } catch (error) {
      if (error.code === 'MODEL_COMING_SOON') setModelChoice('image', null);
      if (
        ['NO_CREDITS', 'REF_LIMIT', 'MODEL_COMING_SOON'].includes(error.code) ||
        error.status === 503
      ) {
        queryClient.invalidateQueries({ queryKey: aiKey(workspace.id, 'status') });
      }
      setDraft((current) => current || prompt);
      setAttached((current) => (current.length ? current : sentAttachments));
      setStream((current) => current && { ...current, error });
    }
  }

  // Tries the same image request again (the "another version" button).
  function retryImage(message) {
    const index = messages.findIndex((item) => item.id === message.id);
    const question = messages.slice(0, index).findLast((item) => item.role === 'user');
    if (!question) return;
    const options = { ...imageOptions, ...(question.imageOptions ?? {}) };
    setImageMode(true);
    setImageOptions(options);
    sendImage(
      question.text,
      options,
      (question.attachments ?? []).map((file) => ({ ...file, key: file.id, status: 'ready' })),
    );
  }

  function addAsReference(file) {
    setImageMode(true);
    setAttached((current) =>
      current.some((item) => item.id === file.id) || current.length >= maxReferences
        ? current
        : [...current, { key: file.id, id: file.id, name: file.name, category: 'image' }],
    );
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function send(text = draft) {
    if (imageMode) return sendImage(text);
    const files = attachments.filter((file) => file.status === 'ready');
    if (attachments.some((file) => file.status !== 'ready')) return;
    const notes = pickedNotes;
    const skills = pickedSkills;
    const quoted = quote?.text ?? '';
    const question =
      text.trim() ||
      (quoted ? 'Tell me more about this' : '') ||
      (files.length === 1
        ? 'What is in this file?'
        : files.length
          ? 'What is in these files?'
          : notes.length
            ? notes.length === 1
              ? 'Analyse this note'
              : 'Analyse these notes'
            : '');
    if (!question || working || limited) return;
    const project = scope;
    const sentAttachments = attached;
    setDraft('');
    setAttached([]);
    setPickedNotes([]);
    setPickedSkills([]);
    setQuote(null);
    setUploadError(null);
    stickToBottom.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setStream({
      question: {
        text: question,
        project,
        attachments: files.map(({ id, name, category }) => ({ id, name, category })),
        notes,
        skills,
        quote: quoted || null,
      },
      text: '',
      status: 'Thinking',
      done: false,
      result: null,
      error: null,
    });
    try {
      await askAiStream(
        workspace.id,
        {
          text: question,
          ...(threadId && { threadId }),
          ...(project?.wholeDrive
            ? { wholeDrive: true }
            : project && { projectId: project.id }),
          ...(files.length && { fileIds: files.map((file) => file.id) }),
          ...(notes.length && { noteIds: notes.map((note) => note.id) }),
          ...(skills.length && { skillIds: skills.map((skill) => skill.id) }),
          ...(quoted && { quote: quoted.slice(0, 12000) }),
          ...(!threadId && chosenAgent && { agentId: chosenAgent.id }),
          ...(chatModel && { modelKey: chatModel.key }),
        },
        {
          signal: controller.signal,
          onEvent: (event, data) => {
            if (event === 'thread' && data.created) {
              queryClient.setQueryData(aiKey(workspace.id, 'thread', data.thread.id), {
                thread: data.thread,
                messages: [],
                files: [],
              });
              setThreadId(data.thread.id);
            } else if (event === 'status') {
              setStream((current) => current && { ...current, status: data.text });
            } else if (event === 'delta') {
              setStream((current) => current && { ...current, text: current.text + data.text });
            } else if (event === 'done') {
              setStream((current) => current && { ...current, done: true, result: data });
              // Memory is learnt just after the answer; refresh it shortly.
              setTimeout(
                () => queryClient.invalidateQueries({ queryKey: aiKey(workspace.id, 'memory') }),
                6000,
              );
            }
          },
        },
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.code === 'MODEL_COMING_SOON') setModelChoice('chat', null);
      if (error.code === 'NO_CREDITS' || error.status === 403 || error.status === 503) {
        queryClient.invalidateQueries({ queryKey: aiKey(workspace.id, 'status') });
      }
      // Nothing typed is lost.
      setDraft((current) => current || text.trim());
      setAttached((current) => (current.length ? current : sentAttachments));
      setPickedNotes((current) => (current.length ? current : notes));
      setPickedSkills((current) => (current.length ? current : skills));
      if (quoted) setQuote((current) => current ?? { text: quoted });
      if (error.code === 'AGENT_NOT_FOUND') {
        setAgentChoice(null);
        queryClient.invalidateQueries({ queryKey: aiKey(workspace.id, 'agents') });
      }
      setStream((current) => current && { ...current, error });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function stop() {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    abortRef.current = null;
    // The server saves what was written; show it now and sync in a moment.
    setStream(null);
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: aiKey(workspace.id, 'thread') });
      queryClient.invalidateQueries({ queryKey: aiKey(workspace.id, 'threads') });
      queryClient.invalidateQueries({ queryKey: aiKey(workspace.id, 'status') });
    }, 1200);
  }

  function newChat(fromText = null) {
    if (working) stop();
    setThreadId(null);
    setStream(null);
    setScope(null);
    setAttached([]);
    setPickedNotes([]);
    setPickedSkills([]);
    setQuote(fromText ? { text: fromText } : null);
    setImageModeState(false);
    setUploadError(null);
    setHistoryOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // Picked text (or a reply) as context for the next question in this chat.
  function askAbout(text) {
    setQuote({ text });
    setImageModeState(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function addSkill(skill) {
    setPickedSkills((current) =>
      current.some((item) => item.id === skill.id) || current.length >= MAX_SKILLS
        ? current
        : [...current, skill],
    );
  }

  function addNote(note) {
    setPickedNotes((current) =>
      current.some((item) => item.id === note.id) || current.length >= MAX_NOTES
        ? current
        : [...current, note],
    );
  }

  function attach(file) {
    setAttached((current) =>
      current.some((item) => item.id === file.id) || current.length >= attachLimit
        ? current
        : [...current, { key: file.id, ...file }],
    );
  }

  // Files picked, dropped or pasted: uploaded to the Drive's "AI uploads"
  // folder and attached to the next question.
  async function uploadFiles(list) {
    const usable = imageMode ? list.filter((file) => file.type.startsWith('image/')) : list;
    const room = attachLimit - attached.length;
    const files = usable.slice(0, Math.max(room, 0));
    setUploadError(
      usable.length < list.length
        ? 'Only images can be used as references.'
        : list.length > files.length
          ? imageMode
            ? `Your plan allows up to ${attachLimit} reference images per request.`
            : `Up to ${attachLimit} files per question.`
          : null,
    );
    if (files.length === 0) return;
    try {
      const folder = await fetchAiUploadFolder(workspace.id);
      const ids = await addUploads({
        workspaceId: workspace.id,
        projectId: null,
        folderId: folder.id,
        folderName: folder.name,
        files,
      });
      setAttached((current) => [
        ...current,
        ...ids.map((uploadId, index) => ({
          key: uploadId,
          uploadId,
          name: files[index].name,
          category: categoryOf(files[index]),
        })),
      ]);
    } catch (error) {
      setUploadError(error.message);
    }
  }

  // "Ask AI" from a project's or file's menu: a fresh chat about it.
  const applyRequest = useRef(null);
  useEffect(() => {
    applyRequest.current = (request) => {
      if (working) stop();
      setThreadId(null);
      setStream(null);
      setHistoryOpen(false);
      setScope(request.project ?? null);
      setAttached(request.file ? [{ key: request.file.id, ...request.file }] : []);
      setPickedNotes(request.note ? [request.note] : []);
      setQuote(null);
      setUploadError(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
  });
  useEffect(() => {
    const take = () => {
      const request = takeAiRequest();
      if (request) applyRequest.current?.(request);
    };
    take();
    return onAiRequest(take);
  }, []);

  function selectThread(id) {
    if (working) stop();
    setStream(null);
    setThreadId(id);
    setHistoryOpen(false);
    stickToBottom.current = true;
  }

  function removeThread(id) {
    deleteThread.mutate(id);
    if (id === threadId) setThreadId(null);
  }

  const history = (
    <AiHistory
      threads={threads.data}
      isPending={threads.isPending}
      activeId={threadId}
      onSelect={selectThread}
      onNew={() => newChat()}
      onRename={(id, title) => renameThread.mutate({ threadId: id, title })}
      onDelete={removeThread}
      className="h-full"
      header={
        <div className="border-line/60 flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Chats</p>
          <IconButton
            label="Close chat history"
            onClick={() => setHistoryOpen(false)}
            className={cn(isPage && 'lg:hidden')}
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>
      }
    />
  );

  const column = isPage ? 'mx-auto w-full max-w-3xl px-4 sm:px-6' : 'px-4';
  const showWelcome = !stream && messages.length === 0 && !(threadId && thread.isPending);

  return (
    <section
      role={isPage ? 'region' : 'dialog'}
      aria-label="AI assistant"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || openFile) return;
        if (historyOpen) setHistoryOpen(false);
        else if (!isPage) onClose();
      }}
      className={cn(
        'bg-surface text-ink flex overflow-hidden',
        isPage
          ? 'border-line/70 shadow-soft relative h-[calc(100dvh-9.75rem-env(safe-area-inset-bottom))] min-h-[22rem] rounded-3xl border sm:h-[calc(100dvh-11.25rem-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-7.5rem)] lg:min-h-[26rem]'
          : // Phones: full screen. Larger screens: a window above the corner button.
            'sm:border-line/70 fixed inset-0 z-40 h-[100dvh] animate-[rise-in_200ms_ease-out] sm:inset-auto sm:bottom-20 sm:right-4 sm:z-30 sm:h-[min(40rem,calc(100dvh-7rem))] sm:w-[min(26rem,calc(100vw-2rem))] sm:origin-bottom-right sm:rounded-3xl sm:border sm:shadow-2xl',
      )}
    >
      {/* History: always beside the chat on a wide AI page, a slide-over elsewhere. */}
      {isPage && (
        <aside className="border-line/60 hidden w-64 shrink-0 border-r lg:block">{history}</aside>
      )}
      {historyOpen && (
        <>
          <div
            className={cn(
              'bg-ink/20 absolute inset-0 z-20 backdrop-blur-[1px]',
              isPage && 'lg:hidden',
            )}
            onClick={() => setHistoryOpen(false)}
            aria-hidden="true"
          />
          <aside
            className={cn(
              'bg-surface border-line/60 absolute inset-y-0 left-0 z-30 w-[min(18rem,85%)] animate-[ai-slide-in_180ms_ease-out] border-r shadow-xl',
              isPage && 'lg:hidden',
            )}
          >
            {history}
          </aside>
        </>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* z-10 keeps the assistant menu above the messages. */}
        <header className="border-line/60 bg-surface relative z-10 flex shrink-0 items-center gap-1.5 border-b px-2.5 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:gap-2 sm:px-3">
          {/* A soft colour wash, kept inside the header so it never spills
              over the messages below. */}
          <span
            className={cn(AI_GRADIENT, 'pointer-events-none absolute inset-0 -z-10 opacity-[0.07]')}
            aria-hidden="true"
          />
          <IconButton
            label="Chat history"
            onClick={() => setHistoryOpen(true)}
            className={cn(isPage && 'lg:hidden')}
          >
            <History className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          {threadId ? (
            <>
              {activeAgent ? (
                <span className="relative">
                  {busy && (
                    <span
                      className="ai-orbit absolute -inset-[3px] rounded-full"
                      aria-hidden="true"
                    />
                  )}
                  <AgentBadge agent={activeAgent} className={cn(busy && 'ring-surface ring-2')} />
                </span>
              ) : (
                <AiAvatar busy={busy} />
              )}
              <div className="min-w-0 flex-1 pl-0.5">
                <p className="truncate text-sm font-semibold leading-tight">
                  {thread.data?.thread.title ?? activeAgent?.name ?? 'FrameDesk AI'}
                </p>
                <p className="text-muted truncate text-[11px] leading-tight">
                  {busy
                    ? 'Working on it…'
                    : activeAgent
                      ? `with ${activeAgent.name}`
                      : 'Knows your videos, images and docs'}
                </p>
              </div>
            </>
          ) : (
            <AgentPicker
              workspaceId={workspace.id}
              agents={agentList}
              value={chosenAgent?.id ?? null}
              onChange={setAgentChoice}
              subtitle={busy ? 'Working on it…' : undefined}
              onNavigate={isPage ? undefined : onClose}
            />
          )}
          <UsageButton
            credits={credits}
            workspaceId={workspace.id}
            canBuy={canBuy}
            action={
              <AiResetButton workspace={workspace} status={status} size="sm" className="w-full" />
            }
          />
          {(threadId || messages.length > 0) && (
            <IconButton label="New chat" onClick={() => newChat()}>
              <SquarePen className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          )}
          {!isPage && (
            <>
              <IconButton
                label="Open full screen"
                to={`/w/${workspace.id}/ai`}
                onClick={onClose}
                className="hidden sm:grid"
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </IconButton>
              <IconButton label="Close the assistant" onClick={onClose}>
                <X className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </>
          )}
        </header>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
          aria-live="polite"
        >
          <div className={cn('flex min-h-full flex-col gap-5 py-5', column)}>
            {threadId && thread.isPending && !stream ? (
              <Loader2 className="text-muted m-auto h-5 w-5 animate-spin" aria-hidden="true" />
            ) : thread.isError && thread.error?.status !== 404 ? (
              <p className="text-danger m-auto text-sm">{thread.error.message}</p>
            ) : showWelcome ? (
              <Welcome
                status={status}
                onPick={(text) => send(text)}
                compact={!isPage}
                scope={scope}
                attachments={attachments}
                agent={activeAgent}
              />
            ) : (
              <>
                {messages.map((message, index) =>
                  message.role === 'user' ? (
                    <UserMessage key={message.id} message={message} />
                  ) : (
                    <AiMessage
                      key={message.id}
                      message={message}
                      files={files}
                      onOpenFile={setOpenFile}
                      workspaceId={workspace.id}
                      savedNoteId={savedNotes[message.id]}
                      onSave={
                        threadId
                          ? () =>
                              setSaving({
                                message,
                                question: messages
                                  .slice(0, index)
                                  .findLast((candidate) => candidate.role === 'user'),
                              })
                          : undefined
                      }
                      onUseAsReference={canMakeImages ? addAsReference : undefined}
                      onNewChat={() => newChat(toPlainText(message.text))}
                      onSendToBoard={
                        canEdit(workspace)
                          ? () => setBoardText(toPlainText(message.text))
                          : undefined
                      }
                      onRetryImage={
                        canMakeImages && message.kind === 'image' && !working
                          ? () => retryImage(message)
                          : undefined
                      }
                    />
                  ),
                )}
                {stream && (
                  <>
                    <UserMessage message={stream.question} />
                    {stream.error ? (
                      <div className="border-danger/30 bg-danger/5 flex animate-[ai-rise_220ms_ease-out_both] items-start justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-sm">
                        <p role="alert" className="text-danger">
                          {stream.error.message}
                        </p>
                        {!['NO_CREDITS', 'REF_LIMIT', 'IMAGE_QUOTA', 'MODEL_COMING_SOON'].includes(
                          stream.error.code,
                        ) && (
                          <button
                            type="button"
                            onClick={() => {
                              setDraft('');
                              send(stream.question.text);
                            }}
                            className="text-ink inline-flex shrink-0 items-center gap-1 text-xs font-medium hover:underline"
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
                          </button>
                        )}
                      </div>
                    ) : stream.image ? (
                      <div className="flex gap-3">
                        <AiAvatar busy />
                        <div className="min-w-0 flex-1 pt-0.5">
                          <ImagePending ratio={stream.ratio} status={stream.status} />
                        </div>
                      </div>
                    ) : stream.text ? (
                      <StreamingAnswer
                        text={stream.text}
                        done={stream.done}
                        files={
                          stream.result
                            ? new Map(
                                mergeFiles([...files.values()], stream.result.files).map((file) => [
                                  file.id,
                                  file,
                                ]),
                              )
                            : files
                        }
                        onOpenFile={setOpenFile}
                        onFinished={() => stream.result && commit(stream.result)}
                      />
                    ) : (
                      <Thinking status={stream.status} />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div
          className={cn('pb-[env(safe-area-inset-bottom)]', isPage && 'mx-auto w-full max-w-3xl')}
        >
          {limited && (
            <LimitReached
              credits={credits}
              workspaceId={workspace.id}
              canBuy={canBuy}
              action={<AiResetButton workspace={workspace} status={status} size="sm" />}
            />
          )}
          <AiComposer
            workspaceId={workspace.id}
            value={draft}
            onChange={setDraft}
            onSend={() => send()}
            onStop={stop}
            scope={scope}
            onScope={setScope}
            attachments={attachments}
            onAttach={attach}
            onRemoveAttachment={(key) =>
              setAttached((current) => current.filter((file) => file.key !== key))
            }
            notes={pickedNotes}
            onAddNote={addNote}
            onRemoveNote={(id) =>
              setPickedNotes((current) => current.filter((note) => note.id !== id))
            }
            quote={quote}
            onClearQuote={() => setQuote(null)}
            skills={pickedSkills}
            onAddSkill={addSkill}
            onRemoveSkill={(id) =>
              setPickedSkills((current) => current.filter((skill) => skill.id !== id))
            }
            imageMode={imageMode}
            onImageMode={canMakeImages ? setImageMode : undefined}
            imageOptions={imageOptions}
            onImageOptions={setImageOptions}
            maxAttachments={attachLimit}
            modelPicker={
              <ModelPicker
                models={status.models}
                kind={imageMode ? 'image' : 'chat'}
                value={(imageMode ? imageModel : chatModel)?.key ?? null}
                onChange={(key) => setModelChoice(imageMode ? 'image' : 'chat', key)}
                disabled={working}
              />
            }
            onUpload={uploadFiles}
            canUpload={canEdit(workspace)}
            notice={uploadError}
            inputRef={inputRef}
            disabled={limited}
            busy={working}
          />
        </div>
      </div>
      <PreviewDialog
        workspaceId={workspace.id}
        file={openFile}
        canEdit={canEdit(workspace)}
        onClose={() => setOpenFile(null)}
      />
      {saving && threadId && (
        <SaveAnswerDialog
          workspaceId={workspace.id}
          threadId={threadId}
          message={saving.message}
          question={saving.question}
          onClose={() => setSaving(null)}
          onSaved={() => setSaving(null)}
        />
      )}
      {textNote && (
        <SaveTextNoteDialog
          workspaceId={workspace.id}
          text={textNote.text}
          projectId={scope && !scope.wholeDrive ? scope.id : null}
          onClose={() => setTextNote(null)}
        />
      )}
      {boardText !== null && (
        <SendToMoodboardDialog
          workspaceId={workspace.id}
          text={boardText}
          onClose={() => setBoardText(null)}
        />
      )}
      <SelectionMenu
        containerRef={scrollRef}
        actions={[
          { label: 'Ask AI', icon: Sparkles, onPick: askAbout },
          { label: 'Add to notes', icon: NotebookPen, onPick: (text) => setTextNote({ text }) },
          ...(canEdit(workspace)
            ? [{ label: 'Moodboard', icon: LayoutGrid, onPick: setBoardText }]
            : []),
          { label: 'New chat', icon: MessageSquarePlus, onPick: (text) => newChat(text) },
        ]}
      />
    </section>
  );
}

// The round sparkle button in the bottom-right corner. Hidden on the AI page
// itself, and whenever the assistant is off for this account.
export function AiAssistant({ workspace }) {
  const status = useAiStatus(workspace.id, { enabled: canView(workspace) });
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const onAiPage = pathname.replace(/\/$/, '') === `/w/${workspace.id}/ai`;

  // Menus show "Ask AI" only while the assistant is on.
  const enabled = Boolean(status.data?.enabled);
  useEffect(() => {
    setAiAvailable(enabled);
    return () => setAiAvailable(false);
  }, [enabled]);

  // "Ask AI" in a project's or file's menu opens the panel (on the AI page,
  // that page's chat takes the request instead).
  useEffect(() => {
    if (onAiPage) return undefined;
    return onAiRequest(() => setOpen(true));
  }, [onAiPage]);

  // The phone version covers the page: stop the page behind it from scrolling.
  useEffect(() => {
    if (!open || window.matchMedia('(min-width: 640px)').matches) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!status.data?.enabled || onAiPage) return null;

  return (
    <>
      {open && <AiChat workspace={workspace} status={status.data} onClose={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'Close the AI assistant' : 'Ask the AI assistant about your files'}
        title={open ? 'Close' : 'Ask AI'}
        className={cn(
          AI_GRADIENT,
          'group fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-20 h-12 w-12 place-items-center rounded-full text-white shadow-lg shadow-fuchsia-500/30 transition-all duration-200 hover:scale-105 hover:shadow-fuchsia-500/50 active:scale-95 sm:right-5 sm:z-30 lg:bottom-[max(1.25rem,env(safe-area-inset-bottom))]',
          // On phones the open chat has its own close button.
          open ? 'hidden sm:grid' : 'grid',
        )}
      >
        {open ? (
          <X className="h-5 w-5 animate-[pop-in_160ms_ease-out]" aria-hidden="true" />
        ) : (
          <Sparkles
            className="h-5 w-5 transition-transform duration-300 group-hover:rotate-12"
            aria-hidden="true"
          />
        )}
      </button>
    </>
  );
}

export function useAiEnabled(workspace) {
  const status = useAiStatus(workspace?.id, { enabled: Boolean(workspace) && canView(workspace) });
  return Boolean(status.data?.enabled);
}
