import { generateContent, GeminiError, isGeminiConfigured } from '../ai/gemini.client.js';
import { getAiSettings } from '../ai/aiSettings.service.js';

// Qwen3-ASR only transcribes, so "Translate to English" transcripts are
// translated here, a batch of lines at a time, as they arrive. Each line keeps
// its own start and end time.

// Lines sent to Gemini in one request.
export const TRANSLATE_BATCH = 60;

const SYSTEM = `You translate transcript lines of a video or audio recording into natural, fluent English.
You get a JSON array of strings: consecutive subtitle lines. Answer with a JSON array of exactly the same length, one English line per input line, in the same order.
Keep each line's meaning in that line (don't move words between lines). Keep names, numbers and technical terms. Lines already in English stay as they are.
Answer with the JSON array only.`;

export function canTranslate() {
  return isGeminiConfigured();
}

// A failure that will not go away by trying again (bad key, no translation
// model): the transcript should fail instead of waiting forever.
export function isPermanentTranslateError(error) {
  return error instanceof GeminiError && !error.transient;
}

// [{ start, end, text }] -> the same lines with English text.
export async function translateSegments(segments) {
  if (!segments.length) return segments;
  const settings = await getAiSettings();
  const result = await generateContent({
    model: settings.model,
    system: SYSTEM,
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(segments.map((s) => s.text)) }] }],
    config: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    thinkingLevel: 'minimal',
    timeoutMs: 2 * 60_000,
  });

  let lines;
  try {
    lines = JSON.parse(result.text);
  } catch {
    throw new GeminiError(502, 'The translation came back unreadable');
  }
  if (!Array.isArray(lines)) throw new GeminiError(502, 'The translation came back unreadable');
  // Lines merged or dropped would shift every later line onto the wrong time:
  // ask again in halves until the counts match.
  if (lines.length !== segments.length && segments.length > 1) {
    const half = Math.ceil(segments.length / 2);
    return [
      ...(await translateSegments(segments.slice(0, half))),
      ...(await translateSegments(segments.slice(half))),
    ];
  }
  return segments.map((segment, index) => {
    const text = typeof lines[index] === 'string' ? lines[index].trim() : '';
    return { ...segment, text: text || segment.text };
  });
}
