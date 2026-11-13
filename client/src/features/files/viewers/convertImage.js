import { imageDecoder } from './formats.js';

// Turns pictures the browser can't draw (HEIC/HEIF from iPhones, TIFF, PSD,
// camera RAW) into a JPEG/PNG blob URL, on the viewer's own device. The
// decoders are loaded only when such a file is opened.

const MAX_CACHED = 24;
const MAX_PARALLEL = 2;

// key -> Promise<string> (blob URL). Oldest first, for eviction.
const cache = new Map();
let running = 0;
const queue = [];

function runLimited(task) {
  return new Promise((resolve, reject) => {
    const start = () => {
      running += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          running -= 1;
          queue.shift()?.();
        });
    };
    if (running < MAX_PARALLEL) start();
    else queue.push(start);
  });
}

async function fetchBytes(url) {
  const response = await fetch(url, { mode: 'cors', credentials: 'same-origin' });
  if (!response.ok) throw new Error('The file could not be loaded');
  return response.arrayBuffer();
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be drawn'))),
      type,
      quality,
    );
  });
}

async function decodeHeic(bytes) {
  const { heicTo } = await import('heic-to');
  return heicTo({ blob: new Blob([bytes]), type: 'image/jpeg', quality: 0.92 });
}

async function decodeTiff(bytes) {
  const { default: UTIF } = await import('utif');
  const pages = UTIF.decode(bytes);
  // The largest page is the picture; the others are thumbnails or masks.
  const page = pages
    .filter((ifd) => ifd.t256 && ifd.t257)
    .sort((a, b) => b.t256[0] * b.t257[0] - a.t256[0] * a.t257[0])[0];
  if (!page) throw new Error('This TIFF holds no picture');
  UTIF.decodeImage(bytes, page, pages);
  const rgba = UTIF.toRGBA8(page);
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const context = canvas.getContext('2d');
  context.putImageData(
    new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), page.width),
    0,
    0,
  );
  // PNG keeps transparency; photos are smaller as JPEG.
  const hasAlpha = Boolean(page.t338) || page.t277?.[0] === 4;
  return canvasToBlob(canvas, hasAlpha ? 'image/png' : 'image/jpeg');
}

async function decodePsd(bytes) {
  const { readPsd } = await import('ag-psd');
  const psd = readPsd(bytes, {
    skipLayerImageData: true,
    skipThumbnail: false,
    useImageData: false,
  });
  // The flattened picture Photoshop saves with "Maximize compatibility" on,
  // else the small preview every PSD carries.
  const canvas = psd.canvas ?? psd.imageResources?.thumbnail;
  if (!canvas) throw new Error('This PSD was saved without a preview');
  return canvasToBlob(canvas, 'image/png');
}

// --- Camera RAW: the largest embedded baseline/progressive JPEG.

const SOF_BROWSER_DECODABLE = new Set([0xc0, 0xc1, 0xc2]);

// Where the JPEG starting at `start` ends, or -1 when it isn't one a browser
// can decode (RAW sensor data is often lossless JPEG, which browsers can't).
function jpegEnd(bytes, start) {
  let i = start + 2;
  let decodable = false;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return -1;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd9) return decodable ? i + 2 : -1;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (!SOF_BROWSER_DECODABLE.has(marker)) return -1;
      decodable = true;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) return -1;
    i += 2 + length;
    if (marker === 0xda) {
      // Entropy-coded data runs until the next real marker.
      while (i + 1 < bytes.length) {
        if (bytes[i] === 0xff) {
          const next = bytes[i + 1];
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
            i += 2;
            continue;
          }
          if (next !== 0xff) break;
        }
        i += 1;
      }
    }
  }
  return -1;
}

function largestEmbeddedJpeg(buffer) {
  const bytes = new Uint8Array(buffer);
  let best = null;
  for (let i = 0; i + 3 < bytes.length; i += 1) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue;
    const end = jpegEnd(bytes, i);
    if (end < 0) continue;
    if (!best || end - i > best.end - best.start) best = { start: i, end };
    // Skip past it: the thumbnails nested inside are smaller anyway.
    i = end - 1;
  }
  return best ? new Blob([bytes.subarray(best.start, best.end)], { type: 'image/jpeg' }) : null;
}

async function decodeRaw(bytes) {
  const embedded = largestEmbeddedJpeg(bytes);
  if (embedded) return embedded;
  // DNG and some others are plain TIFF underneath.
  return decodeTiff(bytes);
}

const DECODERS = { heic: decodeHeic, tiff: decodeTiff, psd: decodePsd, raw: decodeRaw };

function remember(key, promise) {
  cache.set(key, promise);
  while (cache.size > MAX_CACHED) {
    const [oldestKey, oldest] = cache.entries().next().value;
    cache.delete(oldestKey);
    oldest.then((url) => URL.revokeObjectURL(url)).catch(() => {});
  }
  // A failure isn't kept: opening the file again tries again.
  promise.catch(() => cache.delete(key));
}

export function convertedImageKey(file) {
  return `${file.id}:${file.version ?? 1}`;
}

// A blob URL for the converted picture, already made, or null.
export function peekConvertedImage(file) {
  return cache.get(convertedImageKey(file)) ?? null;
}

// Resolves to a URL an <img> can show. getUrl() gives the file's inline link.
export function convertImage(file, getUrl) {
  const kind = imageDecoder(file);
  if (!kind) return Promise.resolve(null);
  const key = convertedImageKey(file);
  const cached = cache.get(key);
  if (cached) {
    // Most recently used goes to the back.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const promise = runLimited(async () => {
    const url = typeof getUrl === 'function' ? await getUrl() : getUrl;
    const bytes = await fetchBytes(url);
    const blob = await DECODERS[kind](bytes);
    return URL.createObjectURL(blob);
  });
  remember(key, promise);
  return promise;
}
