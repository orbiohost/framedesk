import { z } from 'zod';
import { objectId } from '../../utils/zodHelpers.js';
import { TRANSCRIPT_TASKS } from './transcript.model.js';
import { EXPORT_FORMATS } from './transcriptFormats.js';
import { TRANSLITERATE_LANGUAGES } from './transliterate.js';

// The languages Qwen3-ASR can transcribe, as ISO codes (asr/app.py has the same list).
export const ASR_LANGUAGES = [
  'zh',
  'en',
  'yue',
  'ar',
  'de',
  'fr',
  'es',
  'pt',
  'id',
  'it',
  'ko',
  'ru',
  'th',
  'vi',
  'ja',
  'tr',
  'hi',
  'ms',
  'nl',
  'sv',
  'da',
  'fi',
  'pl',
  'cs',
  'fil',
  'fa',
  'el',
  'hu',
  'mk',
  'ro',
];

const language = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => !value || ASR_LANGUAGES.includes(value), 'That language is not supported')
  .nullable()
  .optional()
  .transform((value) => value || null);

export const listTranscriptsQuerySchema = z.object({ cursor: objectId.optional() });

// Upload metadata from the Transcribe page (tus values are always strings).
// Anything unexpected just means "don't transcribe".
export function readUploadTranscribeOptions(metadata) {
  const task = TRANSCRIPT_TASKS.includes(metadata.transcribe) ? metadata.transcribe : '';
  const parsed = language.safeParse(metadata.transcribeLanguage || null);
  return { task, language: parsed.success && parsed.data ? parsed.data : '' };
}

export const transcriptParamsSchema = z.object({ fileId: objectId });

export const requestTranscriptSchema = z.object({
  language,
  task: z.enum(TRANSCRIPT_TASKS).default('transcribe'),
});

export const exportQuerySchema = z.object({
  format: z.enum(Object.keys(EXPORT_FORMATS)).default('txt'),
});

export const dictationQuerySchema = z.object({ language });

// Fixed lines of a finished transcript (spelling, names): index → new text.
export const editSegmentsSchema = z.object({
  edits: z
    .array(
      z.object({
        index: z.number().int().min(0),
        text: z.string().trim().min(1, 'A line cannot be empty').max(2000),
      }),
    )
    .min(1)
    .max(500),
});

export const transliterateQuerySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z']+$/, 'Only English letters'),
  language: z.enum(Object.keys(TRANSLITERATE_LANGUAGES)),
});
