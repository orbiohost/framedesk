import { z } from 'zod';
import { objectId } from '../../utils/zodHelpers.js';
import { SHARE_AUDIENCES } from '../projects/project.model.js';
import { shareParamsSchema } from '../projectShare/projectShare.validation.js';
import { MAX_SHARED_FILES } from './fileShare.model.js';

const fileIds = z
  .array(objectId)
  .min(1, 'Pick at least one file')
  .max(MAX_SHARED_FILES, `Share at most ${MAX_SHARED_FILES} files in one link`)
  .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]);

export const fileShareParamsSchema = z.object({ shareId: objectId });

// ?ids=<id>,<id>,...
export const findFileShareQuerySchema = z.object({
  ids: z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(fileIds),
});

export const createFileShareSchema = z.object({
  fileIds,
  audience: z.enum(SHARE_AUDIENCES).default('anyone'),
});

export const updateFileShareSchema = z.object({ audience: z.enum(SHARE_AUDIENCES) });

export const fileLinkParamsSchema = shareParamsSchema;
export const fileLinkFileParamsSchema = shareParamsSchema.extend({ fileId: objectId });

export const fileLinkUrlQuerySchema = z.object({
  disposition: z.enum(['inline', 'attachment']).default('attachment'),
});

export const fileLinkPreviewUrlsSchema = z.object({
  fileIds: z.array(objectId).min(1).max(MAX_SHARED_FILES),
});
