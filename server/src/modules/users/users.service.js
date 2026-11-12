import { AppError } from '../../utils/AppError.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { revokeAllSessions } from '../auth/session.service.js';
import { User } from './user.model.js';

export function toPublicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    avatarUrl: user.avatarUrl ?? null,
    isSuperadmin: Boolean(user.isSuperadmin),
    createdAt: user.createdAt,
  };
}

export async function updateProfile(userId, { name }) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { name } },
    { new: true, runValidators: true },
  );
  if (!user) throw AppError.notFound('User not found');
  return user;
}

// Signs out every other device; the session making the change stays signed in.
export async function changePassword(userId, { currentPassword, newPassword }, currentSessionId) {
  const user = await User.findById(userId).select('+passwordHash');
  const isCorrect =
    user?.passwordHash && (await verifyPassword(user.passwordHash, currentPassword));
  if (!isCorrect) {
    throw AppError.badRequest('Your current password is incorrect', 'WRONG_PASSWORD');
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await revokeAllSessions(userId, 'password_changed', { exceptSessionId: currentSessionId });
}
