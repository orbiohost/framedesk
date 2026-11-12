import { Workspace, poolIdOf } from './workspace.model.js';

// Every workspace an owner creates draws on one account: the owner's first
// workspace holds the plan, the storage limit and the bytes used by all of them.

// The workspace that holds the plan and storage for `workspace` (often itself).
export async function findPoolWorkspace(workspace) {
  if (!workspace.storagePoolId) return workspace;
  const pool = await Workspace.findById(workspace.storagePoolId).lean();
  return pool ?? workspace;
}

export async function findPoolWorkspaceById(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).lean();
  return workspace ? findPoolWorkspace(workspace) : null;
}

export async function poolIdForWorkspaceId(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).select('_id storagePoolId').lean();
  return workspace ? poolIdOf(workspace) : workspaceId;
}

// Map of pool id -> pool workspace for a list of workspaces, in one query.
export async function poolsFor(workspaces) {
  const ids = [...new Set(workspaces.filter(Boolean).map((ws) => String(poolIdOf(ws))))];
  const pools = await Workspace.find({ _id: { $in: ids } }).lean();
  return new Map(pools.map((pool) => [String(pool._id), pool]));
}

// The account workspace an owner's new workspaces should share, if they have one:
// their oldest workspace with a plan, else simply their oldest workspace.
export async function findOwnerAccountWorkspace(ownerId) {
  const accounts = await Workspace.find({ ownerId, storagePoolId: null })
    .sort({ createdAt: 1 })
    .lean();
  return accounts.find((workspace) => workspace.billing.status !== 'none') ?? accounts[0] ?? null;
}
