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

export async function assertActiveMember(workspaceId, userId) {
  const exists = await Membership.exists({ workspaceId, userId, status: 'active' });
  if (!exists) {
    throw AppError.badRequest('That person is not a member of this workspace', 'NOT_A_MEMBER');
  }
}
