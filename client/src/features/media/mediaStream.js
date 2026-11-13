import { useEffect } from 'react';

// Page side of public/media-sw.js: the player points the <video> at a
// /__media/ address the worker answers from its chunk cache, and tells the
// worker where the playhead is so it keeps downloading ahead (also while
// paused, when the browser itself stops).

const WORKER_URL = '/media-sw.js';
const MB = 1024 * 1024;
const POSITION_INTERVAL_MS = 2000;

export function registerMediaWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;
  const register = () => navigator.serviceWorker.register(WORKER_URL, { scope: '/' }).catch(() => {});
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

// Only when the worker already controls this page (not on the very first
// visit, nor after a hard reload); otherwise the player streams directly.
export function canStreamThroughWorker() {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.serviceWorker?.controller) &&
    typeof ReadableStream !== 'undefined'
  );
}

export function streamKey(file) {
  return file?.id && file.size > 0 ? `${file.id}-${file.size}` : null;
}

// Same labels the server gives inline links (server/src/storage/mediaHeaders.js):
// Chrome won't play anything called video/quicktime, though most .mov files are MP4 inside.
const PLAYBACK_MIME_ALIASES = { 'video/quicktime': 'video/mp4', 'video/x-m4v': 'video/mp4' };

export function workerStreamUrl({ key, url, size, mime }) {
  const type = PLAYBACK_MIME_ALIASES[mime] ?? mime ?? '';
  const params = new URLSearchParams({ u: url, s: String(size), t: type });
  return `/__media/${encodeURIComponent(key)}?${params}`;
}

function isPhone() {
  try {
    return matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

// How many bytes to hold ahead of the playhead: a few minutes of the file's
// average bitrate, within limits that suit the device and connection.
function aheadBytes(size, duration) {
  const connection = navigator.connection;
  const saveData = connection?.saveData === true;
  const slow = /(^|-)2g$/.test(connection?.effectiveType ?? '');
  const phone = isPhone();
  const seconds = saveData || slow ? 45 : phone ? 180 : 300;
  const min = saveData || slow ? 6 * MB : 24 * MB;
  const max = saveData || slow ? 24 * MB : phone ? 200 * MB : 600 * MB;
  const byteRate = Number.isFinite(duration) && duration > 0 ? size / duration : 0;
  const wanted = byteRate ? byteRate * seconds : max / 2;
  return Math.round(Math.min(max, Math.max(min, wanted)));
}

/**
 * Reports the playhead of mediaRef's element to the worker.
 * stream: { key, url, size, mime } or null (not streaming through the worker).
 * onBuffered(ratio): how far, as a fraction of the file, the worker holds
 *   ahead of the playhead without a gap.
 */
export function useWorkerPrefetch(mediaRef, stream, onBuffered) {
  const key = stream?.key;
  const url = stream?.url;
  const size = stream?.size;
  const mime = stream?.mime;

  useEffect(() => {
    const worker = navigator.serviceWorker;
    const media = mediaRef.current;
    if (!key || !worker?.controller || !media) return undefined;

    const send = () => {
      const controller = worker.controller;
      if (!controller) return;
      const { duration, currentTime } = media;
      const known = Number.isFinite(duration) && duration > 0;
      const byteRate = known ? size / duration : 0;
      // Bitrate isn't even across a file: start a little behind the estimate
      // so the bytes just ahead of the real playhead aren't skipped.
      const margin = Math.min(8 * MB, byteRate * 10);
      const pos = known ? Math.max(0, (currentTime / duration) * size - margin) : 0;
      controller.postMessage({
        type: 'media-position',
        key,
        url,
        size,
        mime,
        pos,
        ahead: aheadBytes(size, duration) + margin,
      });
    };

    const onMessage = (event) => {
      const data = event.data;
      if (data?.type !== 'media-buffered' || data.key !== key) return;
      onBuffered?.(Math.min(1, data.end / size));
    };

    const events = ['loadedmetadata', 'seeking', 'play', 'pause', 'ratechange'];
    events.forEach((name) => media.addEventListener(name, send));
    worker.addEventListener('message', onMessage);
    const timer = setInterval(send, POSITION_INTERVAL_MS);
    // Hidden tabs throttle timers; catch up as soon as it's visible again.
    const onVisible = () => document.visibilityState === 'visible' && send();
    document.addEventListener('visibilitychange', onVisible);
    send();

    return () => {
      events.forEach((name) => media.removeEventListener(name, send));
      worker.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
      worker.controller?.postMessage({ type: 'media-stop', key });
    };
  }, [mediaRef, key, url, size, mime, onBuffered]);
}
