import * as tus from 'tus-js-client';
import { ensureCsrfToken, refreshSession } from '../../lib/apiClient.js';
import { readCookie } from '../../lib/cookies.js';

// Uploads live outside React so they keep going while people move between
// pages. Components read them through useUploads() (useSyncExternalStore).

const CHUNK_BYTES = 50 * 1024 * 1024;
const RETRY_DELAYS_MS = [0, 1000, 3000, 5000, 10000, 20000];

let items = [];
const listeners = new Set();
const uploads = new Map();
let onFinished = () => {};

function emit() {
  items = [...items];
  for (const listener of listeners) listener();
}

function patchItem(id, change) {
  items = items.map((item) => (item.id === id ? { ...item, ...change } : item));
  emit();
}

function readErrorMessage(error) {
  try {
    const body = JSON.parse(error.originalResponse?.getBody() ?? '');
    if (body?.error?.message) return body.error.message;
  } catch {
    // Not one of our JSON errors; fall through to a generic message.
  }
  return error.originalResponse
    ? 'The server refused this file.'
    : 'Connection lost. Retrying did not help.';
}

// Retry network failures and expired sessions (after refreshing them). Other
// 4xx answers (quota, file type, permission) are final.
function shouldRetry(error) {
  const status = error.originalResponse?.getStatus() ?? 0;
  if (status === 401) return true;
  return status === 0 || status >= 500 || status === 409 || status === 423;
}

function createTusUpload(item, file) {
  return new tus.Upload(file, {
    endpoint: '/api/uploads',
    chunkSize: CHUNK_BYTES,
    retryDelays: RETRY_DELAYS_MS,
    removeFingerprintOnSuccess: true,
    metadata: {
      ...item.extraMetadata,
      filename: file.name,
      workspaceId: item.workspaceId,
      folderId: item.folderId,
    },
    onBeforeRequest: (request) => request.setHeader('X-CSRF-Token', readCookie('csrf_token') ?? ''),
    // Long uploads outlive the 15-minute session token; refresh it and carry on.
    onAfterResponse: async (request, response) => {
      if (response.getStatus() === 401) await refreshSession();
    },
    onShouldRetry: shouldRetry,
    onProgress: (sent) => patchItem(item.id, { uploadedBytes: sent }),
    onSuccess: () => {
      patchItem(item.id, { status: 'done', uploadedBytes: item.size });
      onFinished(item);
    },
    onError: (error) => patchItem(item.id, { status: 'error', error: readErrorMessage(error) }),
  });
}

async function start(upload) {
  // Picks up where a previous attempt (even before a page reload) stopped.
  const previous = await upload.findPreviousUploads();
  if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
  upload.start();
}

export function setUploadFinishedHandler(handler) {
  onFinished = handler;
}

// extraMetadata: more tus metadata, e.g. { transcribe: 'transcribe', transcribeLanguage: 'hi' }
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
  for (const file of files) {
    const item = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      uploadedBytes: 0,
      status: 'uploading',
      error: null,
      workspaceId,
      projectId,
      folderId,
      folderName,
      extraMetadata,
      transcribe: Boolean(extraMetadata.transcribe),
    };
    items = [...items, item];
    const upload = createTusUpload(item, file);
    uploads.set(item.id, upload);
    start(upload);
  }
  emit();
}

export function pauseUpload(id) {
  uploads.get(id)?.abort();
  patchItem(id, { status: 'paused' });
}

export function resumeUpload(id) {
  patchItem(id, { status: 'uploading', error: null });
  uploads.get(id)?.start();
}

export function cancelUpload(id) {
  // abort(true) also deletes the partial upload on the server.
  uploads
    .get(id)
    ?.abort(true)
    .catch(() => {});
  uploads.delete(id);
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
