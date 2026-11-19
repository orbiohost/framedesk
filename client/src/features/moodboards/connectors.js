// Arrows between things on the board (as in Excalidraw). An end is either
// stuck to an item ({ itemId }) and follows it, or a free point ({ x, y }).
// Stuck ends meet the item's edge, aimed at the other end.
import { shapeEdgeScale } from './shapes.jsx';

export const ARROW_COLORS = [
  '#16151b',
  '#8b54e8',
  '#e5484d',
  '#f5a623',
  '#30a46c',
  '#0090ff',
  '#ffffff',
];
export const ARROW_WIDTHS = [2, 4, 6];
const GAP = 6;

// The topmost item under a board point (headings and notes included).
export function itemAt(items, x, y, { except } = {}) {
  let found = null;
  for (const item of items) {
    if (item.id === except) continue;
    const inside = x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h;
    if (inside && (!found || (item.z ?? 0) >= (found.z ?? 0))) found = item;
  }
  return found;
}

function center(item) {
  return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
}

// Where a line from the item's centre towards `target` leaves its box (plus a gap).
function edgePoint(item, target) {
  const c = center(item);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const halfW = item.w / 2 + GAP;
  const halfH = item.h / 2 + GAP;
  // Ellipses and diamonds: the arrow meets their outline, not their box.
  const scale = shapeEdgeScale(item, dx, dy, halfW, halfH);
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

/** The two drawn ends of a connector: { start, end } in board coordinates. */
export function connectorEnds(connector, itemsById) {
  const a = connector.from.itemId ? itemsById.get(connector.from.itemId) : null;
  const b = connector.to.itemId ? itemsById.get(connector.to.itemId) : null;
  const rawA = a ? center(a) : connector.from;
  const rawB = b ? center(b) : connector.to;
  return {
    start: a && a !== b ? edgePoint(a, rawB) : { x: rawA.x, y: rawA.y },
    end: b && a !== b ? edgePoint(b, rawA) : { x: rawB.x, y: rawB.y },
  };
}

// A filled triangle at `tip`, pointing away from `from`.
export function arrowHead(from, tip, width) {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const size = 8 + width * 2.5;
  const spread = Math.PI / 7;
  const left = {
    x: tip.x - size * Math.cos(angle - spread),
    y: tip.y - size * Math.sin(angle - spread),
  };
  const right = {
    x: tip.x - size * Math.cos(angle + spread),
    y: tip.y - size * Math.sin(angle + spread),
  };
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

// The line stops short of a head, so a thick line doesn't poke through its tip.
export function shortened(from, to, by) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length <= by) return to;
  return { x: to.x - ((to.x - from.x) / length) * by, y: to.y - ((to.y - from.y) / length) * by };
}

/** Every arrow end stuck to one of `ids` becomes a free point where it is now. */
export function freezeEnds(connectors, items, ids) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return connectors.map((connector) => {
    if (!ids.has(connector.from.itemId) && !ids.has(connector.to.itemId)) return connector;
    const { start, end } = connectorEnds(connector, itemsById);
    return {
      ...connector,
      from: ids.has(connector.from.itemId)
        ? { itemId: null, x: start.x, y: start.y }
        : connector.from,
      to: ids.has(connector.to.itemId) ? { itemId: null, x: end.x, y: end.y } : connector.to,
    };
  });
}
