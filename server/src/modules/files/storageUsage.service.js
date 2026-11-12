import { findPoolWorkspace } from '../workspaces/storagePool.js';
import { Workspace, poolIdOf, storageLimitBytes } from '../workspaces/workspace.model.js';
import { StoredFile } from './file.model.js';
import { FILE_CATEGORIES } from './fileTypes.js';
import { scheduleReconcile } from './storageReconcile.service.js';

// How the account's storage is split by file type (video, image, ...), across
// every workspace that shares this one's storage pool. Only totals leave here,
// never file names, so folder permissions and other workspaces stay private.
export async function getStorageUsage(workspace) {
  const pool = await findPoolWorkspace(workspace);
  const poolId = poolIdOf(pool);
  const members = await Workspace.find({ $or: [{ _id: poolId }, { storagePoolId: poolId }] })
    .select('_id')
    .lean();
  const workspaceIds = members.map((member) => member._id);

  const rows = await StoredFile.aggregate([
    { $match: { workspaceId: { $in: workspaceIds } } },
    {
      $group: {
        _id: { category: '$category', trashed: { $ne: ['$deletedAt', null] } },
        bytes: { $sum: '$size' },
        count: { $sum: 1 },
      },
    },
  ]);

  const byCategory = new Map(FILE_CATEGORIES.map((category) => [category, { bytes: 0, count: 0 }]));
  const trash = { bytes: 0, count: 0 };
  for (const row of rows) {
    const target = row._id.trashed ? trash : byCategory.get(row._id.category);
    if (!target) continue;
    target.bytes += row.bytes;
    target.count += row.count;
  }

  const categories = [...byCategory]
    .map(([category, totals]) => ({ category, ...totals }))
    .sort((a, b) => b.bytes - a.bytes);

  // Shown from the files themselves, so the meter is right even if the running
  // counter has drifted; a drifted counter is then repaired in the background.
  let usedBytes = 0;
  for (const totals of byCategory.values()) usedBytes += totals.bytes;
  for (const row of rows)
    if (!row._id.trashed && !byCategory.has(row._id.category)) usedBytes += row.bytes;
  if (usedBytes !== pool.storage.usedBytes) scheduleReconcile(poolId);

  return {
    usedBytes,
    limitBytes: storageLimitBytes(pool),
    workspaceCount: workspaceIds.length,
    categories,
    // Trashed files no longer count toward the limit; shown so people know what emptying Trash frees.
    trash,
  };
}
