import mongoose from 'mongoose';
import { markBriefStale } from '../briefs/briefStale.js';
import { autoTranscribeIfInBriefs } from '../briefs/briefTranscribe.js';
import { getStorageDriver } from '../../storage/storageDriver.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { queueTranscriptForUpload } from '../transcripts/transcripts.service.js';
import { StoredFile } from './file.model.js';
import { SNIFF_BYTES, mimeFromHeader, newStorageKey } from './fileIngest.js';
import { resolveLinkedProjectIds } from './files.service.js';
import { PendingUpload } from './pendingUpload.model.js';
import { releaseStorage, reserveStorage } from './storageQuota.service.js';
import { assertCanUploadTo, prepareUpload, splitList } from './uploads.service.js';

// Uploads go from the browser straight into S3 as a multipart upload:
//   1. create   -> the server checks permission, type, size and quota and
//                  opens a multipart upload in S3
//   2. part-urls -> short-lived presigned links; the browser PUTs each part
//                  to S3 itself (resumable: finished parts are listed by S3)
//   3. complete -> the server joins the parts, checks the real file type
//                  from its first bytes, claims the space and creates the File
// The bytes never pass through this server or touch its disk.

const MiB = 1024 * 1024;
// S3 allows at most 10,000 parts of at least 5 MiB each (the last may be smaller).
const MAX_PARTS = 10_000;
const MIN_PART_BYTES = 16 * MiB;
const PART_URL_TTL_SECONDS = 60 * 60;
// An unfinished upload can be resumed for a day after its last activity.
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_URLS_PER_REQUEST = 100;
const SWEEP_EVERY_MS = 60 * 60 * 1000;

function partSizeFor(size) {
  const needed = Math.ceil(size / MAX_PARTS / MiB) * MiB;
  return Math.max(MIN_PART_BYTES, needed);
}

function publicUpload(pending, parts = []) {
  return {
    id: String(pending._id),
    size: pending.size,
    partSize: pending.partSize,
    partCount: pending.partCount,
    // Parts S3 already holds, so a resumed upload skips them.
    uploadedParts: parts.map(({ partNumber, size }) => ({ partNumber, size })),
  };
}

async function findOwnPending(userId, uploadId) {
  if (!mongoose.isValidObjectId(uploadId)) throw AppError.notFound('Upload not found');
  const pending = await PendingUpload.findById(uploadId);
  if (!pending || pending.expiresAt < new Date()) throw AppError.notFound('Upload not found');
  if (String(pending.userId) !== String(userId)) {
    throw AppError.forbidden('This upload belongs to someone else');
  }
  return pending;
}

export async function createDirectUpload(user, clientMetadata, size) {
  const metadata = await prepareUpload(user, clientMetadata, size);
  const storageKey = newStorageKey(metadata.workspaceId);
  const partSize = partSizeFor(size);
  const s3UploadId = await getStorageDriver().createMultipartUpload(storageKey);
  const pending = await PendingUpload.create({
    userId: user._id,
    workspaceId: metadata.workspaceId,
    storageKey,
    s3UploadId,
    size,
    partSize,
    partCount: Math.ceil(size / partSize),
    metadata,
    expiresAt: new Date(Date.now() + PENDING_TTL_MS),
  });
  return publicUpload(pending);
}

export async function getDirectUpload(user, uploadId) {
  const pending = await findOwnPending(user._id, uploadId);
  const parts = await getStorageDriver().listParts(pending.storageKey, pending.s3UploadId);
  return publicUpload(pending, parts);
}

export async function signDirectUploadParts(user, uploadId, partNumbers) {
  const pending = await findOwnPending(user._id, uploadId);
  const wanted = [...new Set(partNumbers)].slice(0, MAX_URLS_PER_REQUEST);
  if (wanted.some((n) => !Number.isInteger(n) || n < 1 || n > pending.partCount)) {
    throw AppError.badRequest('Unknown part number', 'INVALID_PART');
  }
  const driver = getStorageDriver();
  const signed = await Promise.all(
    wanted.map((n) =>
      driver.signUploadPart(pending.storageKey, pending.s3UploadId, n, PART_URL_TTL_SECONDS),
    ),
  );
  await PendingUpload.updateOne(
    { _id: pending._id },
    { $set: { expiresAt: new Date(Date.now() + PENDING_TTL_MS) } },
  );
  return {
    urls: Object.fromEntries(wanted.map((n, i) => [n, signed[i]])),
    expiresInSeconds: PART_URL_TTL_SECONDS,
  };
}

// Joins the parts once S3 holds every one of them with the declared total size.
async function joinParts(pending) {
  const driver = getStorageDriver();
  const parts = await driver.listParts(pending.storageKey, pending.s3UploadId);
  parts.sort((a, b) => a.partNumber - b.partNumber);
  const total = parts.reduce((sum, part) => sum + part.size, 0);
  const complete =
    parts.length === pending.partCount &&
    parts.every((part, index) => part.partNumber === index + 1) &&
    total === pending.size;
  if (!complete) {
    throw new AppError(
      409,
      'UPLOAD_INCOMPLETE',
      'Some parts of this file did not arrive. Resume the upload to send them.',
    );
  }
  await driver.completeMultipartUpload(pending.storageKey, pending.s3UploadId, parts);
}

// The file is in S3: check what it really is, claim the space, create the File.
async function registerFile(pending) {
  const { storageKey, metadata, size } = pending;
  const folder = await assertCanUploadTo(metadata.userId, metadata.workspaceId, metadata.folderId);
  const header = await getStorageDriver().readStart(storageKey, Math.min(SNIFF_BYTES, size));
  const mime = await mimeFromHeader(header, metadata.extension);
  // Checked again: a linked project may have been deleted while the bytes arrived.
  const linkedProjectIds = await resolveLinkedProjectIds(
    metadata.workspaceId,
    splitList(metadata.linkedProjectIds),
    folder.projectId,
  ).catch(() => []);
  await reserveStorage(metadata.workspaceId, size);
  try {
    return await StoredFile.create({
      workspaceId: metadata.workspaceId,
      projectId: metadata.projectId || null,
      folderId: metadata.folderId,
      displayName: metadata.filename,
      extension: metadata.extension,
      category: metadata.category,
      storageKey,
      size,
      mime,
      tags: splitList(metadata.tags),
      linkedProjectIds,
      uploadedBy: metadata.userId,
    });
  } catch (err) {
    await releaseStorage(metadata.workspaceId, size);
    throw err;
  }
}

export async function completeDirectUpload(user, uploadId) {
  const found = await findOwnPending(user._id, uploadId);
  // Only one request gets to complete it (a retried "complete" can't make two files).
  const pending = await PendingUpload.findOneAndUpdate(
    { _id: found._id, completingAt: null },
    { $set: { completingAt: new Date() } },
    { new: true },
  );
  if (!pending) throw AppError.conflict('This upload is already being saved', 'UPLOAD_COMPLETING');

  try {
    await joinParts(pending);
  } catch (err) {
    // Nothing joined yet: the parts stay, so the browser can resume and retry.
    await PendingUpload.updateOne({ _id: pending._id }, { $set: { completingAt: null } });
    throw err;
  }

  let file;
  try {
    file = await registerFile(pending);
  } catch (err) {
    // Refused (file type, quota, permission): the object is removed again.
    await getStorageDriver()
      .delete(pending.storageKey)
      .catch(() => {});
    await PendingUpload.deleteOne({ _id: pending._id });
    throw err;
  }
  await PendingUpload.deleteOne({ _id: pending._id });
  await markBriefStale(file.workspaceId, file.folderId);

  const { metadata } = pending;
  if (metadata.transcribe) {
    await queueTranscriptForUpload(file, {
      userId: metadata.userId,
      language: metadata.transcribeLanguage || null,
      task: metadata.transcribe,
    }).catch((err) => logger.error({ err }, 'Could not queue a transcript for an upload'));
  } else {
    // A clip in a Notes & Briefs folder: transcribed by itself (measuring its
    // length can take a moment, so the upload doesn't wait for it).
    void autoTranscribeIfInBriefs(file.workspaceId, file._id);
  }
  return { fileId: String(file._id) };
}

export async function cancelDirectUpload(user, uploadId) {
  let pending;
  try {
    pending = await findOwnPending(user._id, uploadId);
  } catch (err) {
    if (err.statusCode === 404) return; // already gone
    throw err;
  }
  if (pending.completingAt) return;
  await getStorageDriver().abortMultipartUpload(pending.storageKey, pending.s3UploadId);
  await PendingUpload.deleteOne({ _id: pending._id });
}

// Aborts uploads nobody touched for a day, so their parts stop costing storage.
export async function sweepExpiredUploads() {
  const driver = getStorageDriver();
  const expired = await PendingUpload.find({
    expiresAt: { $lt: new Date() },
    completingAt: null,
  })
    .limit(200)
    .lean();
  for (const pending of expired) {
    try {
      await driver.abortMultipartUpload(pending.storageKey, pending.s3UploadId);
      await PendingUpload.deleteOne({ _id: pending._id });
    } catch (err) {
      logger.warn({ err, uploadId: String(pending._id) }, 'Could not abort an expired upload');
    }
  }
}

let sweepTimer = null;

export function startUploadSweeper() {
  const run = () =>
    sweepExpiredUploads().catch((err) => logger.warn({ err }, 'Upload sweep failed'));
  run();
  sweepTimer = setInterval(run, SWEEP_EVERY_MS);
  sweepTimer.unref();
}

export function stopUploadSweeper() {
  clearInterval(sweepTimer);
  sweepTimer = null;
}
