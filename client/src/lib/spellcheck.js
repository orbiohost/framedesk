import { readLocal, writeLocal } from './storage.js';

// The app's own spell checker: English Hunspell dictionary (public/dict,
// from wooorm/dictionaries) checked with nspell, all in the browser. Free,
// offline, private (no text leaves the device), and the same in every browser,
// unlike the browser's built-in checker, which depends on each person's
// settings. Loaded only when the first editor that uses it opens.
//
// Only words in Latin letters are checked, so Hindi or other scripts typed in
// the same note are left alone.

const CACHE = 'framedesk-dict-v1';
const FILES = { aff: '/dict/en.aff', dic: '/dict/en.dic' };
const PERSONAL_KEY = 'spell:words';
const MAX_SUGGESTIONS = 5;

let loading = null;
let speller = null;
const listeners = new Set();
const verdicts = new Map();

async function fetchText(url) {
  // Kept in Cache Storage, so the 550 KB dictionary downloads once per device.
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return hit.text();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await cache.put(url, response.clone()).catch(() => {});
    return response.text();
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load the dictionary (${response.status})`);
    return response.text();
  }
}

function personalWords() {
  try {
    const list = JSON.parse(readLocal(PERSONAL_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((word) => typeof word === 'string') : [];
  } catch {
    return [];
  }
}

/** Starts loading the dictionary; resolves when words can be checked. */
export function loadSpellchecker() {
  loading ??= (async () => {
    const [{ default: NSpell }, aff, dic] = await Promise.all([
      import('nspell'),
      fetchText(FILES.aff),
      fetchText(FILES.dic),
    ]);
    const next = new NSpell(aff, dic);
    for (const word of personalWords()) next.add(word);
    speller = next;
    verdicts.clear();
    for (const listener of listeners) listener();
    return next;
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

export function spellcheckerReady() {
  return Boolean(speller);
}

/** Calls back when the dictionary loads or a word is added. Returns an unsubscribe. */
export function onSpellcheckerChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Words not worth flagging: acronyms, words with digits, camelCase names, one letter.
function skip(word) {
  if (word.length < 2) return true;
  if (word === word.toUpperCase()) return true;
  if (/[A-Z]/.test(word.slice(1))) return true;
  return false;
}

export function isMisspelled(word) {
  if (!speller || skip(word)) return false;
  const clean = word.replace(/'s$/i, '').replace(/^'+|'+$/g, '');
  if (!clean || skip(clean)) return false;
  if (verdicts.has(clean)) return verdicts.get(clean);
  const wrong = !speller.correct(clean);
  if (verdicts.size > 20_000) verdicts.clear();
  verdicts.set(clean, wrong);
  return wrong;
}

export function suggestionsFor(word) {
  if (!speller) return [];
  return speller.suggest(word.replace(/'s$/i, '')).slice(0, MAX_SUGGESTIONS);
}

/** Remembers a word on this device, so it is never flagged again. */
export function addToDictionary(word) {
  const clean = word.replace(/'s$/i, '');
  const words = personalWords();
  if (!words.includes(clean)) writeLocal(PERSONAL_KEY, JSON.stringify([...words, clean]));
  speller?.add(clean);
  verdicts.delete(clean);
  for (const listener of listeners) listener();
}

// Latin-letter words with their positions; a word touching another script or
// a digit (e.g. part of a link, code or Hinglish mix) is left out.
const WORD = /[A-Za-z][A-Za-z']*/g;

export function misspelledRanges(text, { skipAt = -1 } = {}) {
  if (!speller || !text) return [];
  const ranges = [];
  for (const match of text.matchAll(WORD)) {
    const start = match.index;
    const end = start + match[0].length;
    // The word being typed right now is checked once it is finished.
    if (skipAt >= start && skipAt <= end) continue;
    const before = text.charAt(start - 1);
    const after = text.charAt(end);
    // Part of a number, path, mention, tag or web address.
    if (/[\d_/@#\\]/.test(before) || /[\d_/@\\]/.test(after)) continue;
    if (before === '.' && /\w/.test(text.charAt(start - 2))) continue;
    if (after === '.' && /\w/.test(text.charAt(end + 1))) continue;
    // Right next to another script (e.g. Devanagari): left alone.
    if (/[^\s\p{P}\p{S}]/u.test(before) || /[^\s\p{P}\p{S}']/u.test(after)) continue;
    const word = match[0].replace(/'+$/, '');
    if (isMisspelled(word)) ranges.push({ start, end: start + word.length, word });
  }
  return ranges;
}
