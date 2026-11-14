import { AUTH } from '../../config/constants.js';
import { AppError } from '../../utils/AppError.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { deliverEmailInBackground } from '../../utils/mailer.js';
import { hashPassword } from '../../utils/password.js';
import { minutesFromNow } from '../../utils/time.js';
import { User } from '../users/user.model.js';
import { passwordResetEmail } from './auth.emails.js';
import { revokeAllSessions } from './session.service.js';

// Always resolves the same way so the endpoint can't be used to discover accounts.
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email, status: 'active' });
  if (!user) return;

  const token = randomToken(32);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordReset: {
          tokenHash: sha256(token),
          expiresAt: minutesFromNow(AUTH.PASSWORD_RESET_TTL_MINUTES),
        },
      },
    },
  );
  deliverEmailInBackground(passwordResetEmail({ to: user.email, name: user.name, token }));
}

export async function resetPassword({ token, password }) {
  const user = await User.findOne({
    'passwordReset.tokenHash': sha256(token),
    'passwordReset.expiresAt': { $gt: new Date() },
  });
  if (!user) {
    throw AppError.badRequest('This reset link is invalid or has expired', 'TOKEN_INVALID');
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash: await hashPassword(password),
        hasPassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      $unset: { passwordReset: 1 },
    },
  );
  await revokeAllSessions(user._id, 'password_reset');
}
