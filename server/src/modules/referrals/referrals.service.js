import { randomInt } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { getCatalog } from '../plans/plans.service.js';
import { User } from '../users/user.model.js';
import { findOwnerAccountWorkspace } from '../workspaces/storagePool.js';
import { Workspace } from '../workspaces/workspace.model.js';

// Refer & earn. Everyone has a code and a link (/signup?ref=CODE). A friend who
// signs up with it and verifies their email:
//   - earns whoever invited them extra storage (rewardGB, up to rewardLimit friends),
//   - gets a discount on their own first paid plan (billing/discounts.service.js).
// The amounts come from the plan settings (Admin → Plans & coupons).

const GB = 1024 ** 3;
// No 0/O/1/I, so a code read out loud is typed right.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
// A referral can be claimed this soon after signing up, and no later.
const CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function newCode() {
  return Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

async function ensureCode(userId) {
  const user = await User.findById(userId).select('referralCode').lean();
  if (user?.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const updated = await User.findOneAndUpdate(
        { _id: userId, referralCode: { $exists: false } },
        { $set: { referralCode: newCode() } },
        { new: true },
      )
        .select('referralCode')
        .lean();
      if (updated) return updated.referralCode;
      // Someone else (another tab) set it first.
      return (await User.findById(userId).select('referralCode').lean()).referralCode;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  throw AppError.conflict('Could not make a referral code just now. Please try again.');
}

export async function getMyReferrals(user) {
  const { referral } = await getCatalog();
  const code = await ensureCode(user._id);
  const [me, invited, rewarded] = await Promise.all([
    User.findById(user._id).select('referralRewards referredBy').lean(),
    User.countDocuments({ referredBy: user._id }),
    User.countDocuments({ referredBy: user._id, referralRewardedAt: { $ne: null } }),
  ]);
  const rewards = me?.referralRewards ?? 0;
  return {
    enabled: referral.enabled,
    code,
    link: `${env.CLIENT_URL}/signup?ref=${code}`,
    invited,
    joined: rewarded,
    rewardGB: referral.rewardGB,
    rewardLimit: referral.rewardLimit,
    rewardsLeft: Math.max(0, referral.rewardLimit - rewards),
    earnedGB: rewards * referral.rewardGB,
    discountPercent: referral.discountPercent,
    wasReferred: Boolean(me?.referredBy),
  };
}

/**
 * Gives the inviter their storage once the friend's email is verified. Safe to
 * call any number of times: each friend counts once, and the inviter's count
 * only goes up while it is under the limit. Never throws.
 */
export async function rewardReferrer(friendId) {
  try {
    const { referral } = await getCatalog();
    if (!referral.enabled || referral.rewardGB <= 0) return;
    const friend = await User.findById(friendId)
      .select('referredBy referralRewardedAt emailVerifiedAt')
      .lean();
    if (!friend?.referredBy || friend.referralRewardedAt || !friend.emailVerifiedAt) return;

    const inviter = await User.findOneAndUpdate(
      { _id: friend.referredBy, referralRewards: { $lt: referral.rewardLimit } },
      { $inc: { referralRewards: 1 } },
      { new: true },
    ).lean();
    if (!inviter) return; // already earned all there is
    const marked = await User.updateOne(
      { _id: friendId, referralRewardedAt: null },
      { $set: { referralRewardedAt: new Date() } },
    );
    if (marked.modifiedCount !== 1) {
      // Counted by a parallel call; give the count back.
      await User.updateOne({ _id: inviter._id }, { $inc: { referralRewards: -1 } });
      return;
    }
    const account = await findOwnerAccountWorkspace(inviter._id);
    if (account) {
      await Workspace.updateOne(
        { _id: account._id },
        { $inc: { 'storage.bonusBytes': Math.round(referral.rewardGB * GB) } },
      );
    }
    logger.info({ inviter: String(inviter._id), friend: String(friendId) }, 'Referral rewarded');
  } catch (error) {
    logger.error({ err: error, friendId: String(friendId) }, 'Could not reward a referral');
  }
}

// Links a new account to whoever invited it (from the ?ref= link).
export async function claimReferral(user, rawCode) {
  const { referral } = await getCatalog();
  if (!referral.enabled) return { claimed: false, reason: 'off' };
  const code = String(rawCode ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return { claimed: false, reason: 'invalid' };

  const me = await User.findById(user._id).select('referredBy createdAt referralCode').lean();
  if (me.referredBy) return { claimed: false, reason: 'already' };
  if (Date.now() - new Date(me.createdAt).getTime() > CLAIM_WINDOW_MS) {
    return { claimed: false, reason: 'too_late' };
  }
  const inviter = await User.findOne({ referralCode: code }).select('_id').lean();
  if (!inviter || String(inviter._id) === String(user._id)) {
    return { claimed: false, reason: 'invalid' };
  }
  const result = await User.updateOne(
    { _id: user._id, referredBy: null },
    { $set: { referredBy: inviter._id, referredAt: new Date() } },
  );
  if (result.modifiedCount !== 1) return { claimed: false, reason: 'already' };
  // Google accounts are verified already; email sign-ups get there on verifying.
  await rewardReferrer(user._id);
  return { claimed: true, discountPercent: referral.discountPercent };
}
