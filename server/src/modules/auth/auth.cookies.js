import { env } from '../../config/env.js';
import { baseCookieOptions } from '../../utils/cookies.js';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';
// The refresh token is only ever sent to auth endpoints.
const REFRESH_PATH = '/api/auth';
// Readable by the browser and carries no secret. It only tells the client a session
// may exist, so visitors who never signed in skip the session check entirely.
const SESSION_HINT_COOKIE = 'session_hint';

export function setAuthCookies(res, { accessToken, refreshToken, refreshExpiresAt }) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookieOptions(),
    httpOnly: true,
    sameSite: 'lax',
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions(),
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_PATH,
    expires: refreshExpiresAt,
  });
  res.cookie(SESSION_HINT_COOKIE, '1', {
    ...baseCookieOptions(),
    httpOnly: false,
    sameSite: 'lax',
    expires: refreshExpiresAt,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookieOptions() });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions(), path: REFRESH_PATH });
  res.clearCookie(SESSION_HINT_COOKIE, { ...baseCookieOptions() });
}

export function readAccessToken(req) {
  return req.cookies?.[ACCESS_COOKIE];
}

export function readRefreshToken(req) {
  return req.cookies?.[REFRESH_COOKIE];
}
