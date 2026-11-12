/* eslint-disable no-console -- CLI script: printing the result is its job. */
// One-off (safe to re-run) migration for shared account storage:
//
//   npm run migrate:storage-pools -w server            (apply)
//   npm run migrate:storage-pools -w server -- --dry   (just report)
//
// 1. Every extra workspace an owner created without a plan of its own is linked
//    to the owner's account workspace, so it uses that plan and storage.
// 2. Each account's used bytes are recounted from the files that are not in
//    Trash, across the account and every workspace sharing it. This also fixes
//    space that trashed files kept holding before Trash started freeing it.
import { parseArgs } from 'node:util';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { StoredFile } from '../src/modules/files/file.model.js';
import { findOwnerAccountWorkspace } from '../src/modules/workspaces/storagePool.js';
import { Workspace } from '../src/modules/workspaces/workspace.model.js';

const { values } = parseArgs({ options: { dry: { type: 'boolean', default: false } } });
const dryRun = values.dry;

async function linkExtraWorkspaces() {
  let linked = 0;
  const ownerIds = await Workspace.distinct('ownerId');
  for (const ownerId of ownerIds) {
    const account = await findOwnerAccountWorkspace(ownerId);
    if (!account) continue;
    const extras = await Workspace.find({
      ownerId,
      _id: { $ne: account._id },
      storagePoolId: null,
      'billing.status': 'none',
    }).lean();
    for (const extra of extras) {
      console.log(
        `link "${extra.name}" (${extra._id}) -> account "${account.name}" (${account._id})`,
      );
      if (!dryRun) {
        await Workspace.updateOne({ _id: extra._id }, { $set: { storagePoolId: account._id } });
      }
      linked += 1;
    }
  }
  return linked;
}

async function recountUsage() {
  const accounts = await Workspace.find({ storagePoolId: null }).lean();
  for (const account of accounts) {
    const members = await Workspace.find({ storagePoolId: account._id }).select('_id').lean();
    const workspaceIds = [account._id, ...members.map((workspace) => workspace._id)];
    const [row] = await StoredFile.aggregate([
      { $match: { workspaceId: { $in: workspaceIds }, deletedAt: null } },
      { $group: { _id: null, bytes: { $sum: '$size' } } },
    ]).option({ crossWorkspace: true });
    const bytes = row?.bytes ?? 0;
    if (bytes !== account.storage.usedBytes) {
      console.log(`"${account.name}": ${account.storage.usedBytes} -> ${bytes} bytes used`);
    }
    if (!dryRun) {
      await Workspace.updateOne({ _id: account._id }, { $set: { 'storage.usedBytes': bytes } });
      await Workspace.updateMany(
        { storagePoolId: account._id },
        { $set: { 'storage.usedBytes': 0 } },
      );
    }
  }
}

await connectDatabase();
try {
  const linked = await linkExtraWorkspaces();
  await recountUsage();
  console.log(`${dryRun ? '[dry run] ' : ''}Done. ${linked} workspace(s) linked to their account.`);
} finally {
  await disconnectDatabase();
}
