import { AppError } from '../utils/AppError.js';
import { baseCookieOptions } from '../utils/cookies.js';
import { randomToken, safeEqual } from '../utils/crypto.js';

export const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Double-submit cookie: the client reads this (non-httpOnly) cookie and echoes it
// in a header. A cross-site form can send our cookies but cannot read them.
export function issueCsrfToken(res) {
  const token = randomToken(24);
  res.cookie(CSRF_COOKIE, token, { ...baseCookieOptions(), httpOnly: false, sameSite: 'strict' });
  return token;
}

export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return next(
      AppError.forbidden(
        'Your session could not be verified. Refresh and try again.',
        'CSRF_INVALID',
      ),
    );
  }
  next();
}
