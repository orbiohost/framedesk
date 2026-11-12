import { z } from 'zod';
import { objectId } from '../../utils/zodHelpers.js';
import { TRANSCRIPT_TASKS } from './transcript.model.js';
import { EXPORT_FORMATS } from './transcriptFormats.js';

// Whisper's own codes ("en", "hi", "haw"...). The service rejects unknown ones.
const language = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2,3}$/, 'Use a language code such as en or hi')
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
