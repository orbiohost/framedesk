import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

// Cloudflare Turnstile: the browser solves a (usually invisible) challenge and
// sends the resulting one-time token as `captchaToken`; we confirm it with
// Cloudflare before the request reaches the handler. Off when no keys are set.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const captchaEnabled = Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
export const captchaSiteKey = captchaEnabled ? env.TURNSTILE_SITE_KEY : null;

function captchaFailed() {
  return AppError.badRequest(
    'Please complete the “I’m not a robot” check and try again.',
    'CAPTCHA_FAILED',
  );
}

async function verifyToken(token, ip) {
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set('remoteip', ip);

  const response = await fetch(VERIFY_URL, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json().catch(() => null);
  if (!result?.success) {
    logger.info({ errors: result?.['error-codes'], ip }, 'Captcha check failed');
    return false;
  }
  return true;
}

// Put ahead of validate(): validation strips fields it doesn't know about.
export async function requireCaptcha(req, res, next) {
  if (!captchaEnabled) return next();

  const token = req.body?.captchaToken;
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return next(captchaFailed());
  }
  try {
    if (!(await verifyToken(token, req.ip))) return next(captchaFailed());
    return next();
  } catch (err) {
    // Cloudflare unreachable: refuse rather than let bots through, but say so.
    logger.error({ err }, 'Captcha verification unavailable');
    return next(AppError.unavailable('Security check is unavailable. Please try again shortly.'));
  }
}
