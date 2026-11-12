import { readCookie } from './cookies.js';

const API_BASE = '/api';
const CSRF_COOKIE = 'csrf_token';
// These endpoints answer 401 as a real result; retrying them after a refresh makes no sense.
const NO_REFRESH_PATHS = ['/auth/login', '/auth/signup', '/auth/refresh'];

export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  fieldError(field) {
    return this.details?.find((detail) => detail.field === field)?.message;
  }
}

let refreshInFlight = null;

export async function ensureCsrfToken() {
  if (!readCookie(CSRF_COOKIE)) {
    await fetch(`${API_BASE}/auth/csrf`, { credentials: 'include' });
  }
  return readCookie(CSRF_COOKIE);
}

// `blob` sends raw bytes (e.g. a voice recording) instead of a JSON body.
async function send(path, { method = 'GET', body, blob } = {}) {
  const headers = { Accept: 'application/json' };
  if (blob) headers['Content-Type'] = blob.type || 'application/octet-stream';
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = await ensureCsrfToken();

  return fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: blob ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

// Several requests can hit 401 at once when the access token expires;
// they all wait on a single refresh call.
export function refreshSession() {
  refreshInFlight ??= send('/auth/refresh', { method: 'POST' })
    .then((response) => response.ok)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function parse(response) {
  const payload = await response.json().catch(() => null);
  if (response.ok && payload?.success) return payload.data;

  throw new ApiError({
    status: response.status,
    code: payload?.error?.code ?? 'NETWORK_ERROR',
    message: payload?.error?.message ?? 'Could not reach the server. Check your connection.',
    details: payload?.error?.details,
  });
}

async function request(path, options) {
  let response = await send(path, options);
  if (response.status === 401 && !NO_REFRESH_PATHS.includes(path)) {
    const refreshed = await refreshSession();
    if (refreshed) response = await send(path, options);
  }
  return parse(response);
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  postBlob: (path, blob) => request(path, { method: 'POST', blob }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  delete: (path, body) => request(path, { method: 'DELETE', body }),
};
