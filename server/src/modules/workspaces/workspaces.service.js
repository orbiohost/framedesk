import { TRIAL } from '../../config/constants.js';
import { AppError } from '../../utils/AppError.js';
import { daysFromNow } from '../../utils/time.js';
import {
  addOwnerMembership,
  findActiveMembership,
  listActiveMembershipsForUser,
} from '../members/members.service.js';
import { User } from '../users/user.model.js';
import { cached } from '../../utils/cache.js';
import {
  findOwnerAccountWorkspace,
  findPoolWorkspace,
  findWorkspaceCached,
  poolsFor,
} from './storagePool.js';
import { Workspace, poolIdOf, storageLimitBytes } from './workspace.model.js';

export function defaultWorkspaceName(ownerName) {
  const firstName = ownerName.trim().split(/\s+/)[0];
  return `${firstName}'s Studio`;
}

// `pool` is the account workspace whose plan and storage this one shares.
export function toWorkspaceSummary(workspace, membership, pool = workspace) {
  return {
    id: String(workspace._id),
    name: workspace.name,
    role: membership.role,
    isOwner: String(workspace.ownerId) === String(membership.userId),
    billing: {
      planCode: pool.billing.planCode,
      status: pool.billing.status,
      trialEndsAt: pool.billing.trialEndsAt,
    },
    storage: {
      usedBytes: pool.storage.usedBytes,
      limitBytes: storageLimitBytes(pool),
      // True when this workspace uses another workspace's plan and space.
      shared: String(pool._id) !== String(workspace._id),
      accountWorkspaceId: String(pool._id),
      accountWorkspaceName: pool.name,
    },
    createdAt: workspace.createdAt,
  };
}

// Each user gets one free trial, on the first workspace they create.
// The conditional update makes the claim atomic.
async function claimTrial(userId) {
  const result = await User.updateOne(
    { _id: userId, trialStartedAt: null },
    { $set: { trialStartedAt: new Date() } },
  );
  return result.modifiedCount === 1;
}

function initialPlanState(hasTrial) {
  if (!hasTrial) return { billing: { status: 'none' }, storage: { planLimitBytes: 0 } };
  return {
    billing: {
      planCode: TRIAL.PLAN_CODE,
      status: 'trialing',
      trialEndsAt: daysFromNow(TRIAL.DAYS),
    },
    storage: { planLimitBytes: TRIAL.STORAGE_BYTES },
  };
}

// An owner's first workspace is their account. Later ones share its plan and
// storage instead of starting with their own (empty) allowance.
async function newWorkspaceFields(ownerId) {
  const account = await findOwnerAccountWorkspace(ownerId);
  if (account) {
    return {
      account,
      fields: { storagePoolId: account._id, billing: { status: 'none' }, storage: {} },
    };
  }
  const hasTrial = await claimTrial(ownerId);
  return { account: null, fields: initialPlanState(hasTrial) };
}

export async function createWorkspace({ ownerId, name }) {
  const { account, fields } = await newWorkspaceFields(ownerId);
  const workspace = await Workspace.create({ name, ownerId, ...fields });

  // No multi-document transaction here; undo the workspace by hand if the
  // membership insert fails so we never leave an ownerless workspace behind.
  try {
    const membership = await addOwnerMembership({ workspaceId: workspace._id, userId: ownerId });
    return toWorkspaceSummary(workspace, membership, account ?? workspace);
  } catch (err) {
    await Workspace.deleteOne({ _id: workspace._id });
    throw err;
  }
}

export async function listWorkspacesForUser(userId) {
  const memberships = (await listActiveMembershipsForUser(userId)).filter(
    (membership) => membership.workspaceId,
  );
  const pools = await poolsFor(memberships.map((membership) => membership.workspaceId));
  return memberships.map((membership) => {
    const workspace = membership.workspaceId;
    const pool = pools.get(String(poolIdOf(workspace))) ?? workspace;
    return toWorkspaceSummary(workspace, membership, pool);
  });
}

// Responds 404 (not 403) for non-members so workspace ids can't be probed.
// Runs on every workspace request, so the two independent lookups go out
// together: one database round trip less per request. The workspace is only
// returned once the membership check has passed.
export async function findWorkspaceForMember({ workspaceId, userId }) {
  const [membership, workspace] = await Promise.all([
    cached(`membership:${workspaceId}:${userId}`, [`members:${workspaceId}`], () =>
      findActiveMembership({ workspaceId, userId }),
    ),
    findWorkspaceCached(workspaceId),
  ]);
  if (!membership || !workspace) throw AppError.notFound('Workspace not found');

  const pool = await findPoolWorkspace(workspace);
  return { workspace, membership, pool };
}

export async function renameWorkspace(workspaceId, { name }) {
  const workspace = await Workspace.findByIdAndUpdate(
    workspaceId,
    { $set: { name } },
    { new: true, runValidators: true },
  ).lean();
  if (!workspace) throw AppError.notFound('Workspace not found');
  return workspace;
}
