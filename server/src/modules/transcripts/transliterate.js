import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

// Word suggestions while someone types an Indian language in English letters
// ("aapka" → "आपका"), for fixing transcripts. Uses Google Input Tools, the
// free engine behind Google's own typing tools: no key, very accurate for
// Indian languages, but unofficial (no SLA). Called from here, not the
// browser, so the answers are cached and the client never talks to Google.

export const TRANSLITERATE_LANGUAGES = {
  hi: 'Hindi',
  mr: 'Marathi',
  bn: 'Bengali',
  gu: 'Gujarati',
  pa: 'Punjabi',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  or: 'Odia',
  ur: 'Urdu',
  ne: 'Nepali',
  sa: 'Sanskrit',
};

const ENDPOINT = 'https://inputtools.google.com/request';
const TIMEOUT_MS = 3000;
const MAX_SUGGESTIONS = 5;
const CACHE_LIMIT = 5000;
// Google down or refusing: stop asking for a minute instead of on every key.
const BACKOFF_MS = 60_000;

const cache = new Map();
let pausedUntil = 0;

function remember(key, value) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

/** Returns up to five suggestions in the language's own script. */
export async function transliterate(word, language) {
  const text = word.trim().toLowerCase();
  if (!text) return [];
  const key = `${language}:${text}`;
  if (cache.has(key)) return cache.get(key);
  if (Date.now() < pausedUntil) {
    throw AppError.unavailable('Typing suggestions are busy, try again shortly', 'XLIT_BUSY');
  }

  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    text,
    itc: `${language}-t-i0-und`,
    num: String(MAX_SUGGESTIONS),
    cp: '0',
    cs: '1',
    ie: 'utf-8',
    oe: 'utf-8',
  }).toString();

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // ["SUCCESS", [["aapka", ["आपका", "आपकी", ...], [], {...}]]]
    const data = await response.json();
    if (data?.[0] !== 'SUCCESS') throw new Error(`Unexpected answer: ${String(data?.[0])}`);
    const suggestions = (data[1]?.[0]?.[1] ?? [])
      .filter((value) => typeof value === 'string' && value.trim())
      .slice(0, MAX_SUGGESTIONS);
    remember(key, suggestions);
    return suggestions;
  } catch (err) {
    pausedUntil = Date.now() + BACKOFF_MS;
    logger.warn({ err: err.message }, 'Transliteration (Google Input Tools) failed');
    throw AppError.unavailable('Typing suggestions are not available right now', 'XLIT_DOWN');
  }
}
