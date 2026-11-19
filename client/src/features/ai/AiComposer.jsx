import {
  ArrowUp,
  AtSign,
  Camera,
  File as FileIcon,
  FileText,
  Film,
  FolderKanban,
  HardDrive,
  Quote,
  Image as ImageIcon,
  Loader2,
  Mic,
  Music,
  NotebookPen,
  Paperclip,
  Square,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { useCamera } from '../media/CameraCapture.jsx';
import { useProjects } from '../projects/hooks.js';
import { useQuickNotes } from '../quickNotes/hooks.js';
import { AI_GRADIENT } from './aiStyle.js';
import { useAiFileSearch } from './hooks.js';
import { useAiSkills } from './studioHooks.js';
import { useDictation } from './useDictation.js';

const PICKER_LIMIT = 8;
// Files one question can carry (the server allows the same).
export const MAX_ATTACHMENTS = 5;
// Saved notes one question can carry (the server allows the same).
export const MAX_NOTES = 5;
// Skills one question can use (the server allows the same).
export const MAX_SKILLS = 3;
// What the paperclip offers: things the assistant can study.
const UPLOAD_ACCEPT = 'video/*,audio/*,image/*,.pdf,.txt,.md,.csv,.doc,.docx,.rtf,.json';
// What reference images can be (the server allows the same).
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,image/heif';
// "/" (a project), "@" (a file), "#" (a saved note) or "!" (a skill) at the
// start or after a space, then whatever is typed up to the caret.
const TRIGGER = /(^|\s)([/@#!])([^\s/@#!]*)$/;
const TRIGGER_KINDS = { '/': 'project', '@': 'file', '#': 'note', '!': 'skill' };

// "//" (at the start or after a space): use the whole Drive for this question.
export const WHOLE_DRIVE = { id: 'drive', title: 'Whole Drive', wholeDrive: true };
const WHOLE_DRIVE_TRIGGER = /(^|\s)\/\/$/;

function triggerAt(value, caret) {
  const match = value.slice(0, caret).match(TRIGGER);
  if (!match) return null;
  return {
    kind: TRIGGER_KINDS[match[2]],
    query: match[3],
    start: caret - match[3].length - 1,
  };
}

export function noteLabel(note) {
  if (note.title) return note.title;
  const line = (note.body ?? '').split('\n').find((text) => text.trim()) ?? 'Untitled note';
  return line.replace(/^[#>*\-\s[\]x]+/i, '').slice(0, 80) || 'Untitled note';
}

// A saved note added to a question with "#".
export function NoteChip({ note, onRemove, className }) {
  return (
    <span
      title={note.title}
      className={cn(
        'inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-50 py-1 pl-2 text-xs font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-200',
        onRemove ? 'pr-1' : 'pr-2.5',
        className,
      )}
    >
      <NotebookPen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{note.title}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${note.title}`}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-amber-400/20"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

// A skill picked with "!" for this question.
export function SkillChip({ skill, onRemove, className }) {
  return (
    <span
      title={skill.name}
      className={cn(
        'inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border border-fuchsia-400/40 bg-fuchsia-50 py-1 pl-2 text-xs font-medium text-fuchsia-900 dark:bg-fuchsia-400/10 dark:text-fuchsia-200',
        onRemove ? 'pr-1' : 'pr-2.5',
        className,
      )}
    >
      {skill.emoji ? (
        <span className="shrink-0 text-[13px] leading-none" aria-hidden="true">
          {skill.emoji}
        </span>
      ) : (
        <Wand2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{skill.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${skill.name}`}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-fuchsia-400/20"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

const CATEGORY_ICONS = { video: Film, audio: Music, image: ImageIcon, document: FileText };

export function categoryOf(file) {
  const type = file.type ?? '';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('image/')) return 'image';
  return 'document';
}

export function FileKindIcon({ category, className }) {
  const Icon = CATEGORY_ICONS[category] ?? FileIcon;
  return <Icon className={className} aria-hidden="true" />;
}

// The passage a question was about (picked in an answer, or a whole earlier answer).
export function QuoteBlock({ text, onClear, className }) {
  return (
    <div
      className={cn(
        'bg-subtle border-line text-ink/75 flex max-w-full items-start gap-2 rounded-xl border-l-4 py-1.5 pl-2.5 pr-1.5 text-xs',
        className,
      )}
    >
      <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      <p className="line-clamp-3 min-w-0 flex-1 whitespace-pre-wrap break-words">{text}</p>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove quote"
          className="hover:bg-surface grid h-5 w-5 shrink-0 place-items-center rounded-full"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function ScopeChip({ project, onClear, className }) {
  return (
    <span
      className={cn(
        'bg-lavender text-accent dark:text-ink inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-2.5 text-xs font-medium',
        onClear ? 'pr-1' : 'pr-2.5',
        className,
      )}
    >
      {project.wholeDrive ? (
        <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <FolderKanban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{project.title}</span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Stop limiting to ${project.title}`}
          className="hover:bg-accent/15 grid h-5 w-5 place-items-center rounded-full"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

// An attached file: uploading (with progress), failed, or ready.
export function FileChip({ file, onRemove, className }) {
  const uploading = file.status === 'uploading';
  const failed = file.status === 'error';
  return (
    <span
      title={failed ? file.error : file.name}
      className={cn(
        'border-line/70 bg-surface relative inline-flex max-w-[14rem] items-center gap-1.5 overflow-hidden rounded-full border py-1 pl-2 text-xs font-medium',
        onRemove ? 'pr-1' : 'pr-2.5',
        failed && 'border-danger/40 text-danger',
        className,
      )}
    >
      {uploading && (
        <span
          className={cn(AI_GRADIENT, 'absolute inset-y-0 left-0 opacity-15 transition-[width]')}
          style={{ width: `${Math.round((file.progress ?? 0) * 100)}%` }}
          aria-hidden="true"
        />
      )}
      {uploading ? (
        <Loader2 className="relative h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        <FileKindIcon category={file.category} className="relative h-3.5 w-3.5 shrink-0" />
      )}
      <span className="relative truncate">{file.name}</span>
      {uploading && (
        <span className="text-muted relative tabular-nums">
          {Math.round((file.progress ?? 0) * 100)}%
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${file.name}`}
          className="hover:bg-subtle relative grid h-5 w-5 shrink-0 place-items-center rounded-full"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

function Picker({ label, emptyText, isPending, items, activeIndex, onHover, onPick, render }) {
  return (
    <div
      role="listbox"
      aria-label={label}
      className="border-line/70 bg-surface shadow-lift absolute inset-x-3 bottom-full z-10 mb-2 max-h-72 animate-[ai-rise_160ms_ease-out_both] overflow-y-auto rounded-2xl border p-1.5"
    >
      <p className="text-muted px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
        {label}
      </p>
      {isPending && items.length === 0 ? (
        <p className="text-muted px-2.5 py-2 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted px-2.5 py-2 text-sm">{emptyText}</p>
      ) : (
        items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseEnter={() => onHover(index)}
            // mousedown, so the textarea keeps focus and the caret.
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(item);
            }}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm',
              index === activeIndex ? 'bg-subtle text-ink' : 'text-ink/80',
            )}
          >
            {render(item)}
          </button>
        ))
      )}
    </div>
  );
}

function ToolButton({ label, onClick, active, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active ?? undefined}
      title={label}
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40 sm:h-8 sm:w-8',
        active
          ? 'bg-danger/10 text-danger'
          : 'text-muted enabled:hover:bg-surface enabled:hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

export const IMAGE_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16'];
export const IMAGE_STYLE_OPTIONS = [
  { value: 'none', label: 'Any style' },
  { value: 'photo', label: 'Photo' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'illustration', label: 'Illustration' },
  { value: '3d', label: '3D render' },
  { value: 'poster', label: 'Poster' },
  { value: 'thumbnail', label: 'Thumbnail' },
  { value: 'logo', label: 'Logo' },
];

// Shape and style for "Create image", plus how many references the plan allows.
function ImageOptionsBar({ options, onChange, used, max }) {
  return (
    <div className="border-line/50 flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
      <div className="bg-surface/70 flex rounded-full p-0.5" role="group" aria-label="Image shape">
        {IMAGE_RATIOS.map((ratio) => (
          <button
            key={ratio}
            type="button"
            aria-pressed={options.aspectRatio === ratio}
            onClick={() => onChange({ ...options, aspectRatio: ratio })}
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums transition-colors',
              options.aspectRatio === ratio ? 'pill-active' : 'text-muted hover:text-ink',
            )}
          >
            {ratio}
          </button>
        ))}
      </div>
      <select
        value={options.style}
        onChange={(event) => onChange({ ...options, style: event.target.value })}
        aria-label="Image style"
        className="bg-surface/70 text-ink h-7 cursor-pointer rounded-full border-0 px-2.5 text-[11px] font-medium outline-none"
      >
        {IMAGE_STYLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span
        className={cn(
          'ml-auto text-[11px] tabular-nums',
          used >= max ? 'text-fuchsia-600 dark:text-fuchsia-300' : 'text-muted',
        )}
        title="Reference images your plan allows per request"
      >
        {used}/{max} reference {max === 1 ? 'image' : 'images'}
      </span>
    </div>
  );
}

// The question box. "/" picks a project (later questions only use its files),
// "@" attaches one file, "#" adds a saved note, the paperclip uploads new
// files for the assistant to study, and the microphone types what you say.
export function AiComposer({
  workspaceId,
  value,
  onChange,
  onSend,
  scope,
  onScope,
  attachments,
  onAttach,
  onRemoveAttachment,
  quote = null,
  onClearQuote,
  notes = [],
  onAddNote,
  onRemoveNote,
  skills = [],
  onAddSkill,
  onRemoveSkill,
  // "Create image" mode: attachments become reference images.
  imageMode = false,
  onImageMode,
  imageOptions,
  onImageOptions,
  maxAttachments = MAX_ATTACHMENTS,
  // The model switch, shown at the right of the toolbar.
  modelPicker = null,
  onUpload,
  canUpload,
  notice,
  disabled,
  busy,
  onStop,
  inputRef,
}) {
  const ownRef = useRef(null);
  const ref = inputRef ?? ownRef;
  const fileInput = useRef(null);
  const [caret, setCaret] = useState(0);
  const [dismissedAt, setDismissedAt] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dictation = useDictation({ value, onChange });
  const trigger = disabled ? null : triggerAt(value, caret);
  const pickerOpen = Boolean(trigger) && dismissedAt !== trigger.start;
  const full = attachments.length >= maxAttachments;
  // Photos from the camera attach like any uploaded file (reference images in image mode).
  const camera = useCamera((files) => addFiles(files), {
    maxShots: Math.max(1, maxAttachments - attachments.length),
  });
  const notesFull = notes.length >= MAX_NOTES;
  const skillsFull = skills.length >= MAX_SKILLS;
  const uploading = attachments.some((file) => file.status === 'uploading');
  const failedUpload = attachments.some((file) => file.status === 'error');

  const projectsQuery = useProjects(
    workspaceId,
    {},
    { enabled: (pickerOpen && trigger.kind === 'project') || Boolean(scope) },
  );
  const filesQuery = useAiFileSearch(
    workspaceId,
    {
      q: trigger?.kind === 'file' ? trigger.query : '',
      projectId: scope?.wholeDrive ? undefined : scope?.id,
    },
    { enabled: pickerOpen && trigger.kind === 'file' },
  );
  const notesQuery = useQuickNotes(
    workspaceId,
    { q: trigger?.kind === 'note' && trigger.query ? trigger.query : undefined },
    { enabled: pickerOpen && trigger.kind === 'note' },
  );

  const skillsQuery = useAiSkills(workspaceId, {
    enabled: Boolean(onAddSkill) && pickerOpen && trigger.kind === 'skill',
  });

  const matches = useMemo(() => {
    if (!trigger) return [];
    if (trigger.kind === 'skill') {
      const taken = new Set(skills.map((skill) => skill.id));
      const needle = trigger.query.toLowerCase();
      return (skillsQuery.data ?? [])
        .filter((skill) => !taken.has(skill.id))
        .filter(
          (skill) =>
            skill.name.toLowerCase().includes(needle) ||
            skill.description?.toLowerCase().includes(needle),
        )
        .slice(0, PICKER_LIMIT);
    }
    if (trigger.kind === 'note') {
      const taken = new Set(notes.map((note) => note.id));
      return (notesQuery.data ?? []).filter((note) => !taken.has(note.id)).slice(0, PICKER_LIMIT);
    }
    if (trigger.kind === 'file') {
      const taken = new Set(attachments.map((file) => file.id));
      return (filesQuery.data ?? [])
        .filter((file) => !taken.has(file.id) && (!imageMode || file.category === 'image'))
        .slice(0, PICKER_LIMIT);
    }
    const needle = trigger.query.toLowerCase();
    const projects = (projectsQuery.data ?? [])
      .filter((project) => project.title.toLowerCase().includes(needle))
      .slice(0, PICKER_LIMIT);
    // "Whole Drive" leads the "/" list (typing "//" picks it straight away).
    return imageMode || (needle && !'whole drive'.includes(needle))
      ? projects
      : [WHOLE_DRIVE, ...projects];
  }, [
    projectsQuery.data,
    filesQuery.data,
    notesQuery.data,
    skillsQuery.data,
    imageMode,
    trigger,
    attachments,
    notes,
    skills,
  ]);
  const active = Math.min(activeIndex, Math.max(matches.length - 1, 0));

  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
  }, [value, ref]);

  function trackCaret(event) {
    setCaret(event.target.selectionStart ?? event.target.value.length);
  }

  function pick(item) {
    // Take the "/name" or "@name" out of the question; a chip shows it instead.
    const before = value.slice(0, trigger.start);
    const after = value.slice(caret);
    onChange(`${before}${after}`.replace(/\s{2,}/g, ' ').trimStart());
    if (trigger.kind === 'project') onScope({ id: item.id, title: item.title });
    else if (trigger.kind === 'skill') {
      if (!skillsFull) onAddSkill?.({ id: item.id, name: item.name, emoji: item.emoji });
    } else if (trigger.kind === 'note') {
      if (!notesFull) onAddNote?.({ id: item.id, title: noteLabel(item) });
    } else if (!full) onAttach({ id: item.id, name: item.name, category: item.category });
    setActiveIndex(0);
    requestAnimationFrame(() => {
      const field = ref.current;
      if (!field) return;
      field.focus();
      const position = Math.min(before.length, field.value.length);
      field.setSelectionRange(position, position);
      setCaret(position);
    });
  }

  // The "@" and skill buttons: put the trigger at the caret, which opens its list.
  function startMention(symbol = '@') {
    const field = ref.current;
    if (!field) return;
    const at = field.selectionStart ?? value.length;
    const before = value.slice(0, at);
    const insert = before && !/\s$/.test(before) ? ` ${symbol}` : symbol;
    const next = `${before}${insert}${value.slice(at)}`;
    onChange(next);
    setDismissedAt(null);
    requestAnimationFrame(() => {
      field.focus();
      const position = at + insert.length;
      field.setSelectionRange(position, position);
      setCaret(position);
    });
  }

  function send() {
    if (busy || uploading) return;
    dictation.stop();
    onSend();
  }

  function onKeyDown(event) {
    if (pickerOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        if (matches.length) setActiveIndex((active + step + matches.length) % matches.length);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && matches[active]) {
        event.preventDefault();
        pick(matches[active]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setDismissedAt(trigger.start);
        return;
      }
    }
    if (event.key === 'Backspace' && !value) {
      if (skills.length) {
        onRemoveSkill?.(skills.at(-1).id);
        return;
      }
      if (notes.length) {
        onRemoveNote?.(notes.at(-1).id);
        return;
      }
      if (attachments.length) {
        onRemoveAttachment(attachments.at(-1).key);
        return;
      }
      if (scope) {
        onScope(null);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function addFiles(list) {
    const files = [...(list ?? [])];
    if (files.length) onUpload(files);
  }

  // An image needs a description; a question can be just attachments or notes.
  const canSend =
    !disabled &&
    !uploading &&
    (imageMode
      ? value.trim().length >= 3
      : value.trim() || attachments.length > 0 || notes.length > 0 || Boolean(quote));
  const placeholder = disabled
    ? 'Out of credits'
    : dictation.listening
      ? 'Listening… speak now'
      : imageMode
        ? attachments.length
          ? 'Describe what to make from the reference images…'
          : 'Describe the image you want to create…'
        : quote
          ? 'Ask about the quoted text…'
          : attachments.length
            ? 'Ask about the attached files…'
            : notes.length
              ? 'Ask about the added notes…'
              : scope?.wholeDrive
                ? 'Write a script, shot list… footage from your whole Drive is suggested'
                : scope
                  ? `Ask about ${scope.title}…`
                  : onAddSkill
                    ? 'Ask anything · // whole Drive · / project · @ file · # note · ! skill'
                    : 'Ask anything · // whole Drive · / project · @ file · # note';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      onDragOver={(event) => {
        if (!canUpload || disabled || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!canUpload || disabled) return;
        event.preventDefault();
        setDragging(false);
        addFiles(event.dataTransfer.files);
      }}
      className="relative px-3 pb-3 pt-2"
    >
      {pickerOpen &&
        (trigger.kind === 'skill' ? (
          onAddSkill && (
            <Picker
              label={skillsFull ? `Up to ${MAX_SKILLS} skills per question` : 'Use a skill'}
              emptyText={trigger.query ? 'No skills match' : 'No skills yet'}
              isPending={skillsQuery.isFetching}
              items={skillsFull ? [] : matches}
              activeIndex={active}
              onHover={setActiveIndex}
              onPick={pick}
              render={(skill) => (
                <>
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center text-[15px] leading-none"
                    aria-hidden="true"
                  >
                    {skill.emoji || <Wand2 className="text-muted h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{skill.name}</span>
                    {skill.description && (
                      <span className="text-muted block truncate text-xs">{skill.description}</span>
                    )}
                  </span>
                  {!skill.builtin && skill.visibility === 'workspace' && (
                    <span className="text-muted shrink-0 text-[11px]">Team</span>
                  )}
                </>
              )}
            />
          )
        ) : trigger.kind === 'note' ? (
          <Picker
            label={notesFull ? `Up to ${MAX_NOTES} notes per question` : 'Add a saved note'}
            emptyText={trigger.query ? 'No notes match' : 'No notes yet'}
            isPending={notesQuery.isFetching}
            items={notesFull ? [] : matches}
            activeIndex={active}
            onHover={setActiveIndex}
            onPick={pick}
            render={(note) => (
              <>
                <NotebookPen className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{noteLabel(note)}</span>
                {note.projects?.[0] && (
                  <span className="text-muted max-w-[40%] truncate text-xs">
                    {note.projects[0].title}
                  </span>
                )}
              </>
            )}
          />
        ) : trigger.kind === 'project' ? (
          <Picker
            label="Ask about one project"
            emptyText="No matching projects"
            isPending={projectsQuery.isPending}
            items={matches}
            activeIndex={active}
            onHover={setActiveIndex}
            onPick={pick}
            render={(project) => (
              <>
                {project.wholeDrive ? (
                  <HardDrive className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <FolderKanban className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate">{project.title}</span>
                {project.wholeDrive && (
                  <span className="text-muted shrink-0 text-xs">all footage & files · //</span>
                )}
                {project.client?.name && (
                  <span className="text-muted max-w-[40%] truncate text-xs">
                    {project.client.name}
                  </span>
                )}
              </>
            )}
          />
        ) : (
          <Picker
            label={
              full
                ? imageMode
                  ? `Up to ${maxAttachments} reference images on your plan`
                  : `Up to ${maxAttachments} files per question`
                : imageMode
                  ? 'Add a reference image'
                  : 'Attach a file'
            }
            emptyText={trigger.query ? 'No files with that name' : 'No files yet'}
            isPending={filesQuery.isFetching}
            items={full ? [] : matches}
            activeIndex={active}
            onHover={setActiveIndex}
            onPick={pick}
            render={(file) => (
              <>
                <FileKindIcon category={file.category} className="text-muted h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                {file.project && (
                  <span className="text-muted max-w-[40%] truncate text-xs">{file.project}</span>
                )}
              </>
            )}
          />
        ))}

      {(notice || dictation.error) && (
        <p role="alert" className="text-danger mb-1.5 px-1 text-xs">
          {dictation.error ?? notice}
        </p>
      )}

      <div
        className={cn(
          'bg-subtle border-line/60 rounded-[22px] border transition-shadow focus-within:border-fuchsia-400/50 focus-within:ring-4 focus-within:ring-fuchsia-500/10',
          dragging && 'border-fuchsia-400/70 ring-4 ring-fuchsia-500/15',
          dictation.listening && 'border-danger/40',
        )}
      >
        {imageMode && imageOptions && (
          <ImageOptionsBar
            options={imageOptions}
            onChange={onImageOptions}
            used={attachments.length}
            max={maxAttachments}
          />
        )}
        {quote && !imageMode && (
          <div className="px-3 pt-2.5">
            <QuoteBlock text={quote.text} onClear={onClearQuote} />
          </div>
        )}
        {(scope || attachments.length > 0 || notes.length > 0 || skills.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
            {scope && <ScopeChip project={scope} onClear={() => onScope(null)} />}
            {skills.map((skill) => (
              <SkillChip
                key={skill.id}
                skill={skill}
                onRemove={() => onRemoveSkill?.(skill.id)}
                className="animate-[pop-in_160ms_ease-out]"
              />
            ))}
            {notes.map((note) => (
              <NoteChip
                key={note.id}
                note={note}
                onRemove={() => onRemoveNote?.(note.id)}
                className="animate-[pop-in_160ms_ease-out]"
              />
            ))}
            {attachments.map((file) => (
              <FileChip
                key={file.key}
                file={file}
                onRemove={() => onRemoveAttachment(file.key)}
                className="animate-[pop-in_160ms_ease-out]"
              />
            ))}
          </div>
        )}
        <label htmlFor="ai-question" className="sr-only">
          Ask the AI assistant
        </label>
        <textarea
          id="ai-question"
          ref={ref}
          // No spell checking while chatting with the AI.
          spellCheck={false}
          autoCorrect="off"
          rows={1}
          value={value}
          maxLength={4000}
          disabled={disabled}
          role="combobox"
          aria-expanded={pickerOpen}
          aria-autocomplete="list"
          onChange={(event) => {
            const next = event.target.value;
            const at = event.target.selectionStart ?? next.length;
            // "//" turns into the Whole Drive chip.
            if (!imageMode && WHOLE_DRIVE_TRIGGER.test(next.slice(0, at))) {
              const before = next.slice(0, at - 2);
              const cleaned = `${before}${next.slice(at)}`.replace(/\s{2,}/g, ' ').trimStart();
              onChange(cleaned);
              onScope(WHOLE_DRIVE);
              setActiveIndex(0);
              const position = Math.min(before.trimStart().length, cleaned.length);
              requestAnimationFrame(() => {
                ref.current?.setSelectionRange(position, position);
                setCaret(position);
              });
              return;
            }
            onChange(next);
            trackCaret(event);
            setActiveIndex(0);
          }}
          onSelect={trackCaret}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            // Pasting a screenshot or file attaches it.
            if (!canUpload || !event.clipboardData.files.length) return;
            event.preventDefault();
            addFiles(event.clipboardData.files);
          }}
          placeholder={placeholder}
          className="placeholder:text-muted block max-h-40 min-h-11 w-full resize-none bg-transparent px-4 pb-1 pt-3 text-base outline-none disabled:opacity-60 sm:text-sm"
        />
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          {canUpload && (
            <>
              <ToolButton
                label={
                  full
                    ? `Up to ${maxAttachments} ${imageMode ? 'reference images' : 'files'}`
                    : imageMode
                      ? 'Upload reference images'
                      : 'Upload files for the AI to study'
                }
                onClick={() => fileInput.current?.click()}
                disabled={disabled || full}
              >
                <Paperclip className="h-4 w-4" aria-hidden="true" />
              </ToolButton>
              <ToolButton
                label={imageMode ? 'Take a reference photo' : 'Take a photo for the AI'}
                onClick={camera.open}
                disabled={disabled || full}
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
              </ToolButton>
              {camera.element}
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={imageMode ? IMAGE_ACCEPT : UPLOAD_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = '';
                }}
              />
            </>
          )}
          <ToolButton
            label="Attach a file you already uploaded"
            onClick={() => startMention('@')}
            disabled={disabled || full}
          >
            <AtSign className="h-4 w-4" aria-hidden="true" />
          </ToolButton>
          {onImageMode && (
            <button
              type="button"
              onClick={() => onImageMode(!imageMode)}
              aria-pressed={imageMode}
              disabled={disabled}
              title={imageMode ? 'Back to chat' : 'Create an image'}
              className={cn(
                'ml-0.5 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-all disabled:opacity-40',
                imageMode
                  ? cn(AI_GRADIENT, 'text-white shadow-sm shadow-fuchsia-500/30')
                  : 'text-muted hover:bg-surface hover:text-ink',
              )}
            >
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
              <span className={cn(!imageMode && 'hidden sm:inline')}>Image</span>
            </button>
          )}
          {onAddSkill && !imageMode && (
            <ToolButton
              label={skillsFull ? `Up to ${MAX_SKILLS} skills` : 'Use a skill'}
              onClick={() => startMention('!')}
              disabled={disabled || skillsFull}
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
          )}
          {dragging && (
            <span className="text-muted ml-1 truncate text-xs">Drop to upload and attach</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {modelPicker}
            {dictation.supported && (
              <ToolButton
                label={dictation.listening ? 'Stop dictation' : 'Dictate with your voice'}
                onClick={dictation.listening ? dictation.stop : dictation.start}
                active={dictation.listening}
                disabled={disabled}
              >
                {dictation.listening ? (
                  <span className="relative grid place-items-center">
                    <span className="bg-danger/30 absolute h-6 w-6 animate-ping rounded-full" />
                    <Mic className="relative h-4 w-4" aria-hidden="true" />
                  </span>
                ) : (
                  <Mic className="h-4 w-4" aria-hidden="true" />
                )}
              </ToolButton>
            )}
            {busy ? (
              // While an answer is being written, the button stops it.
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop the answer"
                title="Stop"
                className="bg-ink text-surface grid h-9 w-9 shrink-0 animate-[pop-in_160ms_ease-out] place-items-center rounded-full shadow-md transition-transform hover:scale-105 active:scale-95"
              >
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend || failedUpload}
                aria-label={uploading ? 'Waiting for the upload' : 'Send'}
                title={uploading ? 'Waiting for the upload to finish' : 'Send'}
                className={cn(
                  AI_GRADIENT,
                  'grid h-9 w-9 shrink-0 place-items-center rounded-full text-white shadow-md shadow-fuchsia-500/25 transition-all enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-35 disabled:shadow-none',
                )}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
