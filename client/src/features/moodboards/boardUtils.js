import { addUploads, getSnapshot, subscribe } from '../files/uploadStore.js';

export const NOTE_COLORS = ['#fef3a8', '#fcd5e5', '#d6ecff', '#d9f5dd', '#ece0ff', '#ffffff'];
export const PEN_COLORS = [
  '#16151b',
  '#8b54e8',
  '#e5484d',
  '#f5a623',
  '#30a46c',
  '#0090ff',
  '#ffffff',
];
export const PEN_WIDTHS = [2, 4, 8, 16];

export function newId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export function topZ(items) {
  return items.reduce((max, item) => Math.max(max, item.z ?? 0), 0) + 1;
}

export function isUrl(text) {
  return /^https?:\/\/\S+$/i.test(String(text ?? '').trim());
}

export function youtubeId(url) {
  const match = String(url ?? '').match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i,
  );
  return match?.[1] ?? null;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Width and height of an image or video file before it is uploaded, for its aspect.
export function mediaSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (width, height) => {
      URL.revokeObjectURL(url);
      resolve(width && height ? { width, height } : { width: 640, height: 480 });
    };
    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => done(video.videoWidth, video.videoHeight);
      video.onerror = () => done();
      video.src = url;
    } else {
      const image = new Image();
      image.onload = () => done(image.naturalWidth, image.naturalHeight);
      image.onerror = () => done();
      image.src = url;
    }
  });
}

// Fits a w x h box inside max x max, keeping its shape.
export function fitBox(width, height, max = 360) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    w: Math.max(40, Math.round(width * scale)),
    h: Math.max(40, Math.round(height * scale)),
  };
}

/**
 * Uploads files through the normal upload queue (resumable, shown in the
 * upload tray). onStart(localId, uploadId) as each starts; onDone(localId,
 * fileId) when stored. Failures stay in the queue (their progress and error
 * are read from it), so a retried upload still lands on the board.
 * `entries`: [{ localId, file }]. Returns a function that stops listening.
 */
export async function uploadForBoard({ workspaceId, folder, entries, onStart, onDone }) {
  const uploadIds = await addUploads({
    workspaceId,
    projectId: null,
    folderId: folder.id,
    folderName: folder.name,
    files: entries.map((entry) => entry.file),
  });
  const waiting = new Map(uploadIds.map((uploadId, index) => [uploadId, entries[index].localId]));
  for (const [uploadId, localId] of waiting) onStart(localId, uploadId);
  const check = () => {
    const present = new Set();
    for (const item of getSnapshot()) {
      present.add(item.id);
      const localId = waiting.get(item.id);
      if (!localId || item.status !== 'done') continue;
      waiting.delete(item.id);
      onDone(localId, item.fileId ?? null);
    }
    // Cancelled from the tray or the board: nothing left to wait for.
    for (const uploadId of waiting.keys()) if (!present.has(uploadId)) waiting.delete(uploadId);
    if (waiting.size === 0) unsubscribe();
  };
  const unsubscribe = subscribe(check);
  check();
  return unsubscribe;
}

// What a failed board upload says. Direct uploads need the storage bucket to
// allow this address (its CORS rule); on a local copy that is the usual cause.
export function uploadErrorText(message) {
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (message?.startsWith('Connection lost')) {
    return local
      ? 'Storage refused this address. Add it to the S3 bucket CORS rule, or try on the live site.'
      : 'Could not reach storage. Check the connection and retry.';
  }
  return message ?? 'Upload failed';
}

// A few dominant colours of an image (simple bucketed counting, then the most
// common distinct ones). The image must be readable (CORS) to draw.
export async function extractPalette(url, count = 5) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read this image'));
    img.src = url;
  });
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += data[i];
    bucket.g += data[i + 1];
    bucket.b += data[i + 2];
    bucket.n += 1;
    buckets.set(key, bucket);
  }
  const colors = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map(({ r, g, b, n }) => [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
  const picked = [];
  for (const color of colors) {
    const distinct = picked.every(
      (other) => Math.hypot(color[0] - other[0], color[1] - other[1], color[2] - other[2]) > 48,
    );
    if (distinct) picked.push(color);
    if (picked.length === count) break;
  }
  return picked.map((rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`);
}

// Stroke points [x1, y1, x2, y2...] as an SVG path.
export function strokePath(points) {
  if (points.length < 2) return '';
  let d = `M${points[0]} ${points[1]}`;
  if (points.length === 2) return `${d} l0.1 0.1`;
  for (let i = 2; i < points.length; i += 2) d += ` L${points[i]} ${points[i + 1]}`;
  return d;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function strokeHit(stroke, x, y, radius) {
  const { points } = stroke;
  if (points.length === 2)
    return Math.hypot(points[0] - x, points[1] - y) <= radius + stroke.width / 2;
  for (let i = 0; i + 3 < points.length; i += 2) {
    if (
      distanceToSegment(x, y, points[i], points[i + 1], points[i + 2], points[i + 3]) <=
      radius + stroke.width / 2
    ) {
      return true;
    }
  }
  return false;
}

// The sketch layer drawn on white as a PNG (base64, no prefix), for the AI.
export function sketchSnapshot(strokes, maxSize = 1280) {
  if (!strokes.length) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.points.length; i += 2) {
      minX = Math.min(minX, stroke.points[i]);
      maxX = Math.max(maxX, stroke.points[i]);
      minY = Math.min(minY, stroke.points[i + 1]);
      maxY = Math.max(maxY, stroke.points[i + 1]);
    }
  }
  const pad = 24;
  const width = maxX - minX + pad * 2;
  const height = maxY - minY + pad * 2;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.translate(pad - minX, pad - minY);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const stroke of strokes) {
    context.strokeStyle = stroke.color === '#ffffff' ? '#dddddd' : stroke.color;
    context.lineWidth = stroke.width;
    context.stroke(new Path2D(strokePath(stroke.points)));
  }
  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}

// Headings: their own type size; the box is fitted around the words.
export const HEADING_SIZE = 40;
const HEADING_PAD_X = 12;
const HEADING_PAD_Y = 8;

export function headingSize(item) {
  // Older headings had no size of their own: it came from the box height.
  return item.fontSize ?? Math.max(14, Math.min(160, Math.round(item.h * 0.55)));
}

/** The box that fits `text` at `fontSize`, as the heading is drawn. */
export function headingBox(text, fontSize) {
  const span = document.createElement('span');
  span.className = 'font-display';
  Object.assign(span.style, {
    position: 'absolute',
    left: '-99999px',
    top: '0',
    visibility: 'hidden',
    whiteSpace: 'pre',
    fontSize: `${fontSize}px`,
    lineHeight: '1.1',
  });
  // A trailing new line still takes a line's height.
  span.textContent = `${text || 'Heading'}${String(text ?? '').endsWith('\n') ? ' ' : ''}`;
  document.body.appendChild(span);
  const box = {
    w: Math.ceil(span.offsetWidth) + HEADING_PAD_X,
    h: Math.ceil(span.offsetHeight) + HEADING_PAD_Y,
  };
  span.remove();
  return box;
}
