import { z } from 'zod';
import { booleanQuery, objectId, tags } from '../../utils/zodHelpers.js';
import { FILE_STATUSES } from './file.model.js';
import { FOLDER_ACCESS_MODES } from './folder.model.js';

const folderName = z
  .string()
  .trim()
  .min(1, 'Give the folder a name')
  .max(120)
  .regex(/^[^\\/:*?"<>|]+$/, 'Folder names cannot contain \\ / : * ? " < > |');

export const folderParamsSchema = z.object({ folderId: objectId });

// No projectId means the workspace Drive.
export const listFoldersQuerySchema = z.object({ projectId: objectId.optional() });

export const createFolderSchema = z.object({
  projectId: objectId.nullable().optional(),
  parentId: objectId.nullable().optional(),
  name: folderName,
});

export const updateFolderSchema = z.object({
  name: folderName.optional(),
  parentId: objectId.nullable().optional(),
});

// userIds only matter for "restricted"; "team" clears the list.
export const folderAccessSchema = z.object({
  access: z.enum(FOLDER_ACCESS_MODES),
  userIds: z.array(objectId).max(200).default([]),
});

// No projectId: the workspace Drive's Trash.
export const emptyTrashQuerySchema = z.object({ projectId: objectId.optional() });

export const fileParamsSchema = z.object({ fileId: objectId });

// A folder's live files (folderId), every live file of a project (projectId
// alone), the live files linked to a project from elsewhere (linkedProjectId),
// or a trash: a project's (projectId) or the workspace Drive's (none).
export const listFilesQuerySchema = z
  .object({
    folderId: objectId.optional(),
    projectId: objectId.optional(),
    linkedProjectId: objectId.optional(),
    trashed: booleanQuery,
    cursor: objectId.optional(),
  })
  .refine((query) => query.trashed || query.folderId || query.projectId || query.linkedProjectId, {
    message:
      'Pass folderId, projectId, linkedProjectId, or trashed=true (with projectId for a project)',
  });

export const MAX_LINKED_PROJECTS = 10;
export const linkedProjectIds = z
  .array(objectId)
  .max(MAX_LINKED_PROJECTS, `Link at most ${MAX_LINKED_PROJECTS} projects`)
  .transform((ids) => [...new Set(ids.map(String))]);

export const updateFileSchema = z.object({
  name: z.string().trim().min(1, 'Give the file a name').max(200).optional(),
  folderId: objectId.optional(),
  status: z.enum(FILE_STATUSES).optional(),
  tags: tags.optional(),
  linkedProjectIds: linkedProjectIds.optional(),
  note: z.string().trim().max(2000, 'Keep the note under 2,000 characters').optional(),
});

// Thumbnails for a page of files at once: ?ids=<id>,<id>,... (one page is 100 files).
export const MAX_PREVIEW_URL_IDS = 100;
export const previewUrlsQuerySchema = z.object({
  ids: z
    .string()
    .transform((value) => [...new Set(value.split(',').filter(Boolean))])
    .pipe(z.array(objectId).min(1, 'Pass at least one file id').max(MAX_PREVIEW_URL_IDS)),
});

export const fileUrlQuerySchema = z.object({
  disposition: z.enum(['inline', 'attachment']).default('attachment'),
});
