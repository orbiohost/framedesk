import { issueCsrfToken } from '../../middleware/csrf.js';
import { captchaSiteKey } from '../../middleware/captcha.js';
import { baseCookieOptions } from '../../utils/cookies.js';
import { AppError } from '../../utils/AppError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requestMeta } from '../../utils/requestMeta.js';
import { toPublicUser } from '../users/users.service.js';
import { clearAuthCookies, readRefreshToken, setAuthCookies } from './auth.cookies.js';
import * as authService from './auth.service.js';
import * as emailVerification from './emailVerification.service.js';
import * as google from './google.service.js';
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

// Which ways of signing in this server offers, so the sign-in page knows
// whether to show "Continue with Google".
export function getProviders(req, res) {
  sendSuccess(res, { google: google.googleEnabled, captchaSiteKey });
}

// Holds state, nonce and PKCE verifier while the person is over at Google.
// Lax, so it comes back on Google's top-level redirect to the callback.
const GOOGLE_COOKIE = 'g_oauth';
const googleCookieOptions = () => ({
  ...baseCookieOptions(),
  path: '/api/auth/google',
  httpOnly: true,
  sameSite: 'lax',
});

export function startGoogle(req, res) {
  const { redirectUrl, pending } = google.startGoogleSignIn({ next: req.query.next });
  res.cookie(GOOGLE_COOKIE, Buffer.from(JSON.stringify(pending)).toString('base64url'), {
    ...googleCookieOptions(),
    maxAge: google.GOOGLE_STATE_TTL_MS,
  });
  res.redirect(302, redirectUrl);
}

function readPendingGoogle(req) {
  try {
    return JSON.parse(
      Buffer.from(req.cookies?.[GOOGLE_COOKIE] ?? '', 'base64url').toString('utf8'),
    );
  } catch {
    return null;
  }
}

export const googleCallback = asyncHandler(async (req, res) => {
  const pending = readPendingGoogle(req);
  res.clearCookie(GOOGLE_COOKIE, googleCookieOptions());
  const { redirect, tokens } = await google.finishGoogleSignIn({
    query: req.query,
    pending,
    meta: requestMeta(req),
  });
  if (tokens) setAuthCookies(res, tokens);
  res.set('Cache-Control', 'no-store');
  res.redirect(302, redirect);
});
