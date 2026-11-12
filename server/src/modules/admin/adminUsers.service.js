import { AppError } from '../../utils/AppError.js';
import { containsInsensitive } from '../../utils/objects.js';
import { revokeAllSessions } from '../auth/session.service.js';
import { Membership } from '../members/membership.model.js';
import { User } from '../users/user.model.js';
import { poolsFor } from '../workspaces/storagePool.js';
import { poolIdOf, storageLimitBytes } from '../workspaces/workspace.model.js';
import { recordAudit } from './auditLog.service.js';

const PAGE_SIZE = 50;

function toAdminUserDto(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    status: user.status,
    isSuperadmin: user.isSuperadmin,
    emailVerified: Boolean(user.emailVerifiedAt),
    lastActiveAt: user.lastActiveAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export async function listUsers({ q, status, cursor }) {
  const filter = {};
  if (q) filter.$or = [{ name: containsInsensitive(q) }, { email: containsInsensitive(q) }];
  if (status) filter.status = status;
  if (cursor) filter._id = { $lt: cursor };

  const users = await User.find(filter)
    .sort({ _id: -1 })
    .limit(PAGE_SIZE + 1)
    .lean();
  const hasMore = users.length > PAGE_SIZE;
  const page = hasMore ? users.slice(0, PAGE_SIZE) : users;
  return { users: page.map(toAdminUserDto), nextCursor: hasMore ? String(page.at(-1)._id) : null };
}

// A user with every workspace they belong to, and each workspace's plan and storage.
export async function getUserDetail(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw AppError.notFound('User not found');

  const memberships = await Membership.find({ userId })
    .setOptions({ crossWorkspace: true })
    .populate('workspaceId', 'name billing storage storagePoolId')
    .lean();
  const linked = memberships.filter((membership) => membership.workspaceId);
  const pools = await poolsFor(linked.map((membership) => membership.workspaceId));

  return {
    user: toAdminUserDto(user),
    workspaces: linked.map(({ workspaceId: workspace, role, status }) => {
      const pool = pools.get(String(poolIdOf(workspace))) ?? workspace;
      return {
        id: String(workspace._id),
        name: workspace.name,
        role,
        membershipStatus: status,
        billing: pool.billing,
        storage: {
          usedBytes: pool.storage.usedBytes,
          limitBytes: storageLimitBytes(pool),
          shared: String(pool._id) !== String(workspace._id),
        },
      };
    }),
  };
}

// Suspending signs the person out everywhere at once; their data is untouched.
export async function setUserStatus(adminId, userId, status) {
  if (String(adminId) === String(userId)) {
    throw AppError.badRequest("You can't suspend your own account", 'SELF_SUSPEND');
  }
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  if (user.isSuperadmin) throw AppError.forbidden('Other admins cannot be suspended here');

  user.status = status;
  await user.save();
  if (status === 'suspended') await revokeAllSessions(user._id, 'suspended_by_admin');
  await recordAudit({
    actorId: adminId,
    action: `user.${status === 'suspended' ? 'suspend' : 'restore'}`,
    details: { userId: String(user._id), email: user.email },
  });
  return toAdminUserDto(user);
}
