import { logger } from '../../utils/logger.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { StoredFile } from './file.model.js';

// The pool's storage.usedBytes is a running counter (claimed on upload, freed on
// trash/delete) so quota checks stay cheap and atomic. If it ever drifts, e.g. an
// upload path that claimed space without creating a file or the other way round,
// the meter and the quota are wrong for good. This recomputes it from the files
// themselves: the bytes of every file not in Trash, across the pool's workspaces.

// The counter and the files are written a moment apart (space is claimed, then
// the file is created), so a single look can catch an upload or delete halfway.
// A mismatch is only repaired if it is still exactly the same after this pause.
const SETTLE_MS = 5000;
const RECONCILE_EVERY_MS = 6 * 60 * 60 * 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function poolWorkspaceIds(poolId) {
  const members = await Workspace.find({ $or: [{ _id: poolId }, { storagePoolId: poolId }] })
    .select('_id')
    .lean();
  return members.map((member) => member._id);
}

// Bytes of the files that count toward the limit (not in Trash).
export async function liveBytesFor(workspaceIds) {
  const [row] = await StoredFile.aggregate([
    { $match: { workspaceId: { $in: workspaceIds }, deletedAt: null } },
    { $group: { _id: null, bytes: { $sum: '$size' } } },
  ]);
  return row?.bytes ?? 0;
}

async function snapshot(poolId) {
  const ids = await poolWorkspaceIds(poolId);
  const actual = await liveBytesFor(ids);
  const pool = await Workspace.findById(poolId).select('storage.usedBytes').lean();
  return { actual, counted: pool?.storage?.usedBytes ?? 0 };
}

// Returns true when the counter was corrected.
export async function reconcilePoolStorage(poolId) {
  const first = await snapshot(poolId);
  if (first.actual === first.counted) return false;
  await wait(SETTLE_MS);
  const second = await snapshot(poolId);
  if (second.actual !== first.actual || second.counted !== first.counted) return false; // busy; next run
  // Only if nothing moved the counter since it was read.
  const result = await Workspace.updateOne(
    { _id: poolId, 'storage.usedBytes': second.counted },
    { $set: { 'storage.usedBytes': second.actual } },
  );
  if (result.modifiedCount !== 1) return false;
  logger.warn(
    { poolId: String(poolId), counted: second.counted, actual: second.actual },
    'Storage counter had drifted; corrected it from the stored files',
  );
  return true;
}

const running = new Set();

// Fire-and-forget repair for one pool (deduplicated while one is in flight).
export function scheduleReconcile(poolId) {
  const key = String(poolId);
  if (running.has(key)) return;
  running.add(key);
  reconcilePoolStorage(poolId)
    .catch((err) => logger.warn({ err, poolId: key }, 'Storage reconcile failed'))
    .finally(() => running.delete(key));
}

export async function reconcileAllPools() {
  const pools = await Workspace.find({ storagePoolId: null }).select('_id').lean();
  let fixed = 0;
  for (const pool of pools) {
    try {
      if (await reconcilePoolStorage(pool._id)) fixed += 1;
    } catch (err) {
      logger.warn({ err, poolId: String(pool._id) }, 'Storage reconcile failed');
    }
  }
  return { checked: pools.length, fixed };
}

let timer = null;

export function startStorageReconciler() {
  const run = () =>
    reconcileAllPools().catch((err) => logger.warn({ err }, 'Storage reconcile run failed'));
  run();
  timer = setInterval(run, RECONCILE_EVERY_MS);
  timer.unref();
}

export function stopStorageReconciler() {
  clearInterval(timer);
  timer = null;
}
