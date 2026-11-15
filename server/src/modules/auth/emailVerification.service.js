import { AUTH } from '../../config/constants.js';
import { rewardReferrer } from '../referrals/referrals.service.js';
import { AppError } from '../../utils/AppError.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { deliverEmailInBackground } from '../../utils/mailer.js';
import { hoursFromNow } from '../../utils/time.js';
import { User } from '../users/user.model.js';
import { verificationEmail } from './auth.emails.js';

export async function sendVerificationEmail(user) {
  const token = randomToken(32);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        emailVerification: {
          tokenHash: sha256(token),
          expiresAt: hoursFromNow(AUTH.EMAIL_VERIFY_TTL_HOURS),
        },
      },
    },
  );
  deliverEmailInBackground(verificationEmail({ to: user.email, name: user.name, token }));
}

export async function verifyEmail(token) {
  const user = await User.findOneAndUpdate(
    {
      'emailVerification.tokenHash': sha256(token),
      'emailVerification.expiresAt': { $gt: new Date() },
    },
    { $set: { emailVerifiedAt: new Date() }, $unset: { emailVerification: 1 } },
    { new: true },
  );
  if (!user) {
    throw AppError.badRequest('This verification link is invalid or has expired', 'TOKEN_INVALID');
  }
  // A friend who joined through a referral link now counts for whoever invited them.
  await rewardReferrer(user._id);
  return user;
}

export async function resendVerification(user) {
  if (user.emailVerifiedAt) {
    throw AppError.badRequest('Your email is already confirmed', 'ALREADY_VERIFIED');
  }
  await sendVerificationEmail(user);
}
