import { AppError } from '../../utils/AppError.js';
import { Membership } from './membership.model.js';

export function findActiveMembership({ workspaceId, userId }) {
  return Membership.findOne({ workspaceId, userId, status: 'active' }).lean();
}

export function addOwnerMembership({ workspaceId, userId }) {
  return Membership.create({
    workspaceId,
    userId,
    role: 'owner',
    status: 'active',
    joinedAt: new Date(),
  });
}

// Deliberately cross-tenant: a user's own memberships span workspaces.
export function listActiveMembershipsForUser(userId) {
  return Membership.find({ userId, status: 'active' })
    .setOptions({ crossWorkspace: true })
    .populate('workspaceId')
    .sort({ createdAt: 1 })
    .lean();
}

export async function listActiveMembers(workspaceId) {
  const memberships = await Membership.find({ workspaceId, status: 'active' })
    .populate('userId', 'name email avatarUrl')
    .sort({ createdAt: 1 })
    .lean();

  return memberships
    .filter((membership) => membership.userId)
    .map((membership) => ({
      userId: String(membership.userId._id),
      name: membership.userId.name,
      email: membership.userId.email,
      avatarUrl: membership.userId.avatarUrl ?? null,
      role: membership.role,
    }));
}

async function findManageableMember(workspace, userId) {
  const membership = await Membership.findOne({
    workspaceId: workspace._id,
    userId,
    status: 'active',
  }).lean();
  if (!membership) throw AppError.notFound('Member not found');
  if (String(workspace.ownerId) === String(userId) || membership.role === 'owner') {
    throw AppError.forbidden("The workspace owner can't be changed or removed", 'OWNER_PROTECTED');
  }
  return membership;
}

export async function changeMemberRole(workspace, actorId, userId, role) {
  if (String(actorId) === String(userId)) {
    throw AppError.forbidden("You can't change your own role", 'SELF_ROLE');
  }
  await findManageableMember(workspace, userId);
  await Membership.updateOne({ workspaceId: workspace._id, userId }, { $set: { role } });
}

// Admins remove others; anyone but the owner can remove themselves (leave).
export async function removeMember(workspace, actorMembership, userId) {
  const self = String(actorMembership.userId) === String(userId);
  if (!self && !['owner', 'admin'].includes(actorMembership.role)) {
    throw AppError.forbidden("Your role in this workspace doesn't allow this");
  }
  await findManageableMember(workspace, userId);
  await Membership.updateOne(
    { workspaceId: workspace._id, userId },
    { $set: { status: 'inactive' } },
  );
}

export async function assertActiveMember(workspaceId, userId) {
  const exists = await Membership.exists({ workspaceId, userId, status: 'active' });
  if (!exists) {
    throw AppError.badRequest('That person is not a member of this workspace', 'NOT_A_MEMBER');
  }
}
