import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { storageConfig } from '../../config/storage.js';
import { createToken, readToken } from '../../storage/signedToken.js';
import { AppError } from '../../utils/AppError.js';
import { formatBytes } from '../../utils/bytes.js';
import { AuditLog } from '../admin/auditLog.model.js';
import { findActiveMembership } from '../members/members.service.js';
import { ADMIN_ROLES } from '../members/roles.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { restoreBackup } from './backupRestore.service.js';

const LINK_TTL_SECONDS = 5 * 60;
const restoresInProgress = new Set();

function toRange({ from, to }) {
  return from && to ? { from, to } : null;
}

// The download itself is a plain browser navigation, so the permission travels
// in a short-lived signed token minted after the usual auth checks.
export function createDownloadLink(workspaceId, userId, { from, to, includeFiles }) {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
  const token = createToken({
    kind: 'backup',
    workspaceId: String(workspaceId),
    userId: String(userId),
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    includeFiles,
    exp,
  });
  return { url: `/api/backup-downloads/${token}` };
}

// Re-checks the role when the download starts, in case it changed since the link was made.
export async function resolveDownload(token) {
  const payload = readToken(token);
  if (payload?.kind !== 'backup')
    throw AppError.notFound('This backup link has expired. Start the backup again.');

  const membership = await findActiveMembership({
    workspaceId: payload.workspaceId,
    userId: payload.userId,
  });
  if (!ADMIN_ROLES.includes(membership?.role)) throw AppError.forbidden();

  const workspace = await Workspace.findById(payload.workspaceId).lean();
  if (!workspace) throw AppError.notFound('Workspace not found');

  const range = payload.from
    ? toRange({ from: new Date(payload.from), to: new Date(payload.to) })
    : null;
  return { workspace, userId: payload.userId, range, includeFiles: payload.includeFiles };
}

export function backupFileName(workspace) {
  const slug =
    workspace.name
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'workspace';
  return `FrameDesk-${slug}-${new Date().toISOString().slice(0, 10)}.zip`;
}

async function saveUploadedZip(req, targetPath) {
  const declared = Number(req.get('content-length'));
  if (declared > storageConfig.maxRestoreBytes) {
    throw new AppError(
      413,
      'BACKUP_TOO_LARGE',
      `Backups up to ${formatBytes(storageConfig.maxRestoreBytes)} can be restored`,
    );
  }

  // Counted inside the pipeline: a separate 'data' listener would start the
  // stream flowing before the file is attached and lose the first chunks.
  let received = 0;
  const sizeGuard = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > storageConfig.maxRestoreBytes) {
        callback(new AppError(413, 'BACKUP_TOO_LARGE', 'This backup is larger than allowed'));
        return;
      }
      callback(null, chunk);
    },
  });
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await pipeline(req, sizeGuard, createWriteStream(targetPath));
  if (received === 0) throw AppError.badRequest('Choose a backup zip to restore', 'EMPTY_BACKUP');
}

// One restore at a time per workspace, so two people can't merge the same zip twice in parallel.
export async function restoreFromUpload(req) {
  const workspaceId = String(req.workspace._id);
  if (restoresInProgress.has(workspaceId)) {
    throw AppError.conflict(
      'A restore is already running for this workspace',
      'RESTORE_IN_PROGRESS',
    );
  }

  restoresInProgress.add(workspaceId);
  const zipPath = path.join(storageConfig.stagingDir, `restore-${randomUUID()}.zip`);
  try {
    await saveUploadedZip(req, zipPath);
    return await restoreBackup({ workspaceId: req.workspace._id, userId: req.user._id, zipPath });
  } finally {
    restoresInProgress.delete(workspaceId);
    await fs.rm(zipPath, { force: true });
  }
}

export async function listBackupHistory(workspaceId) {
  const entries = await AuditLog.find({
    workspaceId,
    action: { $in: ['workspace.backup', 'workspace.restore'] },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .populate('actorId', 'name')
    .lean();

  return entries.map((entry) => ({
    id: String(entry._id),
    type: entry.action === 'workspace.backup' ? 'backup' : 'restore',
    by: entry.actorId?.name ?? 'Someone',
    at: entry.createdAt,
    details: entry.details,
  }));
}
