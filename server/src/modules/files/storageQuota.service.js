import { AppError } from '../../utils/AppError.js';
import { formatBytes } from '../../utils/bytes.js';
import { effectiveStatus } from '../billing/planLifecycle.service.js';
import { poolIdForWorkspaceId } from '../workspaces/storagePool.js';
import { Workspace, storageLimitBytes } from '../workspaces/workspace.model.js';

// All checks and counters below act on the account ("pool") workspace, so every
// workspace an owner runs draws from the one plan and storage allowance.
// assertUploadsAllowed/assertHasRoom take that pool workspace; reserve/release
// take any workspace id and resolve its pool themselves.

// Uploads are allowed while a plan is live. Past-due workspaces keep uploading
// during the grace period; read-only, cancelled and plan-less ones do not.
const UPLOADING_STATUSES = ['trialing', 'active', 'past_due'];

function storageFull(workspace, bytes) {
  const free = Math.max(0, storageLimitBytes(workspace) - workspace.storage.usedBytes);
  return new AppError(
    413,
    'STORAGE_FULL',
    `Not enough storage: this file needs ${formatBytes(bytes)} and ${formatBytes(free)} is free. ` +
      'Free up space or add storage to keep uploading.',
  );
}

export function assertUploadsAllowed(workspace) {
  const { trialEndsAt } = workspace.billing;
  // A paid period that has run out counts from the moment it ends, not from
  // the next sweep.
  const status = effectiveStatus(workspace.billing);
  if (status === 'read_only') {
    throw AppError.forbidden(
      'Your plan has ended, so this workspace is read-only. Renew to keep uploading.',
      'PLAN_EXPIRED',
    );
  }
  if (!UPLOADING_STATUSES.includes(status)) {
    throw AppError.forbidden('Uploads need an active plan for this workspace', 'PLAN_REQUIRED');
  }
  if (status === 'trialing' && trialEndsAt && trialEndsAt < new Date()) {
    throw AppError.forbidden(
      'Your trial has ended. Choose a plan to keep uploading.',
      'TRIAL_ENDED',
    );
  }
}

// Checked before an upload starts, so nobody waits an hour to hear the disk is full.
export function assertHasRoom(workspace, bytes) {
  if (workspace.storage.usedBytes + bytes > storageLimitBytes(workspace)) {
    throw storageFull(workspace, bytes);
  }
}

// Atomically claims space when an upload completes. The condition makes two
// parallel uploads unable to overshoot the limit together.
export async function reserveStorage(workspaceId, bytes) {
  const poolId = await poolIdForWorkspaceId(workspaceId);
  const result = await Workspace.updateOne(
    {
      _id: poolId,
      $expr: {
        $lte: [
          { $add: ['$storage.usedBytes', bytes] },
          { $add: ['$storage.planLimitBytes', '$storage.bonusBytes'] },
        ],
      },
    },
    { $inc: { 'storage.usedBytes': bytes } },
  );
  if (result.modifiedCount !== 1) {
    const pool = await Workspace.findById(poolId).lean();
    throw storageFull(pool, bytes);
  }
}

// Never lets the counter drop below zero, even if it had drifted.
export async function releaseStorage(workspaceId, bytes) {
  if (!bytes) return;
  const poolId = await poolIdForWorkspaceId(workspaceId);
  await Workspace.updateOne({ _id: poolId }, [
    {
      $set: {
        'storage.usedBytes': { $max: [0, { $subtract: ['$storage.usedBytes', bytes] }] },
      },
    },
  ]);
}
