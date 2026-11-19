// Shapes on the board (as in Excalidraw): a rectangle, ellipse or diamond
// drawn by dragging, with an outline, an optional fill and text inside.

export const SHAPE_KINDS = ['rect', 'ellipse', 'diamond'];
export const SHAPE_STROKES = [
  '#16151b',
  '#8b54e8',
  '#e5484d',
  '#f5a623',
  '#30a46c',
  '#0090ff',
  '#ffffff',
];
// null: no fill (the board shows through).
export const SHAPE_FILLS = [null, '#ffc9c9', '#ffec99', '#b2f2bb', '#a5d8ff', '#e5dbff', '#f1f3f5'];
export const SHAPE_WIDTHS = [1, 2, 4];
export const SHAPE_STROKE_STYLES = ['solid', 'dashed', 'dotted'];
export const SHAPE_FONT_SIZES = [
  ['S', 16],
  ['M', 20],
  ['L', 28],
  ['XL', 40],
];
export const SHAPE_DEFAULT_SIZE = { w: 180, h: 110 };

export function shapeFontSize(item) {
  return item.fontSize ?? 20;
}

// Text inside a light fill stays readable when the outline is white (dark theme).
export function shapeTextColor(item) {
  const color = item.color ?? '#16151b';
  if (item.fill && color.toLowerCase() === '#ffffff') return '#16151b';
  return color;
}

// How far the text sits from the box edge, so it stays inside the shape.
export function shapeTextInset(item) {
  if (item.shape === 'diamond') return { x: item.w * 0.22, y: item.h * 0.22 };
  if (item.shape === 'ellipse') return { x: item.w * 0.15, y: item.h * 0.15 };
  return { x: 10, y: 8 };
}

function dashFor(style, width) {
  if (style === 'dashed') return `${width * 4} ${width * 3}`;
  // Zero-length dashes with round caps draw as dots.
  if (style === 'dotted') return `0 ${width * 2.5}`;
  return undefined;
}

/** The outline and fill of a shape, filling a w x h box. */
export function ShapeOutline({ shape, w, h, color, fill, strokeWidth, strokeStyle, rounded }) {
  const width = strokeWidth ?? 2;
  const inset = width / 2;
  const common = {
    stroke: color ?? '#16151b',
    strokeWidth: width,
    fill: fill ?? 'none',
    strokeDasharray: dashFor(strokeStyle, width),
    strokeLinecap: 'round',
    strokeLinejoin: rounded === false ? 'miter' : 'round',
  };
  const innerW = Math.max(0, w - width);
  const innerH = Math.max(0, h - width);
  let body;
  if (shape === 'ellipse') {
    body = <ellipse cx={w / 2} cy={h / 2} rx={innerW / 2} ry={innerH / 2} {...common} />;
  } else if (shape === 'diamond') {
    body = (
      <polygon
        points={`${w / 2},${inset} ${w - inset},${h / 2} ${w / 2},${h - inset} ${inset},${h / 2}`}
        {...common}
      />
    );
  } else {
    const radius = rounded === false ? 0 : Math.min(24, Math.min(w, h) * 0.12);
    body = (
      <rect
        x={inset}
        y={inset}
        width={innerW}
        height={innerH}
        rx={radius}
        ry={radius}
        {...common}
      />
    );
  }
  return (
    <svg
      width={w}
      height={h}
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}

/** Where a line from the shape's centre in direction (dx, dy) meets its outline. */
export function shapeEdgeScale(item, dx, dy, halfW, halfH) {
  if (item.type === 'shape' && item.shape === 'ellipse') {
    return 1 / Math.hypot(dx / halfW, dy / halfH);
  }
  if (item.type === 'shape' && item.shape === 'diamond') {
    return 1 / (Math.abs(dx) / halfW + Math.abs(dy) / halfH);
  }
  return 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
}
