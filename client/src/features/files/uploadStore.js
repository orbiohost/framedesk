import { ApiError, api, ensureCsrfToken } from '../../lib/apiClient.js';
import { readLocal, removeLocal, writeLocal } from '../../lib/storage.js';
import { faststart } from './faststart.js';

// Uploads go from the browser straight into Amazon S3 (multipart upload with
// presigned part links). The API only authorises the upload, hands out the
// part links and finishes it; the bytes never pass through the server.
//
// Uploads live outside React so they keep going while people move between
// pages. Components read them through useUploads() (useSyncExternalStore).

const PARALLEL_PARTS = 4;
const RETRY_DELAYS_MS = [1000, 3000, 5000, 10000, 20000];
// Part links are asked for a few at a time, just ahead of when they're needed.
const URL_BATCH = 20;
// Links are valid for an hour; renew them well before that.
const URL_SAFETY_MS = 10 * 60 * 1000;
const RESUME_PREFIX = 'upload:';

let items = [];
const listeners = new Set();
// id -> running upload state (see createJob)
const jobs = new Map();
let onFinished = () => {};

function emit() {
  items = [...items];
  for (const listener of listeners) listener();
}

function patchItem(id, change) {
  items = items.map((item) => (item.id === id ? { ...item, ...change } : item));
  emit();
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Aborted extends Error {}

// Same file into the same folder: picks up an unfinished upload after a reload.
function resumeKey(item, file) {
  return `${RESUME_PREFIX}${item.folderId}:${file.name}:${file.size}:${file.lastModified}`;
}

function messageFor(error) {
  if (error instanceof ApiError) return error.message;
  if (error?.message === 'NO_ETAG') {
    return 'Storage is not set up for direct uploads (the S3 bucket CORS rule must expose ETag).';
  }
  return 'Connection lost. Retrying did not help.';
}

// API errors that retrying won't fix (quota, file type, permission, not found).
function isFinal(error) {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 409 &&
    error.status !== 429
  );
}

// PUTs one part to its presigned S3 link and returns nothing; S3 keeps the part.
function putPart(job, url, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    job.requests.add(xhr);
    xhr.open('PUT', url);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      job.requests.delete(xhr);
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!xhr.getResponseHeader('ETag')) reject(new Error('NO_ETAG'));
        else resolve();
      } else {
        const error = new Error(`S3 answered ${xhr.status}`);
        error.status = xhr.status;
        reject(error);
      }
    };
    xhr.onerror = () => {
      job.requests.delete(xhr);
      reject(new Error('NETWORK'));
    };
    xhr.onabort = () => {
      job.requests.delete(xhr);
      reject(new Aborted());
    };
    xhr.send(blob);
  });
}

async function partUrl(job, partNumber) {
  const cached = job.urls.get(partNumber);
  if (cached && cached.expiresAt - URL_SAFETY_MS > Date.now()) return cached.url;
  // Ask for this part and the next few still to send.
  const wanted = job.queue.filter((n) => n >= partNumber).slice(0, URL_BATCH);
  if (!wanted.includes(partNumber)) wanted.unshift(partNumber);
  const { urls, expiresInSeconds } = await api.post(`/uploads/${job.uploadId}/part-urls`, {
    partNumbers: wanted,
  });
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  for (const [n, url] of Object.entries(urls)) job.urls.set(Number(n), { url, expiresAt });
  return job.urls.get(partNumber).url;
}

function reportProgress(job) {
  let sent = job.doneBytes;
  for (const bytes of job.inFlight.values()) sent += bytes;
  patchItem(job.item.id, { uploadedBytes: Math.min(sent, job.item.size) });
}

async function sendPart(job, partNumber) {
  const start = (partNumber - 1) * job.partSize;
  const blob = job.file.slice(start, Math.min(start + job.partSize, job.file.size));
  for (let attempt = 0; ; attempt += 1) {
    if (job.stopped) throw new Aborted();
    try {
      const url = await partUrl(job, partNumber);
      await putPart(job, url, blob, (loaded) => {
        job.inFlight.set(partNumber, loaded);
        reportProgress(job);
      });
      job.inFlight.delete(partNumber);
      job.doneBytes += blob.size;
      reportProgress(job);
      return;
    } catch (error) {
      job.inFlight.delete(partNumber);
      if (error instanceof Aborted || job.stopped) throw new Aborted();
      const giveUp =
        isFinal(error) || error.message === 'NO_ETAG' || attempt >= RETRY_DELAYS_MS.length;
      if (giveUp) {
        haltOthers(job);
        throw error;
      }
      // An expired or rejected link: sign a fresh one on the next try.
      if (error.status === 403) job.urls.delete(partNumber);
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
}

// One part failed for good: stop the rest too (they're sent again on retry).
function haltOthers(job) {
  job.stopped = true;
  for (const xhr of job.requests) xhr.abort();
}

async function sendAllParts(job) {
  const worker = async () => {
    while (job.queue.length && !job.stopped) {
      const partNumber = job.queue.shift();
      try {
        await sendPart(job, partNumber);
      } catch (error) {
        job.queue.unshift(partNumber); // sent again on resume
        throw error;
      }
    }
  };
  const workers = Array.from({ length: Math.min(PARALLEL_PARTS, job.queue.length) }, worker);
  const results = await Promise.allSettled(workers);
  const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason);
  if (errors.length) {
    // The real failure, not the other workers stopping because of it.
    throw errors.find((error) => !(error instanceof Aborted)) ?? errors[0];
  }
}

// Opens the upload in S3, or picks up the one this file started before.
async function openUpload(job) {
  const saved = readLocal(job.resumeKey);
  if (saved) {
    try {
      const { upload } = await api.get(`/uploads/${saved}`);
      if (upload.size === job.file.size) return upload;
    } catch {
      // Expired or gone: start a new one.
    }
    removeLocal(job.resumeKey);
  }
  const { upload } = await api.post('/uploads', {
    size: job.file.size,
    // Every value is a string (empty when not set), as the server expects.
    metadata: Object.fromEntries(
      Object.entries({
        ...job.item.extraMetadata,
        filename: job.file.name,
        workspaceId: job.item.workspaceId,
        folderId: job.item.folderId,
      }).map(([key, value]) => [key, value === null || value === undefined ? '' : String(value)]),
    ),
  });
  writeLocal(job.resumeKey, upload.id);
  return upload;
}

async function run(job) {
  const { item } = job;
  job.stopped = false;
  job.paused = false;
  patchItem(item.id, { status: 'uploading', error: null, saving: false });
  try {
    // Prepared once: videos get their index moved to the front so they stream.
    job.file ??= await faststart(job.original);
    job.resumeKey ??= resumeKey(item, job.original);
    if (!job.uploadId) {
      const upload = await openUpload(job);
      job.uploadId = upload.id;
      job.partSize = upload.partSize;
      job.partCount = upload.partCount;
    }
    // S3 says which parts it already has (after a pause, error or reload).
    const { upload } = await api.get(`/uploads/${job.uploadId}`);
    const have = new Set(upload.uploadedParts.map((part) => part.partNumber));
    job.doneBytes = upload.uploadedParts.reduce((sum, part) => sum + part.size, 0);
    job.queue = [];
    for (let n = 1; n <= job.partCount; n += 1) if (!have.has(n)) job.queue.push(n);
    reportProgress(job);

    await sendAllParts(job);
    if (job.paused) return;

    patchItem(item.id, { saving: true, uploadedBytes: item.size });
    const finished = await completeWithRetry(job);
    removeLocal(job.resumeKey);
    jobs.delete(item.id);
    patchItem(item.id, {
      status: 'done',
      saving: false,
      uploadedBytes: item.size,
      // The stored file, for callers that use it straight away (the AI chat).
      fileId: finished?.fileId ?? null,
    });
    onFinished(item);
  } catch (error) {
    if (job.paused) return; // the viewer paused or cancelled it
    // A refused upload (type, quota, permission) won't resume: forget it.
    if (isFinal(error) && error.status !== 404) removeLocal(job.resumeKey);
    if (error instanceof ApiError && error.status === 404) {
      removeLocal(job.resumeKey);
      job.uploadId = null; // expired: a retry starts over
    }
    patchItem(item.id, { status: 'error', saving: false, error: messageFor(error) });
  }
}

async function completeWithRetry(job) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await api.post(`/uploads/${job.uploadId}/complete`);
    } catch (error) {
      if (isFinal(error) || attempt >= RETRY_DELAYS_MS.length) throw error;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
}

function createJob(item, file) {
  return {
    item,
    original: file,
    file: null,
    resumeKey: null,
    uploadId: null,
    partSize: 0,
    partCount: 0,
    queue: [],
    urls: new Map(),
    inFlight: new Map(),
    requests: new Set(),
    doneBytes: 0,
    // stopped: no more parts go out; paused: because the viewer asked.
    stopped: false,
    paused: false,
  };
}

function stopJob(job) {
  job.paused = true;
  job.stopped = true;
  for (const xhr of job.requests) xhr.abort();
  job.requests.clear();
}

export function setUploadFinishedHandler(handler) {
  onFinished = handler;
}

// Returns the new uploads' ids (see getSnapshot for their progress).
// extraMetadata: more upload details, e.g. { transcribe: 'transcribe', transcribeLanguage: 'hi' }
// from the Transcribe page, so the server queues a transcript once the file is stored.
export async function addUploads({
  workspaceId,
  projectId,
  folderId,
  folderName,
  files,
  extraMetadata = {},
}) {
  await ensureCsrfToken();
  const ids = [];
  for (const file of files) {
    const item = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      uploadedBytes: 0,
      status: 'uploading',
      saving: false,
      error: null,
      workspaceId,
      projectId,
      folderId,
      folderName,
      extraMetadata,
      transcribe: Boolean(extraMetadata.transcribe),
    };
    items = [...items, item];
    const job = createJob(item, file);
    jobs.set(item.id, job);
    ids.push(item.id);
    run(job);
  }
  emit();
  return ids;
}

export function pauseUpload(id) {
  const job = jobs.get(id);
  if (job) stopJob(job);
  patchItem(id, { status: 'paused' });
}

export function resumeUpload(id) {
  const job = jobs.get(id);
  if (!job) return;
  job.urls.clear();
  run(job);
}

export function cancelUpload(id) {
  const job = jobs.get(id);
  if (job) {
    stopJob(job);
    if (job.resumeKey) removeLocal(job.resumeKey);
    // Removes the parts already in S3.
    if (job.uploadId) api.delete(`/uploads/${job.uploadId}`).catch(() => {});
  }
  jobs.delete(id);
  items = items.filter((item) => item.id !== id);
  emit();
}

export function clearFinishedUploads() {
  items = items.filter((item) => item.status !== 'done');
  emit();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return items;
}

export function hasActiveUploads() {
  return items.some((item) => item.status === 'uploading');
}
