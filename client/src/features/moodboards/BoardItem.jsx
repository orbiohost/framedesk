import { ExternalLink, Globe, GripHorizontal, ImageOff, Play, RotateCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { fetchPreviewUrl } from '../files/hooks.js';
import { headingBox, headingSize, hostOf, youtubeId } from './boardUtils.js';

// A signed link to a board file (cached and batched by the files feature).
export function useFileUrl(workspaceId, fileId) {
  const [state, setState] = useState({ url: null, error: false });
  useEffect(() => {
    if (!fileId) return undefined;
    let live = true;
    fetchPreviewUrl(workspaceId, fileId)
      .then((url) => live && setState({ url, error: false }))
      .catch(() => live && setState({ url: null, error: true }));
    return () => {
      live = false;
    };
  }, [workspaceId, fileId]);
  return state;
}

function Missing({ label }) {
  return (
    <div className="bg-subtle text-muted grid h-full w-full place-items-center rounded-[inherit] text-xs">
      <span className="flex flex-col items-center gap-1 px-2 text-center">
        <ImageOff className="h-5 w-5" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}

function ImageContent({ workspaceId, item, localUrl }) {
  const { url, error } = useFileUrl(workspaceId, localUrl ? null : item.fileId);
  const src = localUrl ?? url;
  if (!src) {
    if (error || (item.fileId && !item.file && !localUrl))
      return <Missing label="Image not available" />;
    return <div className="bg-subtle h-full w-full animate-pulse rounded-[inherit]" />;
  }
  return (
    <img
      src={src}
      alt={item.file?.name ?? ''}
      draggable={false}
      className="pointer-events-none h-full w-full select-none rounded-[inherit] object-cover"
    />
  );
}

// Videos play in place; the strip on top is what moves them.
function VideoContent({ workspaceId, item, localUrl, onGrab }) {
  const { url } = useFileUrl(workspaceId, localUrl ? null : item.fileId);
  const src = localUrl ?? url;
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[inherit] bg-black">
      <div
        onPointerDown={onGrab}
        className="flex h-6 shrink-0 cursor-grab items-center gap-1.5 bg-black/80 px-2 text-[11px] text-white/80"
      >
        <GripHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="truncate">{item.file?.name ?? 'Video'}</span>
      </div>
      {src ? (
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          className="min-h-0 flex-1 bg-black object-contain"
        />
      ) : item.fileId && !item.file && !localUrl ? (
        <Missing label="Video not available" />
      ) : (
        <div className="grid flex-1 place-items-center">
          <Play className="h-6 w-6 text-white/50" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function LinkContent({ item, onGrab }) {
  const video = youtubeId(item.url);
  return (
    <div className="bg-surface border-line flex h-full w-full flex-col overflow-hidden rounded-[inherit] border">
      <div
        onPointerDown={onGrab}
        className="text-muted flex h-6 shrink-0 cursor-grab items-center gap-1.5 px-2 text-[11px]"
      >
        <GripHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="truncate">{hostOf(item.url)}</span>
      </div>
      {video ? (
        <div className="relative min-h-0 flex-1">
          <img
            src={`https://img.youtube.com/vi/${video}/hqdefault.jpg`}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
          />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white">
              <Play className="h-5 w-5" aria-hidden="true" />
            </span>
          </span>
        </div>
      ) : (
        <div className="text-muted grid min-h-0 flex-1 place-items-center">
          <Globe className="h-6 w-6" aria-hidden="true" />
        </div>
      )}
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer noopener"
        onPointerDown={(event) => event.stopPropagation()}
        className="border-line hover:bg-subtle flex shrink-0 items-center gap-1.5 border-t px-2 py-1.5 text-xs"
      >
        <span className="min-w-0 flex-1 truncate font-medium">{item.title || item.url}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </a>
    </div>
  );
}

function TextEditor({ item, onDone, className, style }) {
  const ref = useRef(null);
  const [value, setValue] = useState(item.text ?? '');
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') ref.current.blur();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      maxLength={4000}
      className={cn('h-full w-full resize-none bg-transparent outline-none', className)}
      style={style}
    />
  );
}

function textStyle(item) {
  return { fontSize: headingSize(item), lineHeight: 1.1, padding: '4px 6px' };
}

// Typing a heading: the box grows with the words (one line per Enter, no wrapping).
function HeadingEditor({ item, onDone }) {
  const ref = useRef(null);
  const [value, setValue] = useState(item.text ?? '');
  const fontSize = headingSize(item);
  const box = headingBox(value || ' ', fontSize);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      wrap="off"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') ref.current.blur();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      maxLength={4000}
      placeholder="Heading"
      className="font-display absolute left-0 top-0 resize-none overflow-hidden bg-transparent outline-none"
      style={{
        ...textStyle(item),
        width: Math.max(box.w, 40),
        height: box.h,
        color: item.color ?? undefined,
      }}
    />
  );
}

/**
 * One item on the board, in board coordinates. The canvas handles moving and
 * resizing; onGrab starts a move from a handle (videos and links, whose body
 * is clickable).
 */
export function BoardItem({
  workspaceId,
  item,
  selected,
  editing,
  pending,
  readOnly,
  onPointerDown,
  onResizeStart,
  onDoubleClick,
  onTextDone,
  onColorChange,
  onRetryUpload,
  onRemove,
  highlighted,
}) {
  const style = {
    transform: `translate(${item.x}px, ${item.y}px)`,
    width: item.w,
    height: item.h,
    zIndex: item.z ?? 0,
  };
  const grab = (event) => onPointerDown(event, item, { force: true });

  let content;
  if (item.type === 'image') {
    content = <ImageContent workspaceId={workspaceId} item={item} localUrl={pending?.localUrl} />;
  } else if (item.type === 'video') {
    content = (
      <VideoContent
        workspaceId={workspaceId}
        item={item}
        localUrl={pending?.localUrl}
        onGrab={grab}
      />
    );
  } else if (item.type === 'link') {
    content = <LinkContent item={item} onGrab={grab} />;
  } else if (item.type === 'note') {
    content = (
      <div
        className="h-full w-full overflow-hidden rounded-[inherit] p-3 text-[14px] leading-snug text-[#16151b] shadow-md"
        style={{ background: item.color ?? '#fef3a8' }}
      >
        {editing ? (
          <TextEditor item={item} onDone={onTextDone} />
        ) : (
          <p className="whitespace-pre-wrap break-words">
            {item.text || <span className="opacity-40">Double-click to write</span>}
          </p>
        )}
      </div>
    );
  } else if (item.type === 'text') {
    content = editing ? (
      <HeadingEditor item={item} onDone={onTextDone} />
    ) : (
      <p
        className="font-display h-full w-full overflow-hidden whitespace-pre"
        style={{ ...textStyle(item), color: item.color ?? undefined }}
      >
        {item.text || <span className="opacity-40">Heading</span>}
      </p>
    );
  } else if (item.type === 'color') {
    content = (
      <div className="bg-surface flex h-full w-full flex-col overflow-hidden rounded-[inherit] shadow-md">
        <div className="min-h-0 flex-1" style={{ background: item.color ?? '#8b54e8' }} />
        <label
          className="flex shrink-0 cursor-pointer items-center justify-between gap-1 px-2 py-1.5 font-mono text-[11px] uppercase"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {item.color}
          {!readOnly && (
            <input
              type="color"
              value={item.color ?? '#8b54e8'}
              onChange={(event) => onColorChange(event.target.value)}
              className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
              aria-label="Change colour"
            />
          )}
        </label>
      </div>
    );
  }

  return (
    <div
      data-board-item={item.id}
      onPointerDown={(event) => onPointerDown(event, item)}
      onDoubleClick={() => onDoubleClick(item)}
      className={cn(
        'absolute left-0 top-0',
        item.type === 'text' ? 'rounded-md' : 'rounded-xl',
        !readOnly && 'cursor-move',
        // A thin outline hugging the item; an arrow about to stick to it glows.
        selected && 'outline-accent outline outline-[1.5px] outline-offset-2',
        highlighted && !selected && 'outline-accent/60 outline outline-2 outline-offset-4',
      )}
      style={style}
    >
      {content}
      {pending && !pending.error && (
        // Upload progress: a bar along the bottom and the percentage.
        <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-black/25">
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {pending.saving ? 'Saving…' : `Uploading ${Math.round((pending.progress ?? 0) * 100)}%`}
          </span>
          <span className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-white/30">
            <span
              className="bg-accent block h-full rounded-full transition-[width] duration-300"
              style={{ width: `${Math.max(3, (pending.progress ?? 0) * 100)}%` }}
            />
          </span>
        </span>
      )}
      {pending?.error && (
        <span
          className="bg-danger/90 absolute inset-x-0 bottom-0 flex items-start gap-2 rounded-b-[inherit] px-2 py-1.5 text-[11px] leading-snug text-white"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="min-w-0 flex-1">{pending.error}</span>
          {pending.uploadId && (
            <button
              type="button"
              onClick={() => onRetryUpload(pending.uploadId)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30"
            >
              <RotateCw className="h-3 w-3" aria-hidden="true" /> Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label="Remove"
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20 hover:bg-white/30"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      )}
      {selected && !readOnly && (
        <span
          onPointerDown={(event) => onResizeStart(event, item)}
          className="border-accent bg-surface absolute -bottom-[7px] -right-[7px] h-2.5 w-2.5 cursor-nwse-resize rounded-sm border-[1.5px]"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
