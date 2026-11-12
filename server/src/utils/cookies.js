import { env } from '../config/env.js';

export function baseCookieOptions() {
  return {
    secure: env.COOKIE_SECURE,
    domain: env.COOKIE_DOMAIN,
    path: '/',
  };
}
