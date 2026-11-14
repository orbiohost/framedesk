/* global self, caches, navigator, URL, Response, ReadableStream, AbortController, fetch, setTimeout, clearTimeout */
// Media buffering worker.
//
// The <video> element decides on its own how far ahead to load, and browsers
// are stingy about it: phones load a few seconds at a time, and every browser
// stops loading the moment playback is paused. So the player points the
// element at a same-origin address (/__media/<key>?u=<signed link>&s=<size>)
// and this worker answers its Range requests from a chunk cache, while also
// downloading ahead of the playhead on its own schedule — whether the video is
// playing or paused. Seeking back, re-opening a file or a renewed link all
// reuse what is already here.
//
// Only /__media/ addresses are handled; every other request goes to the
// network untouched.

const CACHE_NAME = 'framedesk-media-v1';
const PREFIX = '/__media/';
const CHUNK_PATH = '/__media-chunk/';
const META_URL = '/__media-meta';
const CHUNK = 2 * 1024 * 1024;
// Ahead-of-playhead downloads at once (the player's own reads come on top).
const PREFETCH_PARALLEL = 3;
// Files whose chunks are kept on disk; older ones are dropped.
const KEEP_FILES = 4;
// Recently used chunks also kept in memory (a quick path, and the only store
// where Cache Storage is unavailable, e.g. some private windows).
const MEMORY_LIMIT = 48 * 1024 * 1024;
// The page sends its position every couple of seconds; prefetching stops this
// long after the last one (the tab was closed or crashed).
const POSITION_TTL_MS = 90 * 1000;
const RETRY_MS = 3000;
const STALL_MS = 20 * 1000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// ---------------------------------------------------------------- storage --

let cachePromise = null;
let cacheBroken = false;

function openCache() {
  if (cacheBroken || typeof caches === 'undefined') return Promise.resolve(null);
  cachePromise ??= caches.open(CACHE_NAME).catch(() => {
    cacheBroken = true;
    return null;
  });
  return cachePromise;
}

function chunkUrl(key, index) {
  return `${CHUNK_PATH}${encodeURIComponent(key)}/${index}`;
}

// key -> Set of chunk indexes on disk, read once per worker start.
let diskIndexPromise = null;

function diskIndex() {
  diskIndexPromise ??= (async () => {
    const index = new Map();
    const cache = await openCache();
    if (!cache) return index;
    try {
      for (const request of await cache.keys()) {
        const path = new URL(request.url).pathname;
        if (!path.startsWith(CHUNK_PATH)) continue;
        const [rawKey, rawIndex] = path.slice(CHUNK_PATH.length).split('/');
        const key = decodeURIComponent(rawKey);
        if (!index.has(key)) index.set(key, new Set());
        index.get(key).add(Number(rawIndex));
      }
    } catch {
      // An unreadable cache just starts empty.
    }
    return index;
  })();
  return diskIndexPromise;
}

const memory = new Map(); // "key|index" -> Uint8Array, oldest first
let memoryBytes = 0;

function memoryGet(key, index) {
  const id = `${key}|${index}`;
  const bytes = memory.get(id);
  if (!bytes) return null;
  memory.delete(id);
  memory.set(id, bytes);
  return bytes;
}

function memoryPut(key, index, bytes) {
  const id = `${key}|${index}`;
  if (memory.has(id)) return;
  memory.set(id, bytes);
  memoryBytes += bytes.byteLength;
  for (const [oldId, old] of memory) {
    if (memoryBytes <= MEMORY_LIMIT) break;
    memory.delete(oldId);
    memoryBytes -= old.byteLength;
  }
}

async function storageBudgetChunks() {
  let budget = 1.5 * 1024 ** 3;
  try {
    const { quota } = await navigator.storage.estimate();
    if (quota) budget = Math.min(budget, quota * 0.25);
  } catch {
    // No estimate: keep the default.
  }
  return Math.max(16, Math.floor(budget / CHUNK));
}

async function readMeta(cache) {
  try {
    const response = await cache.match(META_URL);
    const meta = response ? await response.json() : null;
    return Array.isArray(meta?.order) ? meta : { order: [] };
  } catch {
    return { order: [] };
  }
}

// Newest file first; chunks of files beyond KEEP_FILES are deleted.
async function markRecent(key) {
  const cache = await openCache();
  if (!cache) return;
  const meta = await readMeta(cache);
  const order = [key, ...meta.order.filter((other) => other !== key)];
  const dropped = order.splice(KEEP_FILES);
  try {
    await cache.put(META_URL, new Response(JSON.stringify({ order })));
  } catch {
    // Quota: dropping below frees space for next time.
  }
  if (!dropped.length) return;
  const index = await diskIndex();
  await Promise.all(
    dropped.map(async (old) => {
      const chunks = index.get(old);
      index.delete(old);
      files.delete(old);
      if (!chunks) return;
      await Promise.all([...chunks].map((i) => cache.delete(chunkUrl(old, i)).catch(() => {})));
    }),
  );
}

let budgetCheck = null;

// Keeps the disk copy within budget: other files' chunks go first, then this
// file's chunks furthest from where it is being watched.
function enforceBudget(current) {
  if (budgetCheck) return;
  budgetCheck = (async () => {
    const cache = await openCache();
    if (!cache) return;
    const index = await diskIndex();
    const budget = await storageBudgetChunks();
    let total = 0;
    for (const set of index.values()) total += set.size;
    if (total <= budget) return;
    const meta = await readMeta(cache);
    const others = meta.order.filter((key) => key !== current.key).reverse();
    for (const key of others) {
      const set = index.get(key);
      if (!set) continue;
      for (const i of set) {
        if (total <= budget) break;
        set.delete(i);
        total -= 1;
        await cache.delete(chunkUrl(key, i)).catch(() => {});
      }
    }
    const own = index.get(current.key);
    if (!own || total <= budget) return;
    const here = Math.floor((current.prefetch?.pos ?? 0) / CHUNK);
    const furthest = [...own].sort((a, b) => {
      // Behind the playhead goes before ahead of it.
      const da = a < here ? (here - a) * 4 : a - here;
      const db = b < here ? (here - b) * 4 : b - here;
      return db - da;
    });
    for (const i of furthest) {
      if (total <= budget) break;
      own.delete(i);
      total -= 1;
      await cache.delete(chunkUrl(current.key, i)).catch(() => {});
    }
  })().finally(() => {
    budgetCheck = null;
  });
}

// ------------------------------------------------------------------ files --

const files = new Map(); // key -> file state
const filePromises = new Map();

function lastIndex(file) {
  return Math.floor((file.size - 1) / CHUNK);
}

async function getFile(key, url, size, mime) {
  const existing = files.get(key);
  if (existing) {
    if (url && url !== existing.url) existing.url = url;
    return existing;
  }
  if (!filePromises.has(key)) {
    filePromises.set(
      key,
      (async () => {
        const index = await diskIndex();
        if (!index.has(key)) index.set(key, new Set());
        const file = {
          key,
          url,
          size,
          mime,
          contentType: null,
          onDisk: index.get(key),
          loads: new Map(),
          prefetch: null,
          pumping: false,
          failedUrl: null,
          retryAt: 0,
          // The storage ignored Range or reported another size: pass through.
          direct: false,
        };
        files.set(key, file);
        markRecent(key).catch(() => {});
        return file;
      })().finally(() => filePromises.delete(key)),
    );
  }
  const file = await filePromises.get(key);
  if (url && url !== file.url) file.url = url;
  return file;
}

function hasChunk(file, index) {
  return file.onDisk.has(index) || memory.has(`${file.key}|${index}`);
}

class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

class DirectError extends Error {}

// One chunk being downloaded. Readers follow it as bytes arrive, so a cache
// miss starts playing at network speed instead of waiting for the whole chunk.
class Load {
  constructor(file, index) {
    this.file = file;
    this.index = index;
    this.parts = [];
    this.done = false;
    this.error = null;
    this.waiters = [];
    this.promise = this.run();
  }

  wake() {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }

  wait() {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async run() {
    const { file, index } = this;
    const start = index * CHUNK;
    const end = Math.min(file.size, start + CHUNK) - 1;
    const expected = end - start + 1;
    const url = file.url;
    // A connection that stops delivering is dropped, and the chunk is tried
    // again, instead of holding up everything queued behind it.
    const controller = new AbortController();
    let stallTimer = null;
    const feedWatchdog = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => controller.abort(), STALL_MS);
    };
    feedWatchdog();
    try {
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new HttpError(response.status);
      if (response.status === 200 && start > 0) throw new DirectError('Range ignored');
      const range = response.headers.get('content-range');
      const total = range ? Number(range.split('/')[1]) : NaN;
      if (Number.isFinite(total) && total !== file.size) throw new DirectError('Size differs');
      file.contentType ??= response.headers.get('content-type');
      const reader = response.body.getReader();
      let received = 0;
      while (received < expected) {
        const { value, done } = await reader.read();
        if (done) break;
        feedWatchdog();
        const piece =
          value.byteLength > expected - received ? value.subarray(0, expected - received) : value;
        this.parts.push(piece);
        received += piece.byteLength;
        this.wake();
      }
      if (received >= expected) reader.cancel().catch(() => {});
      if (received !== expected) throw new Error('Connection closed early');
      const bytes = new Uint8Array(expected);
      let offset = 0;
      for (const part of this.parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      memoryPut(file.key, index, bytes);
      this.done = true;
      this.wake();
      const cache = await openCache();
      if (cache) {
        try {
          await cache.put(chunkUrl(file.key, index), new Response(bytes));
          file.onDisk.add(index);
          enforceBudget(file);
        } catch {
          cacheBroken = true; // Quota or private mode: memory only from now on.
        }
      }
    } catch (error) {
      this.error = error;
      if (error instanceof DirectError) file.direct = true;
      else if (error instanceof HttpError) file.failedUrl = url;
      else file.retryAt = Date.now() + RETRY_MS;
      this.wake();
    } finally {
      clearTimeout(stallTimer);
      if (file.loads.get(index) === this) file.loads.delete(index);
      reportBuffered(file);
    }
  }
}

function startLoad(file, index) {
  let load = file.loads.get(index);
  if (!load) {
    load = new Load(file, index);
    file.loads.set(index, load);
  }
  return load;
}

async function cachedChunk(file, index) {
  const inMemory = memoryGet(file.key, index);
  if (inMemory) return inMemory;
  if (!file.onDisk.has(index)) return null;
  const cache = await openCache();
  try {
    const response = cache && (await cache.match(chunkUrl(file.key, index)));
    if (response) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      memoryPut(file.key, index, bytes);
      return bytes;
    }
  } catch {
    // Treat as missing.
  }
  file.onDisk.delete(index);
  return null;
}

// Yields the chunk's bytes in order, from memory, disk or the network.
async function* chunkBytes(file, index) {
  const cached = await cachedChunk(file, index);
  if (cached) {
    yield cached;
    return;
  }
  const load = startLoad(file, index);
  let i = 0;
  for (;;) {
    while (i < load.parts.length) yield load.parts[i++];
    if (load.done) return;
    if (load.error) throw load.error;
    await load.wait();
  }
}

// Starts downloading a chunk nobody has yet (used for read-ahead).
function prime(file, index) {
  if (index > lastIndex(file) || file.direct) return;
  if (hasChunk(file, index) || file.loads.has(index)) return;
  if (file.failedUrl === file.url) return;
  startLoad(file, index);
}

async function* rangeBytes(file, start, end) {
  let pos = start;
  for (let index = Math.floor(start / CHUNK); pos <= end; index += 1) {
    let offset = index * CHUNK;
    // While this chunk plays, the next one is already on its way.
    prime(file, index + 1);
    for await (const piece of chunkBytes(file, index)) {
      const pieceEnd = offset + piece.byteLength;
      if (pieceEnd > pos) {
        const from = pos - offset;
        const to = Math.min(piece.byteLength, end + 1 - offset);
        yield piece.subarray(from, to);
        pos = offset + to;
      }
      offset = pieceEnd;
      if (pos > end) return;
    }
  }
}

// ---------------------------------------------------------------- serving --

function parseRange(header, size) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    return { start: Math.max(0, size - suffix), end: size - 1, partial: true };
  }
  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (start > end) return null;
  return { start, end, partial: true };
}

function passThrough(request, file) {
  const headers = {};
  const range = request.headers.get('range');
  if (range) headers.Range = range;
  return fetch(file.url, { headers, mode: 'cors', credentials: 'omit', cache: 'no-store' });
}

async function serve(request, url) {
  const key = decodeURIComponent(url.pathname.slice(PREFIX.length));
  const source = url.searchParams.get('u');
  const size = Number(url.searchParams.get('s'));
  const mime = url.searchParams.get('t') || 'application/octet-stream';
  if (!key || !source || !Number.isFinite(size) || size <= 0) {
    return new Response(null, { status: 400 });
  }
  const file = await getFile(key, source, size, mime);
  if (file.direct) return passThrough(request, file);

  const range = parseRange(request.headers.get('range'), size);
  if (!range) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  // A newer link arrived with this request: let prefetching try again.
  if (file.failedUrl && file.failedUrl !== file.url) file.failedUrl = null;

  const bytes = rangeBytes(file, range.start, range.end);
  let first;
  try {
    // The first bytes come before the answer, so an expired link fails with a
    // status the player understands rather than a broken stream.
    first = await bytes.next();
  } catch (error) {
    if (error instanceof DirectError) return passThrough(request, file);
    if (error instanceof HttpError) return new Response(null, { status: error.status });
    return Response.error();
  }

  let pending = first;
  const body = new ReadableStream(
    {
      async pull(controller) {
        try {
          const step = pending ?? (await bytes.next());
          pending = null;
          if (step.done) controller.close();
          else controller.enqueue(step.value);
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() {
        bytes.return().catch(() => {});
      },
    },
    { highWaterMark: 1 },
  );

  const headers = {
    'Content-Type': file.contentType || mime,
    'Content-Length': String(range.end - range.start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };
  if (range.partial) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
  return new Response(body, { status: range.partial ? 206 : 200, headers });
}

// --------------------------------------------------------------- offline --
// App pages opened with no connection (most often the Android app or a home
// screen icon) get a small "you're offline" screen instead of the browser's
// error page. Pages still always come from the network; nothing is cached.

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>FrameDesk · Offline</title>
<meta name="theme-color" content="#16151C"><style>
html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;
background:#16151C;color:#F1EFF7;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:0 24px}
.c{max-width:320px}h1{font-size:20px;margin:20px 0 6px}p{color:#A29EB4;margin:0 0 24px}
button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:12px 24px;background:#BA96FF;color:#16151C}
</style></head><body><div class="c">
<svg width="56" height="56" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#1D1C1A"/>
<path d="M9 9h6M9 9v6M23 23h-6M23 23v-6" stroke="#F6F4EF" stroke-width="2.5" stroke-linecap="round"/>
<rect x="13" y="13" width="6" height="6" rx="1" fill="#C4401F"/></svg>
<h1>You're offline</h1><p>FrameDesk needs an internet connection. It will open as soon as you're back online.</p>
<button onclick="location.reload()">Try again</button></div>
<script>addEventListener('online',function(){location.reload()})</script></body></html>`;

function isAppNavigation(request, url) {
  return (
    request.mode === 'navigate' &&
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    !url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/.well-known/')
  );
}

async function navigate(event) {
  try {
    // Navigation preload starts the request while this worker boots, so
    // routing pages through it costs nothing.
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

self.addEventListener('activate', (event) => {
  if (self.registration.navigationPreload) {
    event.waitUntil(self.registration.navigationPreload.enable().catch(() => {}));
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (isAppNavigation(event.request, url)) {
    event.respondWith(navigate(event));
    return;
  }
  if (url.origin !== self.location.origin || !url.pathname.startsWith(PREFIX)) return;
  event.respondWith(serve(event.request, url));
});

// ------------------------------------------------------------ prefetching --

async function reportBuffered(file) {
  const p = file.prefetch;
  if (!p?.clientId) return;
  let index = Math.floor(p.pos / CHUNK);
  while (index <= lastIndex(file) && hasChunk(file, index)) index += 1;
  const end = Math.min(file.size, index * CHUNK);
  if (end === p.reported) return;
  p.reported = end;
  try {
    const client = await self.clients.get(p.clientId);
    client?.postMessage({ type: 'media-buffered', key: file.key, start: p.pos, end });
  } catch {
    // The page went away.
  }
}

function anyLoad(file) {
  return Promise.race([...file.loads.values()].map((load) => load.promise));
}

async function pump(file) {
  for (;;) {
    const p = file.prefetch;
    if (!p || Date.now() > p.until || file.direct) return;
    if (file.failedUrl === file.url) return;
    if (Date.now() < file.retryAt) return;
    const first = Math.floor(p.pos / CHUNK);
    const last = Math.min(lastIndex(file), Math.floor((p.pos + p.ahead) / CHUNK));
    let next = -1;
    for (let i = first; i <= last; i += 1) {
      if (!hasChunk(file, i) && !file.loads.has(i)) {
        next = i;
        break;
      }
    }
    if (next < 0 || file.loads.size >= PREFETCH_PARALLEL) {
      if (!file.loads.size) return; // All there.
      await anyLoad(file);
      continue;
    }
    startLoad(file, next);
  }
}

function schedule(file) {
  if (file.pumping) return file.pumping;
  file.pumping = pump(file).finally(() => {
    file.pumping = false;
  });
  return file.pumping;
}

async function onPosition(data, source) {
  const size = Number(data.size);
  if (!data.key || !data.url || !Number.isFinite(size) || size <= 0) return;
  const file = await getFile(data.key, data.url, size, data.mime);
  if (file.failedUrl && file.failedUrl !== file.url) file.failedUrl = null;
  const pos = Math.min(size - 1, Math.max(0, Math.floor(Number(data.pos) || 0)));
  const ahead = Math.max(CHUNK, Number(data.ahead) || 0);
  const previous = file.prefetch;
  file.prefetch = {
    pos,
    ahead,
    until: Date.now() + POSITION_TTL_MS,
    clientId: source?.id ?? previous?.clientId,
    reported: previous?.pos === pos ? previous.reported : undefined,
  };
  reportBuffered(file);
  // Keeps the worker alive while it downloads; the next position message
  // (every couple of seconds) extends it again.
  await Promise.race([schedule(file), new Promise((resolve) => setTimeout(resolve, 25000))]);
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'media-position') {
    event.waitUntil(onPosition(data, event.source).catch(() => {}));
  } else if (data.type === 'media-stop') {
    const file = files.get(data.key);
    if (file) file.prefetch = null;
  }
});
