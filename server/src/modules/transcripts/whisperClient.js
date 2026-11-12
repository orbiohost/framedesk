import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';

const REQUEST_TIMEOUT_MS = 15_000;
// Dictation is answered in one request; on a CPU a minute of speech can take as long.
const DICTATION_TIMEOUT_MS = 5 * 60_000;

async function call(path, { method = 'GET', body, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const response = await fetch(new URL(path, env.WHISPER_URL), {
    method,
    headers: { Authorization: `Bearer ${env.WHISPER_API_KEY}`, ...headers },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, payload };
}

function serviceError(status, payload) {
  const detail = typeof payload?.detail === 'string' ? payload.detail : `HTTP ${status}`;
  const error = new Error(`Whisper service: ${detail}`);
  error.status = status;
  return error;
}

// The HTTP client for the whisper container. Everything goes through this one
// object.
export const whisper = {
  isEnabled() {
    return Boolean(env.WHISPER_URL);
  },

  async health() {
    const { ok, payload } = await call('/health', {});
    return ok ? payload : { status: 'error' };
  },

  // Returns the job id. With local storage Whisper reads the file from the
  // shared volume by its key; with S3 it downloads it from `url` instead.
  async submitJob({ storageKey, url, language, task }) {
    const source = url ? { url } : { storageKey };
    const { ok, status, payload } = await call('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...source, language: language ?? null, task }),
    });
    if (!ok) throw serviceError(status, payload);
    return payload.id;
  },

  // Segments from index `start` on. Null when the service no longer knows the
  // job (it restarted).
  async getJob(jobId, start = 0) {
    const { ok, status, payload } = await call(
      `/jobs/${encodeURIComponent(jobId)}?start=${start}`,
      {},
    );
    if (status === 404) return null;
    if (!ok) throw serviceError(status, payload);
    return payload;
  },

  async cancelJob(jobId) {
    await call(`/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
  },

  // A short recording (a dictated note). Returns { text, language }.
  async transcribeClip(audio, { mime, language }) {
    const query = language ? `?language=${encodeURIComponent(language)}` : '';
    let result;
    try {
      result = await call(`/dictation${query}`, {
        method: 'POST',
        headers: { 'Content-Type': mime || 'application/octet-stream' },
        body: audio,
        timeoutMs: DICTATION_TIMEOUT_MS,
      });
    } catch {
      throw AppError.unavailable('Speech-to-text is not responding. Try again shortly.');
    }
    const { ok, status, payload } = result;
    if (status === 503) {
      throw AppError.unavailable(
        'Speech-to-text is still starting up (the first start downloads the model). Try again in a few minutes.',
        'TRANSCRIPTION_STARTING',
      );
    }
    if (status === 413) throw AppError.badRequest('Recordings can be up to 5 minutes', 'TOO_LONG');
    if (!ok) throw AppError.badRequest('Could not make out that recording', 'UNREADABLE_AUDIO');
    return { text: payload.text, language: payload.language };
  },
};
