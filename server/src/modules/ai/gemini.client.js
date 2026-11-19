import { Readable } from 'node:stream';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

// The few Gemini REST calls the assistant needs, over fetch with the API key
// in a header (never in the URL, so it stays out of proxy logs).
// Docs: https://ai.google.dev/api/generate-content and https://ai.google.dev/api/files

const API_BASE = 'https://generativelanguage.googleapis.com';
const GENERATE_TIMEOUT_MS = 5 * 60 * 1000;
const UPLOAD_TIMEOUT_MS = 60 * 60 * 1000;
const FILE_READY_TIMEOUT_MS = 20 * 60 * 1000;
const FILE_POLL_MS = 4000;

export class GeminiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }

  // Worth trying again later: rate limits, overload, network trouble.
  get transient() {
    return !this.status || this.status === 429 || this.status >= 500;
  }
}

export function isGeminiConfigured() {
  return Boolean(env.GEMINI_API_KEY);
}

export function geminiKeyHint() {
  const key = env.GEMINI_API_KEY ?? '';
  return key ? `${key.slice(0, 6)}…${key.slice(-4)}` : null;
}

function headers(extra = {}) {
  return { 'x-goog-api-key': env.GEMINI_API_KEY, ...extra };
}

async function readError(response) {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message ?? `Gemini answered ${response.status}`;
}

async function call(path, { method = 'GET', body, timeoutMs = GENERATE_TIMEOUT_MS } = {}) {
  if (!isGeminiConfigured()) throw new GeminiError(503, 'GEMINI_API_KEY is not set');
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: headers(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    logger.warn({ err: error.message, path }, 'Gemini request failed');
    throw new GeminiError(0, 'Could not reach Gemini');
  }
  if (!response.ok) throw new GeminiError(response.status, await readError(response));
  return response.status === 204 ? null : response.json();
}

// Tried in order after the configured model when it is retired (404),
// overloaded (503/500), rate limited (429) or too slow. Google retires model
// names for new keys over time; "gemini-flash-latest" always points at a live one.
export const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

// Models that just said "quota used up" (429) or stalled are skipped for a while,
// so each question doesn't wait on them again. In this process's memory only.
const cooldownUntil = new Map();
const STALL_COOLDOWN_MS = 3 * 60 * 1000;
const RATE_COOLDOWN_MS = 60 * 1000;
const MAX_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// "Please retry in 4h52m11.5s" / "retry in 37s" -> milliseconds.
function retryDelayMs(message) {
  const match = message?.match(/retry in ((?:\d+h)?(?:\d+m)?(?:[\d.]+s)?)/i);
  if (!match?.[1]) return null;
  const part = (unit) => Number(match[1].match(new RegExp(`([\\d.]+)${unit}`))?.[1] ?? 0);
  const ms = (part('h') * 3600 + part('m') * 60 + part('s')) * 1000;
  return ms > 0 ? ms : null;
}

function coolDown(model, error) {
  let ms = null;
  if (error?.status === 429) ms = retryDelayMs(error.message) ?? RATE_COOLDOWN_MS;
  else if (error?.status === 0 || error?.status === 503) ms = STALL_COOLDOWN_MS;
  else if (error?.status === 404) ms = MAX_COOLDOWN_MS;
  if (ms) cooldownUntil.set(model, Date.now() + Math.min(ms, MAX_COOLDOWN_MS));
}

function worthTryingAnother(error) {
  return error instanceof GeminiError && (error.transient || error.status === 404);
}

/**
 * How much Gemini "thinks" before answering. Thinking costs seconds before the
 * first word and tokens, so chat uses "minimal" (measured: first text in ~0.6 s
 * instead of ~4 s on gemini-3.5-flash) and analysis "low".
 * Gemini 3 models take a level; 2.5 Flash takes a token budget; others nothing.
 */
export function thinkingFor(model, level) {
  const version = Number(model.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  if (version >= 3) return { thinkingLevel: level };
  if (version >= 2.5 && model.includes('flash')) {
    return { thinkingBudget: level === 'minimal' ? 0 : 1024 };
  }
  return undefined;
}

function requestBody({ system, contents, config, thinking }) {
  return {
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    contents,
    generationConfig: { ...config, ...(thinking && { thinkingConfig: thinking }) },
  };
}

// A model that rejects our thinking setting is asked again without it.
function rejectsThinking(error) {
  return error instanceof GeminiError && error.status === 400 && /think/i.test(error.message);
}

function textOf(candidate) {
  return (candidate?.content?.parts ?? [])
    .filter((part) => typeof part.text === 'string' && !part.thought)
    .map((part) => part.text)
    .join('');
}

async function generateOnce(model, { system, contents, config, thinking, timeoutMs }) {
  const result = await call(`/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    timeoutMs,
    body: requestBody({ system, contents, config, thinking }),
  });
  const candidate = result?.candidates?.[0];
  const text = textOf(candidate);
  if (!text) {
    const reason = result?.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'EMPTY';
    throw new GeminiError(422, `Gemini returned no answer (${reason})`);
  }
  return {
    text,
    model,
    totalTokens: result?.usageMetadata?.totalTokenCount ?? 0,
    finishReason: candidate?.finishReason ?? null,
  };
}

function modelsToTry(model) {
  const all = [model, ...FALLBACK_MODELS.filter((candidate) => candidate !== model)];
  const now = Date.now();
  const ready = all.filter((candidate) => !(cooldownUntil.get(candidate) > now));
  // Everything cooling down: try them all anyway rather than refuse.
  return ready.length ? ready : all;
}

/**
 * One generateContent call, falling back to other models when the chosen one
 * is gone or busy. Returns { text, model, totalTokens, finishReason }.
 * `contents` follows the Gemini shape: [{ role, parts: [{ text } | { fileData } | { inlineData }] }].
 * thinkingLevel: 'minimal' | 'low' (see thinkingFor).
 */
export async function generateContent({
  model,
  system,
  contents,
  config = {},
  thinkingLevel = 'low',
  timeoutMs = GENERATE_TIMEOUT_MS,
}) {
  let lastError;
  for (const candidate of modelsToTry(model)) {
    let thinking = thinkingFor(candidate, thinkingLevel);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await generateOnce(candidate, { system, contents, config, thinking, timeoutMs });
      } catch (error) {
        lastError = error;
        if (thinking && rejectsThinking(error)) {
          thinking = undefined;
          continue;
        }
        break;
      }
    }
    if (!worthTryingAnother(lastError)) throw lastError;
    coolDown(candidate, lastError);
    logger.warn(
      { model: candidate, status: lastError.status, err: lastError.message },
      'Gemini model unavailable, trying the next one',
    );
  }
  throw lastError;
}

// Image models, tried in order after the one the admin chose. Like text
// models, Google renames these over time; the admin can set a newer one.
// The first is the default (fast, good quality); pro is slower and pricier.
export const IMAGE_FALLBACK_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-3-pro-image',
];
export const IMAGE_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '3:2', '2:3', '21:9'];

/**
 * Generates an image (Gemini "image out"), optionally from reference images
 * in `parts` ({ inlineData } items before the prompt text).
 * Returns { images: [{ mimeType, data (base64) }], text, model, totalTokens }.
 */
export async function generateImage({ model, parts, aspectRatio, timeoutMs = 3 * 60 * 1000 }) {
  const all = [...new Set([model, ...IMAGE_FALLBACK_MODELS].filter(Boolean))];
  const now = Date.now();
  const ready = all.filter((candidate) => !(cooldownUntil.get(candidate) > now));
  let lastError;
  for (const candidate of ready.length ? ready : all) {
    try {
      const result = await call(`/v1beta/models/${encodeURIComponent(candidate)}:generateContent`, {
        method: 'POST',
        timeoutMs,
        body: {
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            ...(aspectRatio && { imageConfig: { aspectRatio } }),
          },
        },
      });
      const candidateParts = result?.candidates?.[0]?.content?.parts ?? [];
      const images = candidateParts
        .map((part) => part.inlineData ?? part.inline_data)
        .filter((data) => data?.data && /^image\//.test(data.mimeType ?? data.mime_type ?? ''))
        .map((data) => ({ mimeType: data.mimeType ?? data.mime_type, data: data.data }));
      const text = candidateParts
        .filter((part) => typeof part.text === 'string' && !part.thought)
        .map((part) => part.text)
        .join('')
        .trim();
      if (images.length === 0) {
        const reason =
          result?.promptFeedback?.blockReason ?? result?.candidates?.[0]?.finishReason ?? 'EMPTY';
        throw new GeminiError(422, `No image was made (${reason})${text ? `: ${text}` : ''}`);
      }
      return {
        images,
        text,
        model: candidate,
        totalTokens: result?.usageMetadata?.totalTokenCount ?? 0,
      };
    } catch (error) {
      lastError = error;
      if (!worthTryingAnother(error)) throw error;
      coolDown(candidate, error);
      logger.warn(
        { model: candidate, status: error.status, err: error.message },
        'Gemini image model unavailable, trying the next one',
      );
    }
  }
  throw lastError;
}

// Reads a server-sent-events body: yields each "data:" payload, parsed.
async function* sseEvents(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        yield JSON.parse(data);
      } catch {
        // A malformed line; skip it.
      }
    }
  }
}

/**
 * Streams an answer as it is written. Yields { type: 'text', text } pieces,
 * then one { type: 'done', model, totalTokens, finishReason }.
 * Falls back to the next model if one fails before its first word; a model
 * that doesn't start within firstChunkMs counts as busy. `signal` cancels.
 */
export async function* streamContent({
  model,
  system,
  contents,
  config = {},
  thinkingLevel = 'minimal',
  signal,
  firstChunkMs = 12_000,
  totalMs = 3 * 60 * 1000,
}) {
  if (!isGeminiConfigured()) throw new GeminiError(503, 'GEMINI_API_KEY is not set');
  let lastError;
  for (const candidate of modelsToTry(model)) {
    let thinking = thinkingFor(candidate, thinkingLevel);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      let timer = setTimeout(abort, firstChunkMs);
      let started = false;
      let totalTokens = 0;
      let finishReason = null;
      try {
        const response = await fetch(
          `${API_BASE}/v1beta/models/${encodeURIComponent(candidate)}:streamGenerateContent?alt=sse`,
          {
            method: 'POST',
            headers: headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(requestBody({ system, contents, config, thinking })),
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new GeminiError(response.status, await readError(response));
        for await (const event of sseEvents(response.body)) {
          const candidateData = event.candidates?.[0];
          const text = textOf(candidateData);
          if (text) {
            if (!started) {
              started = true;
              clearTimeout(timer);
              timer = setTimeout(abort, totalMs);
            }
            yield { type: 'text', text };
          }
          if (candidateData?.finishReason) finishReason = candidateData.finishReason;
          if (event.usageMetadata?.totalTokenCount)
            totalTokens = event.usageMetadata.totalTokenCount;
        }
        if (!started)
          throw new GeminiError(422, `Gemini returned no answer (${finishReason ?? 'EMPTY'})`);
        yield { type: 'done', model: candidate, totalTokens, finishReason };
        return;
      } catch (error) {
        if (signal?.aborted) throw error;
        // Once words have gone out, switching model would garble the answer.
        if (started)
          throw error instanceof GeminiError ? error : new GeminiError(0, 'The answer was cut off');
        lastError =
          error instanceof GeminiError
            ? error
            : new GeminiError(
                0,
                controller.signal.aborted
                  ? 'Gemini took too long to start'
                  : 'Could not reach Gemini',
              );
        if (thinking && rejectsThinking(lastError)) {
          thinking = undefined;
          continue;
        }
        break;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    }
    if (!worthTryingAnother(lastError)) throw lastError;
    coolDown(candidate, lastError);
    logger.warn(
      { model: candidate, status: lastError.status, err: lastError.message },
      'Gemini model unavailable, trying the next one',
    );
  }
  throw lastError;
}

/**
 * Uploads a stream to the Gemini Files API (resumable protocol, one chunk).
 * Gemini keeps uploads for 48 hours; we delete ours as soon as we're done.
 * Returns { name, uri, mimeType }.
 */
export async function uploadFile({ stream, size, mimeType, displayName }) {
  if (!isGeminiConfigured()) throw new GeminiError(503, 'GEMINI_API_KEY is not set');
  let start;
  try {
    start = await fetch(`${API_BASE}/upload/v1beta/files`, {
      method: 'POST',
      headers: headers({
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(size),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    stream.destroy();
    throw new GeminiError(0, 'Could not reach Gemini');
  }
  if (!start.ok) {
    stream.destroy();
    throw new GeminiError(start.status, await readError(start));
  }
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    stream.destroy();
    throw new GeminiError(502, 'Gemini did not return an upload URL');
  }

  let response;
  try {
    response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(size),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: Readable.toWeb(stream),
      duplex: 'half',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    stream.destroy();
    logger.warn({ err: error.message }, 'Gemini upload failed');
    throw new GeminiError(0, 'Uploading the file to Gemini failed');
  }
  if (!response.ok) throw new GeminiError(response.status, await readError(response));
  const { file } = await response.json();
  return waitUntilActive(file);
}

// Video is processed after upload; it can only be used once it is ACTIVE.
async function waitUntilActive(file) {
  const deadline = Date.now() + FILE_READY_TIMEOUT_MS;
  let current = file;
  while (current.state === 'PROCESSING') {
    if (Date.now() > deadline) {
      await deleteFile(current.name);
      throw new GeminiError(504, 'Gemini took too long to process this file');
    }
    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_MS));
    current = await call(`/v1beta/${current.name}`);
  }
  if (current.state !== 'ACTIVE') {
    await deleteFile(current.name);
    throw new GeminiError(422, current.error?.message ?? 'Gemini could not read this file');
  }
  return { name: current.name, uri: current.uri, mimeType: current.mimeType };
}

export async function deleteFile(name) {
  try {
    await call(`/v1beta/${name}`, { method: 'DELETE', timeoutMs: 15_000 });
  } catch (error) {
    // Gemini removes uploads by itself after 48 hours anyway.
    logger.debug({ err: error.message, name }, 'Could not delete Gemini upload');
  }
}

// For API routes: how a Gemini failure looks to the person asking.
export function toAppError(error) {
  if (!(error instanceof GeminiError)) return error;
  if (error.status === 429) {
    return AppError.tooManyRequests('The AI assistant is busy right now. Try again in a minute.');
  }
  logger.error({ status: error.status, err: error.message }, 'Gemini call failed');
  return AppError.unavailable('The AI assistant could not answer just now. Please try again.');
}
