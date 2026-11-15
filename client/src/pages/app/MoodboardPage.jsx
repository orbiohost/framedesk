import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  BringToFront,
  Copy,
  Eraser,
  FolderKanban,
  Hand,
  Keyboard,
  Minus,
  MoveRight,
  MoveHorizontal,
  Tag,
  ImagePlus,
  Link2,
  Maximize,
  MousePointer2,
  Palette,
  Pencil,
  Redo2,
  Sparkles,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { AI_GRADIENT } from '../../features/ai/aiStyle.js';
import { useAiStatus } from '../../features/ai/hooks.js';
import { BoardCanvas } from '../../features/moodboards/BoardCanvas.jsx';
import {
  HEADING_SIZE,
  NOTE_COLORS,
  PEN_COLORS,
  PEN_WIDTHS,
  extractPalette,
  fitBox,
  headingBox,
  headingSize,
  hostOf,
  isUrl,
  mediaSize,
  newId,
  sketchSnapshot,
  topZ,
  uploadErrorText,
  uploadForBoard,
} from '../../features/moodboards/boardUtils.js';
import {
  boardKey,
  fetchUploadFolder,
  saveCanvas,
  useMoodboard,
  useUpdateMoodboard,
} from '../../features/moodboards/hooks.js';
import { MoodboardAiPanel } from '../../features/moodboards/MoodboardAiPanel.jsx';
import {
  ARROW_COLORS,
  ARROW_WIDTHS,
  connectorEnds,
  freezeEnds,
} from '../../features/moodboards/connectors.js';
import { fetchPreviewUrl, useUploads } from '../../features/files/hooks.js';
import { cancelUpload, resumeUpload } from '../../features/files/uploadStore.js';
import { useProjects } from '../../features/projects/hooks.js';
import { canEdit as canEditWorkspace } from '../../features/workspaces/roles.js';
import { ApiError, api } from '../../lib/apiClient.js';
import { cn } from '../../lib/cn.js';
import { isDarkTheme } from '../../lib/theme.js';
import { useDismiss } from '../../lib/useDismiss.js';

const HISTORY_LIMIT = 60;
// Board items copied with Ctrl+C travel as text with this prefix, so they can
// be pasted onto this or another board (and never become a sticky note).
const CLIPBOARD_PREFIX = 'framedesk-board-items:';
const SAVE_DELAY_MS = 900;
// What the server stores of an item (file details are looked up on read).
const SAVED_FIELDS = [
  'fontSize',
  'id',
  'type',
  'x',
  'y',
  'w',
  'h',
  'z',
  'fileId',
  'text',
  'color',
  'url',
  'title',
];

function forSaving(items, pending) {
  return items
    .filter(
      (item) => !pending.has(item.id) && !(['image', 'video'].includes(item.type) && !item.fileId),
    )
    .map((item) =>
      Object.fromEntries(
        SAVED_FIELDS.filter((key) => item[key] !== undefined).map((key) => [key, item[key]]),
      ),
    );
}

function ToolButton({ active, onClick, label, shortcut, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active ?? undefined}
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors disabled:opacity-30',
        active ? 'pill-active' : 'text-ink/75 hover:bg-subtle hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="bg-line mx-1 h-6 w-px shrink-0" aria-hidden="true" />;
}

function LinkInput({ onAdd, onClose }) {
  const [value, setValue] = useState('');
  const ref = useRef(null);
  useDismiss(ref, true, onClose);
  return (
    <form
      ref={ref}
      onSubmit={(event) => {
        event.preventDefault();
        if (isUrl(value)) onAdd(value.trim());
      }}
      className="bg-surface border-line shadow-lift absolute bottom-full left-1/2 mb-2 flex w-[min(22rem,90vw)] -translate-x-1/2 gap-2 rounded-2xl border p-2"
    >
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder="https://… (YouTube, Pinterest, Behance…)"
        aria-label="Link to add"
        className="border-line h-9 min-w-0 flex-1 rounded-full border px-3 text-sm"
      />
      <Button type="submit" size="sm" className="h-9" disabled={!isUrl(value)}>
        Add
      </Button>
    </form>
  );
}

function ProjectPicker({ workspace, board, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));
  const { data: projects = [] } = useProjects(workspace.id, {}, { enabled: open });
  const linked = new Set(board.projects.map((project) => project.id));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="border-line hover:bg-subtle inline-flex h-8 max-w-[14rem] items-center gap-1.5 rounded-full border px-3 text-xs disabled:opacity-60"
      >
        <FolderKanban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {board.projects.length
            ? board.projects.map((project) => project.title).join(', ')
            : 'Link to a project'}
        </span>
      </button>
      {open && (
        <div className="bg-surface border-line shadow-lift absolute right-0 top-full z-30 mt-2 max-h-72 w-64 overflow-y-auto rounded-2xl border p-1.5">
          {projects.length === 0 && <p className="text-muted px-2 py-2 text-xs">No projects yet</p>}
          {projects.map((project) => (
            <label
              key={project.id}
              className="hover:bg-subtle flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={linked.has(project.id)}
                onChange={() => {
                  const next = new Set(linked);
                  if (next.has(project.id)) next.delete(project.id);
                  else next.add(project.id);
                  onChange([...next]);
                }}
                className="accent-accent h-4 w-4"
              />
              <span className="truncate">{project.title}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const SHORTCUTS = [
  [
    'Tools',
    [
      ['V', 'Select & move'],
      ['H or hold Space', 'Pan'],
      ['P', 'Sketch (hold Shift for a straight line)'],
      ['E', 'Eraser'],
      ['A', 'Arrow (start or end on an item to connect it)'],
      ['Esc', 'Back to Select, clear selection'],
    ],
  ],
  [
    'Add',
    [
      ['N', 'Sticky note'],
      ['T', 'Heading'],
      ['C', 'Colour swatch'],
      ['L', 'Link'],
      ['I', 'Images or videos'],
      ['Ctrl+V', 'Paste images, videos, links or text'],
    ],
  ],
  [
    'Edit',
    [
      ['Alt + drag', 'Drag out a copy'],
      ['Shift + click', 'Select several'],
      ['Ctrl+A', 'Select all'],
      ['Ctrl+C / X / V', 'Copy, cut, paste items (also between boards)'],
      ['Ctrl+D', 'Duplicate'],
      ['Arrows (Shift: ×10)', 'Nudge'],
      ['Ctrl+] / Ctrl+[', 'Bring to front / send to back'],
      ['Shift + resize', 'Free the image shape'],
      ['Del', 'Delete'],
      ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
    ],
  ],
  [
    'View',
    [
      ['Ctrl + scroll or pinch', 'Zoom at the pointer'],
      ['Ctrl+= / Ctrl+-', 'Zoom in / out'],
      ['Ctrl+0 or Shift+1', 'Fit everything'],
      ['?', 'This list'],
    ],
  ],
];

function ShortcutHelp({ onClose }) {
  return (
    <div
      className="bg-surface border-line shadow-lift absolute bottom-20 right-4 z-30 max-h-[70%] w-[min(22rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border p-4"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">Keyboard shortcuts</p>
        <button type="button" onClick={onClose} className="text-muted hover:text-ink text-xs">
          Close
        </button>
      </div>
      {SHORTCUTS.map(([group, rows]) => (
        <div key={group} className="mt-3">
          <p className="text-muted mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
            {group}
          </p>
          <dl className="space-y-1 text-xs">
            {rows.map(([keys, label]) => (
              <div key={keys} className="flex justify-between gap-3">
                <dt className="text-ink/80">{label}</dt>
                <dd className="bg-subtle shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px]">
                  {keys}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

const HEADS = [
  ['end', 'Arrow at the end', MoveRight],
  ['both', 'Arrows at both ends', MoveHorizontal],
  ['none', 'Plain line', Minus],
];

function ArrowStyleControls({ style, onChange }) {
  return (
    <span className="flex items-center gap-1 px-1">
      {ARROW_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange({ color })}
          aria-label={`Arrow colour ${color}`}
          className={cn(
            'border-line h-5 w-5 shrink-0 rounded-full border',
            style.color === color && 'ring-accent ring-2 ring-offset-1',
          )}
          style={{ background: color }}
        />
      ))}
      {ARROW_WIDTHS.map((width) => (
        <button
          key={width}
          type="button"
          onClick={() => onChange({ width })}
          aria-label={`Arrow thickness ${width}`}
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-lg',
            style.width === width ? 'bg-subtle' : 'hover:bg-subtle',
          )}
        >
          <span className="bg-ink w-4 rounded-full" style={{ height: width }} />
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange({ dashed: !style.dashed })}
        aria-pressed={Boolean(style.dashed)}
        aria-label="Dashed line"
        title="Dashed line"
        className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[13px] font-bold tracking-tighter',
          style.dashed ? 'bg-subtle' : 'hover:bg-subtle',
        )}
      >
        ---
      </button>
      {HEADS.map(([head, label, Icon]) => (
        <button
          key={head}
          type="button"
          onClick={() => onChange({ head })}
          aria-pressed={(style.head ?? 'end') === head}
          aria-label={label}
          title={label}
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-lg',
            (style.head ?? 'end') === head ? 'bg-subtle' : 'hover:bg-subtle',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
    </span>
  );
}

function Editor({ workspace, board }) {
  const queryClient = useQueryClient();
  const editable = canEditWorkspace(workspace);
  const aiStatus = useAiStatus(workspace.id);
  const update = useUpdateMoodboard(workspace.id, board.id);
  const containerRef = useRef(null);
  const fileInput = useRef(null);
  // Ink that shows on the board: black on light, white on dark.
  const ink = isDarkTheme() ? '#ffffff' : PEN_COLORS[0];
  const [items, setItems] = useState(() => board.items);
  const [strokes, setStrokes] = useState(() => board.strokes);
  const [connectors, setConnectors] = useState(() => board.connectors ?? []);
  const [selectedConnector, setSelectedConnector] = useState(null);
  const [editingConnector, setEditingConnector] = useState(null);
  // How new arrows look (the last style picked).
  const [arrowStyle, setArrowStyle] = useState({
    color: ink,
    width: 2,
    dashed: false,
    head: 'end',
  });
  const [viewport, setViewport] = useState(() => board.viewport ?? { x: 80, y: 80, zoom: 1 });
  const [tool, setTool] = useState('select');
  const [pen, setPen] = useState({ color: ink, width: PEN_WIDTHS[1] });
  const [selection, setSelection] = useState(() => new Set());
  const [editingId, setEditingId] = useState(null);
  const [pending, setPending] = useState(() => new Map());
  const [linkOpen, setLinkOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const uploads = useUploads();
  const [saveState, setSaveState] = useState('saved'); // saved | dirty | saving | error
  const [notice, setNotice] = useState(null);
  const [title, setTitle] = useState(board.title);

  // The latest state, for handlers and timers that outlive a render.
  const live = useRef({ items, strokes, connectors, viewport, pending });
  useLayoutEffect(() => {
    live.current = { items, strokes, connectors, viewport, pending };
  });
  const [history, setHistory] = useState({ undo: false, redo: false });
  const saveRef = useRef(null);
  const version = useRef(board.version);
  const past = useRef([]);
  const future = useRef([]);
  const saveTimer = useRef(null);
  const saving = useRef(false);
  const folder = useRef(null);
  // The query's copy: title, projects, AI brief and chat (the canvas lives in state).
  const { data: boardData = board } = useMoodboard(workspace.id, board.id);

  // --- History and saving ------------------------------------------------
  const beginChange = useCallback(() => {
    past.current = [
      ...past.current.slice(-HISTORY_LIMIT + 1),
      {
        items: live.current.items,
        strokes: live.current.strokes,
        connectors: live.current.connectors,
      },
    ];
    future.current = [];
    setHistory({ undo: true, redo: false });
  }, []);

  const save = useCallback(async () => {
    if (saving.current) {
      saveTimer.current = setTimeout(() => saveRef.current(), 300);
      return;
    }
    saving.current = true;
    setSaveState('saving');
    const {
      items: currentItems,
      strokes: currentStrokes,
      connectors: currentConnectors,
      viewport: currentViewport,
      pending: currentPending,
    } = live.current;
    try {
      const result = await saveCanvas(workspace.id, board.id, {
        items: forSaving(currentItems, currentPending),
        strokes: currentStrokes,
        connectors: currentConnectors,
        viewport: currentViewport,
        version: version.current,
      });
      version.current = result.version;
      setSaveState((state) => (state === 'saving' ? 'saved' : state));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'BOARD_CHANGED') {
        // Someone else saved: take their board.
        const fresh = await queryClient.fetchQuery({
          queryKey: boardKey(workspace.id, board.id),
          queryFn: async () =>
            (await api.get(`/workspaces/${workspace.id}/moodboards/${board.id}`)).moodboard,
        });
        version.current = fresh.version;
        setItems(fresh.items);
        setStrokes(fresh.strokes);
        setConnectors(fresh.connectors ?? []);
        setNotice(error.message);
        setSaveState('saved');
      } else {
        setSaveState('error');
        setNotice(error.message);
      }
    } finally {
      saving.current = false;
    }
  }, [workspace.id, board.id, queryClient]);

  const commit = useCallback(() => {
    if (!editable) return;
    setSaveState('dirty');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveRef.current(), SAVE_DELAY_MS);
  }, [editable]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  // Unsaved changes: save before leaving, and warn if the tab closes.
  useEffect(() => {
    const warn = (event) => {
      if (saveState === 'dirty' || saveState === 'saving') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  function change(updater) {
    beginChange();
    updater();
    commit();
  }

  function undo() {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push({
      items: live.current.items,
      strokes: live.current.strokes,
      connectors: live.current.connectors,
    });
    setItems(previous.items);
    setStrokes(previous.strokes);
    setConnectors(previous.connectors ?? []);
    setHistory({ undo: past.current.length > 0, redo: true });
    commit();
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push({
      items: live.current.items,
      strokes: live.current.strokes,
      connectors: live.current.connectors,
    });
    setItems(next.items);
    setStrokes(next.strokes);
    setConnectors(next.connectors ?? []);
    setHistory({ undo: true, redo: future.current.length > 0 });
    commit();
  }

  // --- Adding things -----------------------------------------------------
  function viewCenter(offset = 0) {
    const rect = containerRef.current?.getBoundingClientRect() ?? { width: 800, height: 600 };
    const { x, y, zoom } = live.current.viewport;
    return { x: (rect.width / 2 - x) / zoom + offset, y: (rect.height / 2 - y) / zoom + offset };
  }

  function addItems(newItems) {
    change(() => setItems((current) => [...current, ...newItems]));
    setSelection(new Set(newItems.map((item) => item.id)));
    setTool('select');
  }

  function addNote(text = '', at = viewCenter()) {
    const z = topZ(live.current.items);
    const item = {
      id: newId(),
      type: 'note',
      x: Math.round(at.x - 100),
      y: Math.round(at.y - 80),
      w: 200,
      h: 160,
      z,
      text,
      color: NOTE_COLORS[0],
    };
    addItems([item]);
    if (!text) setEditingId(item.id);
  }

  function addText() {
    const at = viewCenter();
    const box = headingBox('Heading', HEADING_SIZE);
    const item = {
      id: newId(),
      type: 'text',
      x: Math.round(at.x - box.w / 2),
      y: Math.round(at.y - box.h / 2),
      w: box.w,
      h: box.h,
      z: topZ(live.current.items),
      text: '',
      fontSize: HEADING_SIZE,
    };
    addItems([item]);
    setEditingId(item.id);
  }

  function addColors(colors, at = viewCenter()) {
    let z = topZ(live.current.items);
    addItems(
      colors.map((color, index) => ({
        id: newId(),
        type: 'color',
        x: Math.round(at.x - (colors.length * 100) / 2 + index * 100),
        y: Math.round(at.y - 60),
        w: 88,
        h: 110,
        z: z++,
        color,
      })),
    );
  }

  function addLink(url, at = viewCenter()) {
    addItems([
      {
        id: newId(),
        type: 'link',
        x: Math.round(at.x - 140),
        y: Math.round(at.y - 100),
        w: 280,
        h: 200,
        z: topZ(live.current.items),
        url,
        title: hostOf(url),
      },
    ]);
    setLinkOpen(false);
  }

  async function addFiles(files, at = viewCenter()) {
    const media = files.filter(
      (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
    );
    if (media.length < files.length) setNotice('Only images and videos can go on a board.');
    if (!media.length || !editable) return;
    try {
      folder.current ??= await fetchUploadFolder(workspace.id);
    } catch (error) {
      setNotice(error.message);
      return;
    }
    let z = topZ(live.current.items);
    const entries = [];
    const newItems = [];
    const newPending = new Map(live.current.pending);
    for (const [index, file] of media.entries()) {
      const { width, height } = await mediaSize(file);
      const box = fitBox(width, height, file.type.startsWith('video/') ? 420 : 320);
      const localId = newId();
      const offset = index * 32;
      newItems.push({
        id: localId,
        type: file.type.startsWith('video/') ? 'video' : 'image',
        x: Math.round(at.x - box.w / 2 + offset),
        y: Math.round(at.y - box.h / 2 + offset),
        w: box.w,
        h: box.h + (file.type.startsWith('video/') ? 24 : 0),
        z: z++,
        fileId: null,
        file: { name: file.name, category: file.type.startsWith('video/') ? 'video' : 'image' },
      });
      newPending.set(localId, { localUrl: URL.createObjectURL(file) });
      entries.push({ localId, file });
    }
    setPending(newPending);
    addItems(newItems);
    uploadForBoard({
      workspaceId: workspace.id,
      folder: folder.current,
      entries,
      onStart: (localId, uploadId) =>
        setPending((current) =>
          current.has(localId)
            ? new Map(current).set(localId, { ...current.get(localId), uploadId })
            : current,
        ),
      onDone: (localId, fileId) => {
        if (!fileId) {
          setPending((current) =>
            new Map(current).set(localId, {
              ...current.get(localId),
              failed: 'Uploaded, but the file was not saved',
            }),
          );
          return;
        }
        setItems((current) =>
          current.map((item) => (item.id === localId ? { ...item, fileId } : item)),
        );
        setPending((current) => {
          const next = new Map(current);
          next.delete(localId);
          return next;
        });
        commit();
      },
    });
  }

  // Paste: images and videos upload; a link becomes a link card; text a note.
  useEffect(() => {
    if (!editable) return undefined;
    const onPaste = (event) => {
      if (event.target.closest?.('input, textarea, [contenteditable]')) return;
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length) {
        event.preventDefault();
        addFiles(files);
        return;
      }
      const text = event.clipboardData?.getData('text/plain')?.trim();
      if (!text) return;
      event.preventDefault();
      if (text.startsWith(CLIPBOARD_PREFIX)) {
        pasteItems(text.slice(CLIPBOARD_PREFIX.length));
        return;
      }
      if (isUrl(text)) addLink(text);
      else addNote(text.slice(0, 4000));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // --- Editing selection -------------------------------------------------
  const selectedItems = items.filter((item) => selection.has(item.id));
  const single = selectedItems.length === 1 ? selectedItems[0] : null;

  // Copy / cut: the selection as text, pasted back with new ids.
  useEffect(() => {
    const onCopy = (event) => {
      if (event.target.closest?.('input, textarea, [contenteditable]')) return;
      const chosen = live.current.items.filter(
        (item) => selection.has(item.id) && !live.current.pending.has(item.id),
      );
      if (!chosen.length) return;
      event.preventDefault();
      const payload = JSON.stringify({ workspaceId: workspace.id, items: chosen });
      event.clipboardData.setData('text/plain', CLIPBOARD_PREFIX + payload);
      if (event.type === 'cut' && editable) removeSelected();
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCopy);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCopy);
    };
  });

  function pasteItems(json) {
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      return;
    }
    // Files belong to their workspace; from another one only the rest comes over.
    const sameWorkspace = data.workspaceId === workspace.id;
    const source = (Array.isArray(data.items) ? data.items : []).filter(
      (item) => sameWorkspace || !item.fileId,
    );
    if (!source.length) return;
    let z = topZ(live.current.items);
    // Pasted copies go to the middle of the view, keeping their layout.
    const minX = Math.min(...source.map((item) => item.x));
    const minY = Math.min(...source.map((item) => item.y));
    const center = viewCenter();
    const width = Math.max(...source.map((item) => item.x + item.w)) - minX;
    const height = Math.max(...source.map((item) => item.y + item.h)) - minY;
    addItems(
      source.map((item) => ({
        ...item,
        id: newId(),
        x: Math.round(center.x - width / 2 + (item.x - minX)),
        y: Math.round(center.y - height / 2 + (item.y - minY)),
        z: z++,
      })),
    );
  }

  function nudge(dx, dy) {
    if (!selection.size) return;
    change(() =>
      setItems((current) =>
        current.map((item) =>
          selection.has(item.id) ? { ...item, x: item.x + dx, y: item.y + dy } : item,
        ),
      ),
    );
  }

  function sendToBack() {
    const low = Math.min(0, ...items.map((item) => item.z ?? 0)) - selection.size;
    let z = low;
    change(() =>
      setItems((current) =>
        current.map((item) => (selection.has(item.id) ? { ...item, z: z++ } : item)),
      ),
    );
  }

  function removeItem(id) {
    const upload = pending.get(id)?.uploadId;
    if (upload) cancelUpload(upload);
    setPending((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
    removeItems(new Set([id]));
  }

  function removeItems(ids) {
    change(() => {
      setConnectors((current) => freezeEnds(current, live.current.items, ids));
      setItems((current) => current.filter((item) => !ids.has(item.id)));
    });
  }

  function removeSelected() {
    if (selectedConnector) {
      removeConnector(selectedConnector);
      return;
    }
    if (!selection.size) return;
    removeItems(new Set(selection));
    setSelection(new Set());
  }

  function removeConnector(id) {
    change(() => setConnectors((current) => current.filter((connector) => connector.id !== id)));
    setSelectedConnector(null);
  }

  function patchConnector(id, patch) {
    change(() =>
      setConnectors((current) =>
        current.map((connector) => (connector.id === id ? { ...connector, ...patch } : connector)),
      ),
    );
  }

  // The arrow style buttons: change the selected arrow, and new ones after it.
  function changeArrowStyle(patch) {
    setArrowStyle((current) => ({ ...current, ...patch }));
    if (selectedConnector) patchConnector(selectedConnector, patch);
  }

  function duplicateSelected() {
    let z = topZ(items);
    const copies = selectedItems
      .filter((item) => !pending.has(item.id))
      .map((item) => ({ ...item, id: newId(), x: item.x + 24, y: item.y + 24, z: z++ }));
    if (copies.length) addItems(copies);
  }

  function bringToFront() {
    let z = topZ(items);
    change(() =>
      setItems((current) =>
        current.map((item) => (selection.has(item.id) ? { ...item, z: z++ } : item)),
      ),
    );
  }

  function patchItem(id, patch) {
    change(() =>
      setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item))),
    );
  }

  async function paletteFrom(item) {
    try {
      const url = await fetchPreviewUrl(workspace.id, item.fileId);
      const colors = await extractPalette(url, 5);
      addColors(colors, { x: item.x + item.w / 2, y: item.y + item.h + 90 });
    } catch {
      setNotice('Could not read the colours of this image.');
    }
  }

  // --- View --------------------------------------------------------------
  const zoomBy = (factor) => {
    const rect = containerRef.current.getBoundingClientRect();
    const { x, y, zoom } = live.current.viewport;
    const next = Math.min(4, Math.max(0.1, zoom * factor));
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setViewport({ zoom: next, x: cx - ((cx - x) * next) / zoom, y: cy - ((cy - y) * next) / zoom });
  };

  const fit = useCallback(() => {
    const { items: currentItems, strokes: currentStrokes } = live.current;
    const xs = [];
    const ys = [];
    currentItems.forEach((item) => {
      xs.push(item.x, item.x + item.w);
      ys.push(item.y, item.y + item.h);
    });
    currentStrokes.forEach((stroke) => {
      for (let i = 0; i < stroke.points.length; i += 2) {
        xs.push(stroke.points[i]);
        ys.push(stroke.points[i + 1]);
      }
    });
    if (!xs.length || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(...xs) - minX;
    const height = Math.max(...ys) - minY;
    const zoom = Math.min(
      2,
      Math.max(0.1, Math.min((rect.width - 120) / width, (rect.height - 160) / height)),
    );
    setViewport({
      zoom,
      x: (rect.width - width * zoom) / 2 - minX * zoom,
      y: (rect.height - height * zoom) / 2 - minY * zoom,
    });
  }, []);

  // First open with no saved view: show everything.
  useEffect(() => {
    if (
      !board.viewport ||
      (board.viewport.x === 0 && board.viewport.y === 0 && board.viewport.zoom === 1)
    )
      fit();
  }, [board.viewport, fit]);

  // --- Keyboard ----------------------------------------------------------
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, [contenteditable]')) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (!editable) return;
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        if (editable) redo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        if (editable) duplicateSelected();
        return;
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelection(new Set(live.current.items.map((item) => item.id)));
        return;
      }
      if (mod && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        zoomBy(1.25);
        return;
      }
      if (mod && event.key === '-') {
        event.preventDefault();
        zoomBy(1 / 1.25);
        return;
      }
      if (mod && event.key === '0') {
        event.preventDefault();
        fit();
        return;
      }
      if (mod && event.key === ']' && editable) {
        event.preventDefault();
        bringToFront();
        return;
      }
      if (mod && event.key === '[' && editable) {
        event.preventDefault();
        sendToBack();
        return;
      }
      if (mod) return;
      const arrows = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (arrows[event.key] && selection.size && editable) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        nudge(arrows[event.key][0] * step, arrows[event.key][1] * step);
        return;
      }
      if (event.key === '?') {
        setHelpOpen((open) => !open);
        return;
      }
      if (event.key === '!' || (event.shiftKey && event.code === 'Digit1')) {
        fit();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && editable) {
        // (an arrow is removed if one is selected)
        event.preventDefault();
        removeSelected();
        return;
      }
      const tools = { v: 'select', h: 'hand', p: 'pen', e: 'eraser', a: 'arrow' };
      const key = event.key.toLowerCase();
      if (tools[key]) setTool(editable || key === 'v' || key === 'h' ? tools[key] : 'hand');
      else if (key === 'n' && editable) addNote();
      else if (key === 't' && editable) addText();
      else if (key === 'l' && editable) setLinkOpen(true);
      else if (key === 'c' && editable) addColors(['#8b54e8']);
      else if (key === 'i' && editable) fileInput.current.click();
      else if (key === 'escape') {
        setSelection(new Set());
        setSelectedConnector(null);
        setEditingId(null);
        setTool('select');
        setHelpOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Uploads in progress, as the board shows them (progress and errors come
  // from the upload queue, so the tray and the board always agree).
  const uploadById = new Map(uploads.map((upload) => [upload.id, upload]));
  const pendingView = new Map(
    [...pending].map(([id, entry]) => {
      const upload = entry.uploadId ? uploadById.get(entry.uploadId) : null;
      return [
        id,
        {
          localUrl: entry.localUrl,
          uploadId: entry.uploadId,
          progress: upload?.size ? upload.uploadedBytes / upload.size : 0,
          saving: Boolean(upload?.saving),
          error:
            entry.failed ?? (upload?.status === 'error' ? uploadErrorText(upload.error) : null),
        },
      ];
    }),
  );

  // --- Render ------------------------------------------------------------
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const chosenConnector = connectors.find((connector) => connector.id === selectedConnector);
  const connectorBar =
    chosenConnector && editable && !editingConnector
      ? (() => {
          const { start, end } = connectorEnds(chosenConnector, itemsById);
          const midX = viewport.x + ((start.x + end.x) / 2) * viewport.zoom;
          const topY = viewport.y + Math.min(start.y, end.y) * viewport.zoom - 52;
          return (
            <div
              className="bg-surface border-line shadow-lift absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border p-1"
              style={{ left: Math.max(180, midX), top: Math.max(8, topY) }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <ArrowStyleControls style={chosenConnector} onChange={changeArrowStyle} />
              <ToolButton label="Label" onClick={() => setEditingConnector(chosenConnector.id)}>
                <Tag className="h-4 w-4" aria-hidden="true" />
              </ToolButton>
              <ToolButton
                label="Delete arrow"
                shortcut="Del"
                onClick={() => removeConnector(chosenConnector.id)}
              >
                <Trash2 className="text-danger h-4 w-4" aria-hidden="true" />
              </ToolButton>
            </div>
          );
        })()
      : null;

  const selectionBar =
    single && editable && !editingId ? (
      <div
        className="bg-surface border-line shadow-lift absolute z-20 flex items-center gap-0.5 rounded-xl border p-1"
        style={{
          left: Math.max(8, viewport.x + single.x * viewport.zoom),
          top: Math.max(8, viewport.y + single.y * viewport.zoom - 48),
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {single.type === 'note' &&
          NOTE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => patchItem(single.id, { color })}
              aria-label={`Note colour ${color}`}
              className={cn(
                'border-line mx-0.5 h-5 w-5 rounded-full border',
                single.color === color && 'ring-accent ring-2',
              )}
              style={{ background: color }}
            />
          ))}
        {single.type === 'image' && single.fileId && (
          <ToolButton label="Pull colours from this image" onClick={() => paletteFrom(single)}>
            <Palette className="h-4 w-4" aria-hidden="true" />
          </ToolButton>
        )}
        {(single.type === 'note' || single.type === 'text') && (
          <ToolButton label="Edit text" onClick={() => setEditingId(single.id)}>
            <Type className="h-4 w-4" aria-hidden="true" />
          </ToolButton>
        )}
        <ToolButton label="Bring to front" onClick={bringToFront}>
          <BringToFront className="h-4 w-4" aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Duplicate" shortcut="Ctrl+D" onClick={duplicateSelected}>
          <Copy className="h-4 w-4" aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Delete" shortcut="Del" onClick={removeSelected}>
          <Trash2 className="text-danger h-4 w-4" aria-hidden="true" />
        </ToolButton>
      </div>
    ) : null;

  const toolbar = (
    <div
      className="absolute inset-x-0 bottom-4 z-20 flex justify-center px-3"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="bg-surface border-line shadow-lift relative flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl border p-1.5">
        <ToolButton
          label="Select & move"
          shortcut="V"
          active={tool === 'select'}
          onClick={() => setTool('select')}
        >
          <MousePointer2 className="h-4 w-4" aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="Pan"
          shortcut="H or Space"
          active={tool === 'hand'}
          onClick={() => setTool('hand')}
        >
          <Hand className="h-4 w-4" aria-hidden="true" />
        </ToolButton>
        {editable && (
          <>
            <ToolButton
              label="Sketch"
              shortcut="P"
              active={tool === 'pen'}
              onClick={() => setTool('pen')}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
            <ToolButton
              label="Eraser"
              shortcut="E"
              active={tool === 'eraser'}
              onClick={() => setTool('eraser')}
            >
              <Eraser className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
            <ToolButton
              label="Arrow"
              shortcut="A"
              active={tool === 'arrow'}
              onClick={() => setTool('arrow')}
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
            {tool === 'arrow' && (
              <ArrowStyleControls style={arrowStyle} onChange={changeArrowStyle} />
            )}
            {tool === 'pen' && (
              <span className="flex items-center gap-1 px-1">
                {PEN_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setPen((current) => ({ ...current, color }))}
                    aria-label={`Pen colour ${color}`}
                    className={cn(
                      'border-line h-5 w-5 shrink-0 rounded-full border',
                      pen.color === color && 'ring-accent ring-2 ring-offset-1',
                    )}
                    style={{ background: color }}
                  />
                ))}
                {PEN_WIDTHS.map((width) => (
                  <button
                    key={width}
                    type="button"
                    onClick={() => setPen((current) => ({ ...current, width }))}
                    aria-label={`Pen size ${width}`}
                    className={cn(
                      'grid h-7 w-7 shrink-0 place-items-center rounded-lg',
                      pen.width === width ? 'bg-subtle' : 'hover:bg-subtle',
                    )}
                  >
                    <span
                      className="bg-ink rounded-full"
                      style={{ width: Math.min(16, width + 2), height: Math.min(16, width + 2) }}
                    />
                  </button>
                ))}
              </span>
            )}
            <Divider />
            <ToolButton label="Sticky note" shortcut="N" onClick={() => addNote()}>
              <StickyNote className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
            <ToolButton label="Heading" shortcut="T" onClick={addText}>
              <Type className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
            <ToolButton label="Colour swatch" onClick={() => addColors(['#8b54e8'])}>
              <Palette className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
            <ToolButton
              label="Link (YouTube, Pinterest…)"
              active={linkOpen}
              onClick={() => setLinkOpen(!linkOpen)}
            >
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
            <ToolButton
              label="Add images or videos (or paste / drop them)"
              onClick={() => fileInput.current.click()}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
            <Divider />
            <ToolButton label="Undo" shortcut="Ctrl+Z" onClick={undo} disabled={!history.undo}>
              <Undo2 className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
            <ToolButton
              label="Redo"
              shortcut="Ctrl+Shift+Z"
              onClick={redo}
              disabled={!history.redo}
            >
              <Redo2 className="h-4 w-4" aria-hidden="true" />
            </ToolButton>
          </>
        )}
        <Divider />
        <ToolButton label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </ToolButton>
        <span className="text-muted w-11 shrink-0 text-center text-xs tabular-nums">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <ToolButton label="Zoom in" onClick={() => zoomBy(1.25)}>
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </ToolButton>
        <ToolButton label="Fit everything" shortcut="Shift+1" onClick={fit}>
          <Maximize className="h-4 w-4" aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="Keyboard shortcuts"
          shortcut="?"
          active={helpOpen}
          onClick={() => setHelpOpen(!helpOpen)}
        >
          <Keyboard className="h-4 w-4" aria-hidden="true" />
        </ToolButton>
        {linkOpen && <LinkInput onAdd={(url) => addLink(url)} onClose={() => setLinkOpen(false)} />}
      </div>
    </div>
  );

  const empty = items.length === 0 && strokes.length === 0 && (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
      <div className="max-w-sm text-center">
        <p className="font-display text-2xl">Start your moodboard</p>
        <p className="text-muted mt-2 text-sm leading-6">
          {editable
            ? 'Paste or drop images and videos (several at once), add notes, colours and links, or sketch with the pen. Then ask the AI to turn it into a brief.'
            : 'Nothing on this board yet.'}
        </p>
      </div>
    </div>
  );

  const saveLabel = {
    saved: 'Saved',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    error: 'Not saved',
  }[saveState];

  return (
    <div className="bg-surface border-line/60 shadow-soft flex h-[calc(100dvh-9rem)] min-h-[28rem] flex-col overflow-hidden rounded-3xl border lg:h-[calc(100dvh-8rem)]">
      <header className="border-line/70 flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Link
          to={`/w/${workspace.id}/moodboards`}
          className="text-muted hover:bg-subtle hover:text-ink grid h-8 w-8 place-items-center rounded-full"
          aria-label="All moodboards"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <input
          value={title}
          disabled={!editable}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() =>
            title.trim() && title !== board.title && update.mutate({ title: title.trim() })
          }
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          maxLength={160}
          aria-label="Board name"
          className="font-display hover:bg-subtle focus:bg-subtle min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-lg outline-none sm:text-xl"
        />
        <span
          className={cn(
            'hidden text-xs sm:inline',
            saveState === 'error' ? 'text-danger' : 'text-muted',
          )}
          aria-live="polite"
        >
          {editable ? saveLabel : 'View only'}
        </span>
        <ProjectPicker
          workspace={workspace}
          board={boardData}
          disabled={!editable}
          onChange={(projectIds) => update.mutate({ projectIds })}
        />
        {aiStatus.data?.enabled && (
          <button
            type="button"
            onClick={() => setAiOpen(!aiOpen)}
            className={cn(
              AI_GRADIENT,
              'inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold text-white shadow-sm',
            )}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            AI brief
          </button>
        )}
      </header>
      {notice && (
        <Alert tone="error" className="m-2 mb-0">
          <span className="flex items-center justify-between gap-3">
            {notice}
            <button type="button" className="text-xs underline" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </span>
        </Alert>
      )}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <BoardCanvas
            workspaceId={workspace.id}
            containerRef={containerRef}
            items={items}
            strokes={strokes}
            connectors={connectors}
            viewport={viewport}
            onViewport={setViewport}
            tool={tool}
            onToolDone={() => setTool('select')}
            pen={pen}
            arrowStyle={arrowStyle}
            selectedConnector={selectedConnector}
            onSelectConnector={setSelectedConnector}
            editingConnector={editingConnector}
            onEditConnector={setEditingConnector}
            onConnectorLabelDone={(id, label) => {
              setEditingConnector(null);
              const connector = live.current.connectors.find((candidate) => candidate.id === id);
              if (connector && (connector.label ?? '') !== label) patchConnector(id, { label });
            }}
            onConnectorsLive={setConnectors}
            readOnly={!editable}
            selection={selection}
            onSelect={setSelection}
            editingId={editingId}
            onEdit={setEditingId}
            pending={pendingView}
            onRetryUpload={resumeUpload}
            onRemoveItem={removeItem}
            onBeginChange={beginChange}
            onItemsLive={setItems}
            onStrokesLive={setStrokes}
            onCommit={commit}
            onTextDone={(id, text) => {
              setEditingId(null);
              const item = live.current.items.find((candidate) => candidate.id === id);
              if (!item) return;
              if (item.type === 'text') {
                // An empty heading goes away; a written one hugs its words.
                if (!text.trim()) {
                  removeItems(new Set([id]));
                  return;
                }
                const fontSize = headingSize(item);
                const box = headingBox(text, fontSize);
                if (item.text !== text || item.w !== box.w || item.h !== box.h) {
                  patchItem(id, { text, fontSize, w: box.w, h: box.h });
                }
              } else if (item.text !== text) {
                patchItem(id, { text });
              }
            }}
            onColorChange={(id, color) => patchItem(id, { color })}
            onDropFiles={(files, at) => addFiles(files, at)}
            overlay={
              <>
                {empty}
                {selectionBar}
                {connectorBar}
                {toolbar}
                {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
              </>
            }
          />
        </div>
        {aiOpen && (
          <div className="absolute inset-0 z-30 sm:static sm:z-auto">
            <MoodboardAiPanel
              workspaceId={workspace.id}
              board={boardData}
              canEdit={editable}
              getSketch={() => sketchSnapshot(live.current.strokes)}
              onAddPalette={(colors) => addColors(colors)}
              onClose={() => setAiOpen(false)}
            />
          </div>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(event) => {
          addFiles([...event.target.files]);
          event.target.value = '';
        }}
      />
    </div>
  );
}

export function MoodboardPage() {
  const { workspace } = useOutletContext();
  const { boardId } = useParams();
  const { data: board, isPending, isError, error } = useMoodboard(workspace.id, boardId);
  const ready = useMemo(() => board && board.id === boardId, [board, boardId]);

  if (isPending) return <Skeleton className="h-[70vh] w-full rounded-3xl" />;
  if (isError) return <Alert tone="error">{error.message}</Alert>;
  if (!ready) return null;
  return <Editor key={board.id} workspace={workspace} board={board} />;
}
