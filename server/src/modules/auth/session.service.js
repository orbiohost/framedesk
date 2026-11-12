import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';
import { daysFromNow } from '../../utils/time.js';
import { User } from '../users/user.model.js';
import { RefreshToken } from './refreshToken.model.js';
import { signAccessToken } from './token.service.js';

function sessionExpired() {
  return AppError.unauthorized(
    'Your session has expired. Please sign in again.',
    'SESSION_EXPIRED',
  );
}

async function issueTokens({ userId, familyId, meta }) {
  const refreshToken = randomToken(48);
  const refreshExpiresAt = daysFromNow(env.REFRESH_TOKEN_TTL_DAYS);

  await RefreshToken.create({
    userId,
    familyId,
    tokenHash: sha256(refreshToken),
    expiresAt: refreshExpiresAt,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  const accessToken = signAccessToken({ userId, sessionId: familyId });
  return { accessToken, refreshToken, refreshExpiresAt };
}

async function revokeFamily(familyId, reason) {
  await RefreshToken.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}

export function createSession(userId, meta) {
  return issueTokens({ userId, familyId: randomUUID(), meta });
}

// Each refresh token works exactly once. Presenting one that was already used
// means it leaked, so the whole session family is revoked.
export async function rotateSession(rawRefreshToken, meta) {
  const stored = await RefreshToken.findOne({ tokenHash: sha256(rawRefreshToken) });
  if (!stored || stored.expiresAt <= new Date()) throw sessionExpired();

  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: stored._id, replacedAt: null, revokedAt: null },
    { $set: { replacedAt: new Date() } },
  );
  if (!claimed) {
    await revokeFamily(stored.familyId, 'reuse_detected');
    logger.warn({ userId: String(stored.userId) }, 'Refresh token reuse detected, session revoked');
    throw sessionExpired();
  }

  const user = await User.findById(stored.userId).select('status');
  if (!user || user.status !== 'active') {
    await revokeFamily(stored.familyId, 'user_inactive');
    throw sessionExpired();
  }

  await User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } });
  return issueTokens({ userId: user._id, familyId: stored.familyId, meta });
}

export async function revokeSessionByToken(rawRefreshToken) {
  const stored = await RefreshToken.findOne({ tokenHash: sha256(rawRefreshToken) }).select(
    'familyId',
  );
  if (stored) await revokeFamily(stored.familyId, 'logout');
}

export async function revokeAllSessions(userId, reason, { exceptSessionId } = {}) {
  const filter = { userId, revokedAt: null };
  if (exceptSessionId) filter.familyId = { $ne: exceptSessionId };
  await RefreshToken.updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason } });
}

// Called on every authenticated request. Checking the session family (not just
// the JWT signature) makes logout and reuse-revocation take effect immediately.
export async function resolveSessionUser({ userId, sessionId }) {
  const [user, sessionIsLive] = await Promise.all([
    User.findById(userId).lean(),
    RefreshToken.exists({ familyId: sessionId, revokedAt: null, expiresAt: { $gt: new Date() } }),
  ]);
  if (!user || !sessionIsLive) throw sessionExpired();
  if (user.status !== 'active') {
    throw AppError.forbidden('This account has been suspended', 'ACCOUNT_SUSPENDED');
  }
  return user;
}
