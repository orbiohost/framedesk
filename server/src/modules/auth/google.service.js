import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { checkSignupEmail } from '../../utils/emailPolicy.js';
import { randomToken, safeEqual } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';
import { User } from '../users/user.model.js';
import { createWorkspace, defaultWorkspaceName } from '../workspaces/workspaces.service.js';
import { createSession, revokeAllSessions } from './session.service.js';

// "Continue with Google": the OpenID Connect authorization code flow with
// PKCE, run entirely on the server. The browser goes to Google and comes back
// to /api/auth/google/callback; no Google script ever loads in the app.

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const PUBLIC_ORIGIN = env.CLIENT_URL.replace(/\/+$/, '');
export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';
const REDIRECT_URI = `${PUBLIC_ORIGIN}${GOOGLE_CALLBACK_PATH}`;
export const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;

export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// Only paths inside this app, so the sign-in can't be used as an open redirect.
export function safeNextPath(value) {
  if (typeof value !== 'string' || value.length > 2000) return '/app';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/app';
  return value;
}

// What the browser keeps (in a short-lived httpOnly cookie) between leaving
// for Google and coming back.
export function startGoogleSignIn({ next }) {
  if (!googleEnabled) throw AppError.unavailable('Google sign-in is not set up');
  const state = randomToken(24);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();

  return {
    redirectUrl: url.href,
    pending: { state, nonce, verifier, next: safeNextPath(next) },
  };
}

class GoogleSignInError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function decodeJwtPayload(jwt) {
  const [, payload] = String(jwt).split('.');
  if (!payload) throw new GoogleSignInError('google_failed', 'Google sent an unreadable answer');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

// The ID token comes straight from Google's token endpoint over TLS, which
// OpenID Connect accepts in place of checking its signature (Core 3.1.3.7).
// The claims are still checked.
async function exchangeCode({ code, verifier, nonce }) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.id_token) {
    logger.warn({ status: response.status, error: body?.error }, 'Google token exchange failed');
    throw new GoogleSignInError('google_failed', 'Google sign-in did not complete');
  }

  const claims = decodeJwtPayload(body.id_token);
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    !ISSUERS.has(claims.iss) ||
    !audience.includes(env.GOOGLE_CLIENT_ID) ||
    typeof claims.exp !== 'number' ||
    claims.exp < now ||
    !claims.sub ||
    typeof claims.nonce !== 'string' ||
    !safeEqual(claims.nonce, nonce)
  ) {
    throw new GoogleSignInError('google_failed', 'Google sign-in could not be verified');
  }
  if (!claims.email || claims.email_verified !== true) {
    throw new GoogleSignInError(
      'google_unverified',
      'Your Google account has no verified email address',
    );
  }
  return {
    googleId: String(claims.sub),
    email: String(claims.email).toLowerCase().trim(),
    name: String(claims.name || claims.given_name || claims.email.split('@')[0])
      .trim()
      .slice(0, 80),
  };
}

async function markSignedIn(userId, set = {}) {
  const now = new Date();
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        ...set,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
        lastActiveAt: now,
      },
    },
  );
}

// Finds the person's account, links Google to an existing one with the same
// email, or creates a new account (with its first workspace).
async function findOrCreateUser(profile) {
  const linked = await User.findOne({ googleId: profile.googleId });
  if (linked) return { user: linked, created: false };

  const existing = await User.findOne({ email: profile.email }).select('+passwordHash');
  if (existing) {
    // Google has proved this person owns the address. If it was never
    // verified here, whoever registered it may not be them: drop the
    // password and every session so a squatter keeps nothing.
    const set = { googleId: profile.googleId };
    if (!existing.emailVerifiedAt) {
      set.emailVerifiedAt = new Date();
      if (existing.passwordHash) {
        await User.updateOne(
          { _id: existing._id },
          { $unset: { passwordHash: 1 }, $set: { hasPassword: false } },
        );
        await revokeAllSessions(existing._id, 'google_link_unverified');
      }
    }
    await User.updateOne({ _id: existing._id }, { $set: set });
    return { user: await User.findById(existing._id), created: false };
  }

  // New account: Google proved the inbox is real, so only the domain rules apply.
  if (await checkSignupEmail(profile.email, { skipDns: true })) {
    throw new GoogleSignInError('email_not_allowed', 'This email domain is not allowed');
  }

  const user = await User.create({
    name: profile.name,
    email: profile.email,
    googleId: profile.googleId,
    hasPassword: false,
    emailVerifiedAt: new Date(),
  });
  try {
    await createWorkspace({ ownerId: user._id, name: defaultWorkspaceName(profile.name) });
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    throw err;
  }
  return { user, created: true };
}

// Returns where to send the browser next, plus the session tokens on success.
export async function finishGoogleSignIn({ query, pending, meta }) {
  if (query.error) {
    // The person pressed Cancel on Google's screen.
    return {
      redirect: `/login?error=${query.error === 'access_denied' ? 'google_cancelled' : 'google_failed'}`,
    };
  }
  if (
    !pending?.state ||
    typeof query.state !== 'string' ||
    !safeEqual(query.state, pending.state) ||
    typeof query.code !== 'string'
  ) {
    return { redirect: '/login?error=google_expired' };
  }

  try {
    const profile = await exchangeCode({
      code: query.code,
      verifier: pending.verifier,
      nonce: pending.nonce,
    });
    const { user } = await findOrCreateUser(profile);
    if (user.status !== 'active') return { redirect: '/login?error=account_suspended' };

    await markSignedIn(user._id);
    const tokens = await createSession(user._id, meta);
    return { redirect: safeNextPath(pending.next), tokens };
  } catch (err) {
    if (err instanceof GoogleSignInError) return { redirect: `/login?error=${err.code}` };
    logger.error({ err }, 'Google sign-in failed');
    return { redirect: '/login?error=google_failed' };
  }
}
