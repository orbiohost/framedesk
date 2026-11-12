import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';
import { getStorageDriver } from '../../storage/storageDriver.js';
import { AppError } from '../../utils/AppError.js';
import { isBlockedMime, resolveMime } from './fileTypes.js';
import { optimizeForStreaming } from './mediaOptimize.js';
import { releaseStorage, reserveStorage } from './storageQuota.service.js';

// How bytes get into storage. Uploads go straight from the browser into S3
// (directUploads.service.js) and are checked there with mimeFromHeader();
// backup restores come from a zip on disk and use ingestFile(). Both get the
// same content check, quota claim and random storage key.

// Enough leading bytes for file-type to recognise every format it knows.
export const SNIFF_BYTES = 4100;

// Trust the bytes over the name: an .mp4 that is really a program is refused.
function checkedMime(detected, extension) {
  if (detected && isBlockedMime(detected.mime)) {
    throw new AppError(
      415,
      'FILE_CONTENT_NOT_ALLOWED',
      'This file looks like a program or web page, which cannot be uploaded',
    );
  }
  return resolveMime(extension, detected?.mime);
}

async function sniffMime(filePath, extension) {
  return checkedMime(await fileTypeFromFile(filePath), extension);
}

// The same check over the first SNIFF_BYTES of a file already in S3.
export async function mimeFromHeader(header, extension) {
  return checkedMime(await fileTypeFromBuffer(header), extension);
}

export function newStorageKey(workspaceId) {
  const month = new Date().toISOString().slice(0, 7);
  return `${workspaceId}/${month}/${randomUUID()}`;
}

// Returns what the File document needs, plus `undo` for when that document
// can't be saved (gives the space back and removes the stored bytes).
// countsTowardStorage is false for files restored straight into Trash, which
// (like any trashed file) do not use up the plan's space.
export async function ingestFile({
  workspaceId,
  localPath,
  size,
  extension,
  countsTowardStorage = true,
}) {
  const mime = await sniffMime(localPath, extension);
  // Video/audio is remuxed (never re-encoded) so it starts playing at once.
  if (mime.startsWith('video/') || mime.startsWith('audio/')) {
    ({ size } = await optimizeForStreaming(localPath, mime));
  }
  const counted = countsTowardStorage ? size : 0;
  if (counted) await reserveStorage(workspaceId, counted);

  const driver = getStorageDriver();
  const storageKey = newStorageKey(workspaceId);
  try {
    await driver.saveFromFile(localPath, storageKey);
  } catch (err) {
    await releaseStorage(workspaceId, counted);
    throw err;
  }

  async function undo() {
    await releaseStorage(workspaceId, counted);
    await driver.delete(storageKey).catch(() => {});
  }
  // `size` is the stored size, which a remux can change by a few KB.
  return { storageKey, mime, size, undo };
}
