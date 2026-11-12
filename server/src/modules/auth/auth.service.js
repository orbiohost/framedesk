import { AUTH } from '../../config/constants.js';
import { AppError } from '../../utils/AppError.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../utils/password.js';
import { minutesFromNow } from '../../utils/time.js';
import { User } from '../users/user.model.js';
import { createWorkspace, defaultWorkspaceName } from '../workspaces/workspaces.service.js';
import { sendVerificationEmail } from './emailVerification.service.js';
import { createSession } from './session.service.js';

function invalidCredentials() {
  return AppError.unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
}

function isLocked(user) {
  return user.lockedUntil && user.lockedUntil > new Date();
}

async function registerFailedLogin(userId) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { failedLoginAttempts: 1 } },
    { new: true },
  );
  if (user.failedLoginAttempts >= AUTH.MAX_FAILED_LOGINS) {
    await User.updateOne(
      { _id: userId },
      { $set: { failedLoginAttempts: 0, lockedUntil: minutesFromNow(AUTH.LOCK_MINUTES) } },
    );
  }
}

async function registerSuccessfulLogin(userId) {
  const now = new Date();
  await User.updateOne(
    { _id: userId },
    { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now, lastActiveAt: now } },
  );
}

export async function signup({ name, email, password, workspaceName }, meta) {
  if (await User.exists({ email })) {
    throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }

  const user = await User.create({ name, email, passwordHash: await hashPassword(password) });
  await createWorkspace({
    ownerId: user._id,
    name: workspaceName || defaultWorkspaceName(name),
  });
  await sendVerificationEmail(user);

  const tokens = await createSession(user._id, meta);
  return { user, tokens };
}

export async function login({ email, password }, meta) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user?.passwordHash) {
    await burnPasswordCheck(password);
    throw invalidCredentials();
  }

  if (isLocked(user)) {
    throw AppError.locked(
      `Too many failed attempts. Try again in ${AUTH.LOCK_MINUTES} minutes or reset your password.`,
      'ACCOUNT_LOCKED',
    );
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    await registerFailedLogin(user._id);
    throw invalidCredentials();
  }

  if (user.status !== 'active') {
    throw AppError.forbidden('This account has been suspended', 'ACCOUNT_SUSPENDED');
  }

  await registerSuccessfulLogin(user._id);
  const tokens = await createSession(user._id, meta);
  return { user, tokens };
}
