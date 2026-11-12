// Poster frames for video thumbnails, made in the browser: a hidden <video>
// loads just enough of the file to show one frame, the frame is drawn onto a
// small canvas, and the element is released. The server does no work beyond
// answering a couple of byte-range requests.
//
// - At most MAX_PARALLEL grabs run at once, so a folder of videos can't take
//   all the browser's connections and stall everything else on the page.
// - Frames are kept as small JPEG data URLs for the visit, so scrolling back,
//   switching views or reopening the folder costs nothing.

const MAX_PARALLEL = 2;
const MAX_CACHED = 300;
const FRAME_WIDTH = 480;
const GRAB_TIMEOUT_MS = 20 * 1000;

const frames = new Map(); // cacheKey -> { src, duration } | null (can't be shown)
const inFlight = new Map(); // cacheKey -> Promise
const waiting = [];
let running = 0;

function canPlay(mime) {
  try {
    return document.createElement('video').canPlayType(mime) !== '';
  } catch {
    return false;
  }
}

function remember(key, value) {
  frames.set(key, value);
  while (frames.size > MAX_CACHED) frames.delete(frames.keys().next().value);
}

function grab(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    // Links to S3 are cross-origin: without CORS the canvas below would be
    // "tainted" and toDataURL would throw. Same-origin links are unaffected.
    video.crossOrigin = 'anonymous';

    let timer = null;
    const finish = (callback) => {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load(); // Drops the connection and the decoder right away.
      callback();
    };
    timer = setTimeout(() => finish(() => reject(new Error('Timed out'))), GRAB_TIMEOUT_MS);

    video.addEventListener(
      'loadedmetadata',
      () => {
        if (!video.videoWidth) {
          finish(() => reject(new Error('No picture')));
          return;
        }
        // A moment in, past fade-ins and black leader frames.
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        video.currentTime = Math.min(1.5, duration * 0.1);
      },
      { once: true },
    );
    video.addEventListener(
      'seeked',
      () => {
        try {
          const width = Math.min(FRAME_WIDTH, video.videoWidth);
          const height = Math.round((width * video.videoHeight) / video.videoWidth);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(video, 0, 0, width, height);
          const frame = { src: canvas.toDataURL('image/jpeg', 0.75), duration: video.duration };
          finish(() => resolve(frame));
        } catch (error) {
          finish(() => reject(error));
        }
      },
      { once: true },
    );
    video.addEventListener('error', () => finish(() => reject(new Error('Unplayable'))), {
      once: true,
    });
    video.src = url;
  });
}

function pump() {
  while (running < MAX_PARALLEL && waiting.length > 0) {
    const job = waiting.shift();
    running += 1;
    job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        running -= 1;
        pump();
      });
  }
}

// What is already known about this file's frame: { src, duration }, null when
// it can't be shown, or undefined when it hasn't been tried yet.
export function cachedVideoFrame(cacheKey) {
  return frames.get(cacheKey);
}

/**
 * getUrl(): resolves to a playable link (called only when the grab starts).
 * Resolves to { src, duration }, or null when this browser can't show it.
 */
export function loadVideoFrame(cacheKey, mime, getUrl) {
  if (frames.has(cacheKey)) return Promise.resolve(frames.get(cacheKey));
  if (!canPlay(mime)) {
    remember(cacheKey, null);
    return Promise.resolve(null);
  }
  if (!inFlight.has(cacheKey)) {
    const promise = new Promise((resolve, reject) => {
      waiting.push({ run: async () => grab(await getUrl()), resolve, reject });
      pump();
    })
      .then(
        (frame) => {
          remember(cacheKey, frame);
          return frame;
        },
        () => {
          remember(cacheKey, null);
          return null;
        },
      )
      .finally(() => inFlight.delete(cacheKey));
    inFlight.set(cacheKey, promise);
  }
  return inFlight.get(cacheKey);
}

export function clearVideoFrames() {
  frames.clear();
}
