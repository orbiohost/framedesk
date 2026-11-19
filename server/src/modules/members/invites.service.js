import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { deliverEmailInBackground } from '../../utils/mailer.js';
import { daysFromNow } from '../../utils/time.js';
import { workspaceInviteEmail } from '../auth/auth.emails.js';
import { effectiveBilling } from '../billing/planLifecycle.service.js';
import { getCatalog } from '../plans/plans.service.js';
import { User } from '../users/user.model.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { Invite } from './invite.model.js';
import { Membership } from './membership.model.js';

export const INVITE_TTL_DAYS = 7;

function inviteLink(token) {
  return `${env.CLIENT_URL}/invite/${encodeURIComponent(token)}`;
}

function toInvite(invite) {
  return {
    id: String(invite._id),
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
    expired: invite.expiresAt <= new Date(),
    invitedBy: invite.invitedBy?.name ?? null,
    createdAt: invite.createdAt,
  };
}

// Plans with a member limit count active members plus invites still waiting.
async function assertSeatAvailable(workspaceId, pool) {
  const { planCode } = effectiveBilling(pool.billing);
  const catalog = await getCatalog();
  const limit = catalog.plans.find((plan) => plan.code === planCode)?.maxMembers;
  if (!limit) return;
  const [members, pending] = await Promise.all([
    Membership.countDocuments({ workspaceId, status: 'active' }),
    Invite.countDocuments({ workspaceId, status: 'pending', expiresAt: { $gt: new Date() } }),
  ]);
  if (members + pending >= limit) {
    throw AppError.forbidden(
      `Your plan allows up to ${limit} members. Remove someone or upgrade to invite more.`,
      'MEMBER_LIMIT',
    );
  }
}

export async function listInvites(workspaceId) {
  const invites = await Invite.find({ workspaceId, status: 'pending' })
    .populate('invitedBy', 'name')
    .sort({ createdAt: -1 })
    .lean();
  return invites.map(toInvite);
}

// Inviting the same address again replaces the old link (and resends the email).
export async function createInvite({ workspace, pool, inviter }, { email, role }) {
  const existingUser = await User.findOne({ email }).select('_id').lean();
  if (existingUser) {
    const member = await Membership.exists({
      workspaceId: workspace._id,
      userId: existingUser._id,
      status: 'active',
    });
    if (member)
      throw AppError.conflict('That person is already in this workspace', 'ALREADY_MEMBER');
  }

  const alreadyPending = await Invite.exists({
    workspaceId: workspace._id,
    email,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  });
  if (!alreadyPending) await assertSeatAvailable(workspace._id, pool);

  const token = randomToken(32);
  const invite = await Invite.findOneAndUpdate(
    { workspaceId: workspace._id, email, status: 'pending' },
    {
      $set: {
        role,
        tokenHash: sha256(token),
        invitedBy: inviter._id,
        expiresAt: daysFromNow(INVITE_TTL_DAYS),
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  const link = inviteLink(token);
  deliverEmailInBackground(
    workspaceInviteEmail({
      to: email,
      inviterName: inviter.name,
      workspaceName: workspace.name,
      role,
      link,
      days: INVITE_TTL_DAYS,
    }),
  );
  return { invite: toInvite({ ...invite, invitedBy: inviter }), link };
}

export async function revokeInvite(workspaceId, inviteId) {
  const result = await Invite.updateOne(
    { _id: inviteId, workspaceId, status: 'pending' },
    { $set: { status: 'revoked' } },
  );
  if (!result.matchedCount) throw AppError.notFound('Invite not found');
}

// Token lookups are deliberately cross-workspace: the token is the key.
async function findPendingInvite(token) {
  const invite = await Invite.findOne({ tokenHash: sha256(token), status: 'pending' })
    .setOptions({ crossWorkspace: true })
    .populate('invitedBy', 'name')
    .lean();
  if (!invite) {
    throw AppError.notFound(
      'This invite link is invalid or has already been used',
      'INVITE_INVALID',
    );
  }
  return invite;
}

// What the invite page shows before accepting. `user` may be null (signed out).
export async function previewInvite(token, user) {
  const invite = await findPendingInvite(token);
  const workspace = await Workspace.findById(invite.workspaceId).select('name').lean();
  if (!workspace) throw AppError.notFound('This workspace no longer exists', 'INVITE_INVALID');

  const alreadyMember = user
    ? Boolean(
        await Membership.exists({
          workspaceId: invite.workspaceId,
          userId: user._id,
          status: 'active',
        }),
      )
    : false;

  return {
    workspaceId: String(invite.workspaceId),
    workspaceName: workspace.name,
    invitedBy: invite.invitedBy?.name ?? null,
    email: invite.email,
    role: invite.role,
    expired: invite.expiresAt <= new Date(),
    emailMatches: user ? user.email === invite.email : null,
    alreadyMember,
  };
}

export async function acceptInvite(token, user) {
  const invite = await findPendingInvite(token);
  if (invite.expiresAt <= new Date()) {
    throw AppError.badRequest('This invite has expired. Ask for a new one.', 'INVITE_EXPIRED');
  }
  if (user.email !== invite.email) {
    throw AppError.forbidden(
      `This invite is for ${invite.email}. Sign in with that email address to accept it.`,
      'INVITE_WRONG_ACCOUNT',
    );
  }

  const workspaceId = invite.workspaceId;
  const existing = await Membership.findOne({ workspaceId, userId: user._id }).lean();
  if (existing?.status !== 'active') {
    // New, or a former member coming back.
    await Membership.findOneAndUpdate(
      { workspaceId, userId: user._id },
      {
        $set: {
          role: invite.role,
          status: 'active',
          invitedBy: invite.invitedBy?._id ?? null,
          joinedAt: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  await Invite.updateOne(
    { _id: invite._id, workspaceId },
    { $set: { status: 'accepted', acceptedBy: user._id, acceptedAt: new Date() } },
  );
  return { workspaceId: String(workspaceId) };
}
