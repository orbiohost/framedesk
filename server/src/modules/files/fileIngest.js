import { randomUUID } from 'node:crypto';
import { fileTypeFromFile } from 'file-type';
import { getStorageDriver } from '../../storage/storageDriver.js';
import { AppError } from '../../utils/AppError.js';
import { isBlockedMime, resolveMime } from './fileTypes.js';
import { releaseStorage, reserveStorage } from './storageQuota.service.js';

// The one path bytes take into storage, shared by uploads and backup restores,
// so both get the same content check, quota claim and random storage key.

// Trust the bytes over the name: an .mp4 that is really a program is refused.
async function sniffMime(filePath, extension) {
  const detected = await fileTypeFromFile(filePath);
  if (detected && isBlockedMime(detected.mime)) {
    throw new AppError(
      415,
      'FILE_CONTENT_NOT_ALLOWED',
      'This file looks like a program or web page, which cannot be uploaded',
    );
  }
  return resolveMime(extension, detected?.mime);
}

function newStorageKey(workspaceId) {
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
  return { storageKey, mime, undo };
}
