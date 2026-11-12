import mongoose from 'mongoose';
import { storageConfig } from '../../config/storage.js';
import { AppError } from '../../utils/AppError.js';
import { formatBytes } from '../../utils/bytes.js';
import { sanitizeFileName } from '../../utils/fileNames.js';
import { findActiveMembership } from '../members/members.service.js';
import { EDIT_ROLES } from '../members/roles.js';
import { readUploadTranscribeOptions } from '../transcripts/transcripts.validation.js';
import { findPoolWorkspaceById } from '../workspaces/storagePool.js';
import { categoryFor, extensionOf } from './fileTypes.js';
import { assertFolderAccess } from './folderAccess.js';
import { findFolderOrThrow } from './folders.service.js';
import { assertHasRoom, assertUploadsAllowed } from './storageQuota.service.js';
import { resolveLinkedProjectIds } from './files.service.js';
import { linkedProjectIds as linkedProjectIdsSchema } from './files.validation.js';
import { tags as tagsSchema } from '../../utils/zodHelpers.js';

// Optional details sent with an upload (a recorded voice note sets them up
// front): comma-separated "tags" and "linkedProjectIds" values.
export function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function readUploadDetails(clientMetadata) {
  const tags = tagsSchema.safeParse(splitList(clientMetadata.tags));
  if (!tags.success)
    throw AppError.badRequest('Use at most 20 tags of up to 40 characters', 'INVALID_TAGS');
  const linked = linkedProjectIdsSchema.safeParse(splitList(clientMetadata.linkedProjectIds));
  if (!linked.success) throw AppError.badRequest('Link at most 10 projects', 'INVALID_PROJECTS');
  return { tags: tags.data, linkedProjectIds: linked.data };
}

export function assertAcceptableSize(size) {
  if (!Number.isFinite(size) || size <= 0) {
    throw AppError.badRequest('Empty files cannot be uploaded', 'EMPTY_FILE');
  }
  if (size > storageConfig.maxUploadBytes) {
    throw new AppError(
      413,
      'FILE_TOO_LARGE',
      `Files can be up to ${formatBytes(storageConfig.maxUploadBytes)} each`,
    );
  }
}

function acceptedFileName(rawName) {
  const fileName = sanitizeFileName(rawName);
  const extension = extensionOf(fileName);
  const category = categoryFor(extension);
  if (!fileName || !category) {
    throw new AppError(
      415,
      'FILE_TYPE_NOT_ALLOWED',
      `".${extension || '?'}" files can't be uploaded. Zip the file if you need to share it.`,
    );
  }
  return { fileName, extension, category };
}

export async function assertCanUploadTo(userId, workspaceId, folderId) {
  if (!mongoose.isValidObjectId(workspaceId) || !mongoose.isValidObjectId(folderId)) {
    throw AppError.badRequest('Choose a folder to upload into', 'FOLDER_REQUIRED');
  }
  const membership = await findActiveMembership({ workspaceId, userId });
  if (!EDIT_ROLES.includes(membership?.role)) {
    throw AppError.forbidden("You can't upload files in this workspace");
  }
  const folder = await findFolderOrThrow(workspaceId, folderId);
  await assertFolderAccess(workspaceId, folderId, {
    userId: String(userId),
    role: membership.role,
  });
  return folder;
}

// Runs before the first byte is accepted: permission, file type, size and quota.
// Returns the metadata stored with the upload. userId is set here, never by the client.
export async function prepareUpload(user, clientMetadata, size) {
  assertAcceptableSize(size);
  const { fileName, extension, category } = acceptedFileName(clientMetadata.filename);
  const { workspaceId, folderId } = clientMetadata;
  const folder = await assertCanUploadTo(user._id, workspaceId, folderId);

  // Plan and free space come from the account workspace this one shares.
  const pool = await findPoolWorkspaceById(workspaceId);
  if (!pool) throw AppError.notFound('Workspace not found');
  assertUploadsAllowed(pool);
  assertHasRoom(pool, size);
  const transcribe = readUploadTranscribeOptions(clientMetadata);
  const details = readUploadDetails(clientMetadata);
  const linkedProjectIds = await resolveLinkedProjectIds(
    workspaceId,
    details.linkedProjectIds,
    folder.projectId,
  );

  return {
    filename: fileName,
    extension,
    category,
    workspaceId,
    folderId,
    // Empty for the workspace Drive (tus metadata values are strings).
    projectId: folder.projectId ? String(folder.projectId) : '',
    userId: String(user._id),
    // From the Transcribe page: queue a transcript once the file is stored.
    transcribe: transcribe.task,
    transcribeLanguage: transcribe.language,
    tags: details.tags.join(','),
    linkedProjectIds: linkedProjectIds.join(','),
  };
}

