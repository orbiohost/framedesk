import { issueCsrfToken } from '../../middleware/csrf.js';
import { AppError } from '../../utils/AppError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requestMeta } from '../../utils/requestMeta.js';
import { toPublicUser } from '../users/users.service.js';
import { clearAuthCookies, readRefreshToken, setAuthCookies } from './auth.cookies.js';
import * as authService from './auth.service.js';
import * as emailVerification from './emailVerification.service.js';
import * as passwordReset from './passwordReset.service.js';
import * as sessions from './session.service.js';

export function getCsrfToken(req, res) {
  sendSuccess(res, { csrfToken: issueCsrfToken(res) });
}

export const signup = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.signup(req.body, requestMeta(req));
  setAuthCookies(res, tokens);
  sendSuccess(res, { user: toPublicUser(user) }, { status: 201 });
});

export const login = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.login(req.body, requestMeta(req));
  setAuthCookies(res, tokens);
  sendSuccess(res, { user: toPublicUser(user) });
});

export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = readRefreshToken(req);
  if (!refreshToken) throw AppError.unauthorized('Please sign in to continue', 'SESSION_EXPIRED');

  try {
    const tokens = await sessions.rotateSession(refreshToken, requestMeta(req));
    setAuthCookies(res, tokens);
    sendSuccess(res, { refreshed: true });
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
});

export const logout = asyncHandler(async (req, res) => {
  const refreshToken = readRefreshToken(req);
  if (refreshToken) await sessions.revokeSessionByToken(refreshToken);
  clearAuthCookies(res);
  sendSuccess(res, { loggedOut: true });
});

export const logoutEverywhere = asyncHandler(async (req, res) => {
  await sessions.revokeAllSessions(req.user._id, 'logout_all');
  clearAuthCookies(res);
  sendSuccess(res, { loggedOut: true });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const user = await emailVerification.verifyEmail(req.body.token);
  sendSuccess(res, { user: toPublicUser(user) });
});

export const resendVerification = asyncHandler(async (req, res) => {
  await emailVerification.resendVerification(req.user);
  sendSuccess(res, { sent: true });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await passwordReset.requestPasswordReset(req.body.email);
  sendSuccess(res, { sent: true });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await passwordReset.resetPassword(req.body);
  clearAuthCookies(res);
  sendSuccess(res, { reset: true });
});
