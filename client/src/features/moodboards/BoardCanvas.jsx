import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { BoardItem } from './BoardItem.jsx';
import { headingSize, newId, strokeHit, strokePath, topZ } from './boardUtils.js';
import { arrowHead, connectorEnds, itemAt, shortened } from './connectors.js';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const clampZoom = (zoom) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

// One arrow: a wide invisible line to click, the drawn line, its heads and label.
function Connector({
  connector,
  ends,
  selected,
  editing,
  zoom,
  onPointerDown,
  onDoubleClick,
  onEndPointerDown,
  onLabelDone,
  readOnly,
}) {
  const { start, end } = ends;
  const width = connector.width ?? 2;
  const headSize = 8 + width * 2.5;
  const lineStart = connector.head === 'both' ? shortened(end, start, headSize * 0.7) : start;
  const lineEnd = connector.head !== 'none' ? shortened(start, end, headSize * 0.7) : end;
  const path = `M${lineStart.x} ${lineStart.y} L${lineEnd.x} ${lineEnd.y}`;
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const handle = 6 / zoom;
  return (
    <g>
      {selected && (
        <path
          d={path}
          stroke="#8b54e8"
          strokeOpacity={0.35}
          strokeWidth={width + 8}
          fill="none"
          strokeLinecap="round"
        />
      )}
      <path
        d={path}
        stroke={connector.color}
        strokeWidth={width}
        strokeDasharray={connector.dashed ? `${width * 3} ${width * 2.5}` : undefined}
        strokeLinecap="round"
        fill="none"
      />
      {connector.head !== 'none' && (
        <polygon points={arrowHead(start, end, width)} fill={connector.color} />
      )}
      {connector.head === 'both' && (
        <polygon points={arrowHead(end, start, width)} fill={connector.color} />
      )}
      {/* What is clicked: wider than the line, so thin arrows are easy to pick. */}
      <path
        d={`M${start.x} ${start.y} L${end.x} ${end.y}`}
        stroke="transparent"
        strokeWidth={Math.max(14, width + 10) / zoom}
        fill="none"
        style={{ pointerEvents: 'stroke', cursor: readOnly ? 'default' : 'pointer' }}
        onPointerDown={(event) => onPointerDown(event, connector)}
        onDoubleClick={() => onDoubleClick(connector)}
      />
      {(connector.label || editing) && (
        <foreignObject
          x={mid.x - 120}
          y={mid.y - 16}
          width={240}
          height={32}
          style={{ overflow: 'visible' }}
        >
          <div className="flex h-full items-center justify-center">
            {editing ? (
              <input
                autoFocus
                defaultValue={connector.label}
                maxLength={300}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
                }}
                onBlur={(event) => onLabelDone(connector.id, event.target.value.trim())}
                className="bg-surface border-accent h-7 w-48 rounded-md border px-2 text-center text-xs outline-none"
              />
            ) : (
              <span
                onPointerDown={(event) => onPointerDown(event, connector)}
                onDoubleClick={() => onDoubleClick(connector)}
                className="bg-bg text-ink max-w-[240px] truncate rounded-md px-1.5 py-0.5 text-xs"
                style={{ pointerEvents: 'auto' }}
              >
                {connector.label}
              </span>
            )}
          </div>
        </foreignObject>
      )}
      {selected &&
        !readOnly &&
        [
          ['from', start],
          ['to', end],
        ].map(([which, point]) => (
          <circle
            key={which}
            cx={point.x}
            cy={point.y}
            r={handle}
            fill="#ffffff"
            stroke="#8b54e8"
            strokeWidth={2 / zoom}
            style={{ pointerEvents: 'all', cursor: 'crosshair' }}
            onPointerDown={(event) => onEndPointerDown(event, connector, which)}
          />
        ))}
    </g>
  );
}

/**
 * The infinite canvas: items, arrows and the sketch layer in board
 * coordinates, under a pan/zoom transform. It owns gestures (pan, pinch, move,
 * resize, draw, erase, arrows) and reports changes up; the editor owns the data.
 *
 * tool: 'select' | 'hand' | 'pen' | 'eraser' | 'arrow'
 */
export function BoardCanvas({
  workspaceId,
  items,
  strokes,
  connectors,
  viewport,
  onViewport,
  tool,
  onToolDone,
  pen,
  arrowStyle,
  readOnly,
  selection,
  onSelect,
  selectedConnector,
  onSelectConnector,
  editingId,
  onEdit,
  editingConnector,
  onEditConnector,
  onConnectorLabelDone,
  pending,
  onBeginChange,
  onItemsLive,
  onStrokesLive,
  onConnectorsLive,
  onCommit,
  onTextDone,
  onColorChange,
  onDropFiles,
  onRetryUpload,
  onRemoveItem,
  containerRef,
  overlay,
}) {
  const gesture = useRef(null);
  const pointers = useRef(new Map());
  const [draft, setDraft] = useState(null); // the stroke being drawn
  const [arrowDraft, setArrowDraft] = useState(null); // the arrow being drawn
  const [hoverId, setHoverId] = useState(null); // item an arrow would stick to
  const [spaceHeld, setSpaceHeld] = useState(false);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const itemsById = new Map(items.map((item) => [item.id, item]));

  const toWorld = useCallback(
    (clientX, clientY) => {
      const rect = containerRef.current.getBoundingClientRect();
      const { x, y, zoom } = viewportRef.current;
      return { x: (clientX - rect.left - x) / zoom, y: (clientY - rect.top - y) / zoom };
    },
    [containerRef],
  );

  // Space held: the hand, as in design tools.
  useEffect(() => {
    const down = (event) => {
      if (event.code !== 'Space' || event.target.closest?.('input, textarea, [contenteditable]'))
        return;
      event.preventDefault();
      setSpaceHeld(true);
    };
    const up = (event) => event.code === 'Space' && setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Wheel: scroll pans, Ctrl/⌘ + wheel (and trackpad pinch) zooms at the pointer.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const { x, y, zoom } = viewportRef.current;
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const next = clampZoom(zoom * Math.exp(-event.deltaY * 0.0025));
        onViewport({
          zoom: next,
          x: px - ((px - x) * next) / zoom,
          y: py - ((py - y) * next) / zoom,
        });
      } else {
        onViewport({ zoom, x: x - event.deltaX, y: y - event.deltaY });
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [containerRef, onViewport]);

  function capture(event) {
    containerRef.current.setPointerCapture?.(event.pointerId);
  }

  function startPinch() {
    const [a, b] = [...pointers.current.values()];
    const { x, y, zoom } = viewportRef.current;
    gesture.current = {
      mode: 'pinch',
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      start: { x, y, zoom },
    };
    setDraft(null);
    setArrowDraft(null);
  }

  // An arrow end: stuck to the item under the point, or free.
  function endAt(world, except) {
    const hit = itemAt(items, world.x, world.y, { except });
    return hit
      ? { itemId: hit.id, x: world.x, y: world.y }
      : { itemId: null, x: world.x, y: world.y };
  }

  function onPointerDown(event) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) return startPinch();
    if (event.button === 2) return;
    capture(event);
    const panning = tool === 'hand' || spaceHeld || event.button === 1;
    const world = toWorld(event.clientX, event.clientY);
    if (!panning && !readOnly && tool === 'pen') {
      gesture.current = { mode: 'draw' };
      setDraft({ color: pen.color, width: pen.width, points: [world.x, world.y] });
      return;
    }
    if (!panning && !readOnly && tool === 'eraser') {
      onBeginChange();
      gesture.current = { mode: 'erase', changed: false };
      erase(world);
      return;
    }
    if (!panning && !readOnly && tool === 'arrow') {
      const from = endAt(world);
      gesture.current = { mode: 'arrow', start: world };
      setArrowDraft({
        ...arrowStyle,
        id: 'draft',
        from,
        to: { itemId: null, x: world.x, y: world.y },
      });
      return;
    }
    // Empty canvas: clear the selection and pan.
    if (!event.shiftKey) {
      onSelect(new Set());
      onSelectConnector(null);
    }
    gesture.current = {
      mode: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...viewportRef.current },
    };
  }

  function erase(world) {
    const radius = 8 / viewportRef.current.zoom;
    const kept = strokes.filter((stroke) => !strokeHit(stroke, world.x, world.y, radius));
    if (kept.length !== strokes.length) {
      gesture.current.changed = true;
      onStrokesLive(kept);
    }
  }

  // Item pressed (select tool): select it and start moving the selection.
  function onItemPointerDown(event, item, { force = false } = {}) {
    if (tool !== 'select' || spaceHeld || event.button !== 0) return; // canvas handles it
    event.stopPropagation();
    if (editingId === item.id) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    onSelectConnector(null);
    const next = new Set(event.shiftKey ? selection : []);
    if (event.shiftKey && selection.has(item.id)) next.delete(item.id);
    else next.add(item.id);
    if (!event.shiftKey && selection.has(item.id)) {
      selection.forEach((id) => next.add(id));
    }
    onSelect(next);
    if (readOnly) return;
    // Videos and links move by their handle only (their body is clickable).
    if (!force && (item.type === 'video' || item.type === 'link')) return;
    capture(event);
    onBeginChange();
    let moving = items.filter((candidate) => next.has(candidate.id));
    // Alt + drag: drag out copies and leave the originals where they were.
    if (event.altKey) {
      let z = topZ(items);
      const copies = moving
        .filter((candidate) => !pending.has(candidate.id))
        .map((candidate) => ({ ...candidate, id: newId(), z: z++ }));
      if (copies.length) {
        onItemsLive([...items, ...copies]);
        onSelect(new Set(copies.map((copy) => copy.id)));
        moving = copies;
      }
    }
    const world = toWorld(event.clientX, event.clientY);
    gesture.current = {
      mode: 'move',
      start: world,
      origins: new Map(moving.map((c) => [c.id, { x: c.x, y: c.y }])),
      // A copy counts as a change even if it isn't moved.
      moved: event.altKey,
    };
  }

  // Arrow pressed (select tool): select it; free ends move with the pointer.
  function onConnectorPointerDown(event, connector) {
    if (tool !== 'select' || spaceHeld || event.button !== 0) return;
    event.stopPropagation();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    onSelect(new Set());
    onSelectConnector(connector.id);
    if (readOnly || (connector.from.itemId && connector.to.itemId)) return;
    capture(event);
    onBeginChange();
    gesture.current = {
      mode: 'moveConnector',
      id: connector.id,
      start: toWorld(event.clientX, event.clientY),
      origin: { from: connector.from, to: connector.to },
      moved: false,
    };
  }

  // An end handle pressed: drag it somewhere else, or onto an item to stick it there.
  function onEndPointerDown(event, connector, which) {
    event.stopPropagation();
    if (readOnly) return;
    capture(event);
    onBeginChange();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current = { mode: 'endpoint', id: connector.id, which };
  }

  function onResizeStart(event, item) {
    event.stopPropagation();
    capture(event);
    onBeginChange();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current = {
      mode: 'resize',
      id: item.id,
      start: toWorld(event.clientX, event.clientY),
      origin: { w: item.w, h: item.h, fontSize: item.type === 'text' ? headingSize(item) : null },
      // Pictures and headings keep their shape (Shift frees pictures).
      aspect: ['image', 'video', 'text'].includes(item.type) ? item.w / item.h : null,
      text: item.type === 'text',
    };
  }

  function onPointerMove(event) {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const current = gesture.current;
    if (!current) return;
    if (current.mode === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = containerRef.current.getBoundingClientRect();
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const zoom = clampZoom((current.start.zoom * distance) / current.distance);
      const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      const startMid = { x: current.mid.x - rect.left, y: current.mid.y - rect.top };
      const worldX = (startMid.x - current.start.x) / current.start.zoom;
      const worldY = (startMid.y - current.start.y) / current.start.zoom;
      onViewport({ zoom, x: mid.x - worldX * zoom, y: mid.y - worldY * zoom });
      return;
    }
    if (current.mode === 'pan') {
      onViewport({
        zoom: current.origin.zoom,
        x: current.origin.x + event.clientX - current.startX,
        y: current.origin.y + event.clientY - current.startY,
      });
      return;
    }
    const world = toWorld(event.clientX, event.clientY);
    if (current.mode === 'draw') {
      setDraft((stroke) => {
        if (!stroke) return stroke;
        // Shift: a straight line from where the stroke began.
        if (event.shiftKey) {
          return { ...stroke, points: [stroke.points[0], stroke.points[1], world.x, world.y] };
        }
        const lastX = stroke.points.at(-2);
        const lastY = stroke.points.at(-1);
        // Skip points closer than a pixel or two on screen: smaller, smoother strokes.
        if (Math.hypot(world.x - lastX, world.y - lastY) < 1.5 / viewportRef.current.zoom) {
          return stroke;
        }
        return { ...stroke, points: [...stroke.points, world.x, world.y] };
      });
    } else if (current.mode === 'erase') {
      erase(world);
    } else if (current.mode === 'arrow') {
      if (!arrowDraft) return;
      const hit = itemAt(items, world.x, world.y, { except: arrowDraft.from.itemId });
      setHoverId(hit?.id ?? null);
      setArrowDraft({ ...arrowDraft, to: { itemId: hit?.id ?? null, x: world.x, y: world.y } });
    } else if (current.mode === 'endpoint') {
      const connector = connectors.find((candidate) => candidate.id === current.id);
      const other = current.which === 'from' ? connector?.to : connector?.from;
      const hit = itemAt(items, world.x, world.y, { except: other?.itemId });
      setHoverId(hit?.id ?? null);
      onConnectorsLive(
        connectors.map((candidate) =>
          candidate.id === current.id
            ? { ...candidate, [current.which]: { itemId: null, x: world.x, y: world.y } }
            : candidate,
        ),
      );
    } else if (current.mode === 'moveConnector') {
      const dx = world.x - current.start.x;
      const dy = world.y - current.start.y;
      current.moved = current.moved || Math.abs(dx) + Math.abs(dy) > 1;
      const shift = (end) => (end.itemId ? end : { ...end, x: end.x + dx, y: end.y + dy });
      onConnectorsLive(
        connectors.map((candidate) =>
          candidate.id === current.id
            ? { ...candidate, from: shift(current.origin.from), to: shift(current.origin.to) }
            : candidate,
        ),
      );
    } else if (current.mode === 'move') {
      const dx = world.x - current.start.x;
      const dy = world.y - current.start.y;
      current.moved = current.moved || Math.abs(dx) + Math.abs(dy) > 1;
      onItemsLive(
        items.map((item) => {
          const origin = current.origins.get(item.id);
          return origin
            ? { ...item, x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) }
            : item;
        }),
      );
    } else if (current.mode === 'resize') {
      let w = Math.max(current.text ? 24 : 40, current.origin.w + world.x - current.start.x);
      let h = Math.max(current.text ? 16 : 32, current.origin.h + world.y - current.start.y);
      if (current.aspect && (current.text || !event.shiftKey)) h = w / current.aspect;
      // Headings: the type grows and shrinks with the box.
      const fontSize = current.text
        ? Math.max(8, Math.min(600, Math.round((current.origin.fontSize * w) / current.origin.w)))
        : undefined;
      onItemsLive(
        items.map((item) =>
          item.id === current.id
            ? { ...item, w: Math.round(w), h: Math.round(h), ...(fontSize && { fontSize }) }
            : item,
        ),
      );
    }
  }

  function onPointerUp(event) {
    pointers.current.delete(event.pointerId);
    const current = gesture.current;
    if (!current) return;
    if (current.mode === 'pinch') {
      if (pointers.current.size < 2) gesture.current = null;
      return;
    }
    gesture.current = null;
    setHoverId(null);
    if (current.mode === 'draw' && draft && draft.points.length >= 2) {
      onBeginChange();
      onStrokesLive([...strokes, { ...draft, id: crypto.randomUUID().slice(0, 16) }]);
      setDraft(null);
      onCommit();
    } else if (current.mode === 'arrow' && arrowDraft) {
      const world = toWorld(event.clientX, event.clientY);
      const long = Math.hypot(world.x - current.start.x, world.y - current.start.y) > 8;
      const to = arrowDraft.to;
      // A click without a drag makes no arrow; neither does an item to itself.
      if (long && !(to.itemId && to.itemId === arrowDraft.from.itemId)) {
        const id = newId();
        onBeginChange();
        onConnectorsLive([...connectors, { ...arrowDraft, id, label: '' }]);
        onSelect(new Set());
        onSelectConnector(id);
        onCommit();
        onToolDone();
      }
      setArrowDraft(null);
    } else if (current.mode === 'endpoint') {
      const world = toWorld(event.clientX, event.clientY);
      const connector = connectors.find((candidate) => candidate.id === current.id);
      if (connector) {
        const other = current.which === 'from' ? connector.to : connector.from;
        const end = endAt(world, other.itemId);
        onConnectorsLive(
          connectors.map((candidate) =>
            candidate.id === current.id ? { ...candidate, [current.which]: end } : candidate,
          ),
        );
      }
      onCommit();
    } else if (current.mode === 'erase') {
      if (current.changed) onCommit();
    } else if (current.mode === 'moveConnector') {
      if (current.moved) onCommit();
    } else if (current.mode === 'move' || current.mode === 'resize') {
      if (current.mode === 'resize' || current.moved) onCommit();
    }
    setDraft(null);
  }

  function onDragOver(event) {
    if (readOnly || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
  }

  function onDrop(event) {
    if (readOnly || !event.dataTransfer.files.length) return;
    event.preventDefault();
    onDropFiles([...event.dataTransfer.files], toWorld(event.clientX, event.clientY));
  }

  const { x, y, zoom } = viewport;
  const cursor =
    tool === 'hand' || spaceHeld
      ? gesture.current?.mode === 'pan'
        ? 'cursor-grabbing'
        : 'cursor-grab'
      : tool === 'pen' || tool === 'arrow'
        ? 'cursor-crosshair'
        : tool === 'eraser'
          ? 'cursor-cell'
          : 'cursor-default';
  // Dots that move and scale with the board, so panning feels like moving paper.
  const grid = 24 * zoom;
  const shown = arrowDraft ? [...connectors, arrowDraft] : connectors;

  return (
    <div
      ref={containerRef}
      className={cn('relative h-full w-full touch-none select-none overflow-hidden', cursor)}
      style={{
        backgroundImage: 'radial-gradient(rgb(var(--color-ink) / 0.12) 1px, transparent 1px)',
        backgroundSize: `${grid}px ${grid}px`,
        backgroundPosition: `${x}px ${y}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})` }}
      >
        {items.map((item) => (
          <BoardItem
            key={item.id}
            workspaceId={workspaceId}
            item={item}
            selected={selection.has(item.id)}
            highlighted={hoverId === item.id}
            editing={editingId === item.id}
            pending={pending.get(item.id)}
            readOnly={readOnly}
            onPointerDown={onItemPointerDown}
            onResizeStart={onResizeStart}
            onDoubleClick={(target) =>
              !readOnly && ['note', 'text'].includes(target.type) && onEdit(target.id)
            }
            onTextDone={(text) => onTextDone(item.id, text)}
            onColorChange={(color) => onColorChange(item.id, color)}
            onRetryUpload={onRetryUpload}
            onRemove={onRemoveItem}
          />
        ))}
        {/* Arrows above the items, the sketch layer above everything. */}
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width="1"
          height="1"
          style={{ zIndex: 999_999 }}
          aria-hidden="true"
        >
          {shown.map((connector) => (
            <Connector
              key={connector.id}
              connector={connector}
              ends={connectorEnds(connector, itemsById)}
              selected={selectedConnector === connector.id}
              editing={editingConnector === connector.id}
              zoom={zoom}
              readOnly={readOnly}
              onPointerDown={onConnectorPointerDown}
              onDoubleClick={(target) => !readOnly && onEditConnector(target.id)}
              onEndPointerDown={onEndPointerDown}
              onLabelDone={onConnectorLabelDone}
            />
          ))}
        </svg>
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width="1"
          height="1"
          style={{ zIndex: 1_000_000 }}
          aria-hidden="true"
        >
          {[...strokes, ...(draft ? [draft] : [])].map((stroke, index) => (
            <path
              key={stroke.id ?? `draft-${index}`}
              d={strokePath(stroke.points)}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      </div>
      {overlay}
    </div>
  );
}
