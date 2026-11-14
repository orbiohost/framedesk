import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { randomToken, safeEqual, sha256 } from '../../utils/crypto.js';
import { listActiveMembershipsForUser } from '../members/members.service.js';
import { VIEW_ROLES } from '../members/roles.js';
import { User } from '../users/user.model.js';
import {
  CONNECTOR_SCOPES,
  ConnectorGrant,
  ConnectorToken,
  OAuthClient,
  OAuthCode,
} from './connector.models.js';

export const PUBLIC_ORIGIN = env.CLIENT_URL.replace(/\/+$/, '');
export const MCP_PATH = '/api/mcp';
export const MCP_RESOURCE = `${PUBLIC_ORIGIN}${MCP_PATH}`;

const ACCESS_TOKEN_TTL_S = 60 * 60;
const REFRESH_TOKEN_TTL_DAYS = 60;
const CODE_TTL_MS = 60 * 1000;
const MAX_API_KEYS = 20;
const MAX_REDIRECT_URIS = 10;

// Prefixes make a leaked token easy to recognise (and to scan for).
const PREFIX = { access: 'fdk_at_', refresh: 'fdk_rt_', key: 'fdk_key_', code: 'fdk_code_' };

// OAuth errors have their own shape: { error, error_description }.
export class OAuthError extends Error {
  constructor(error, description, status = 400) {
    super(description);
    this.error = error;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Redirect URIs

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'blob:']);

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// https anywhere, http only on this machine (CLI tools), or an app's own
// scheme (cursor://, vscode://). Never a fragment.
function isAcceptableRedirectUri(value) {
  const url = parseUrl(value);
  if (!url || url.hash) return false;
  if (BLOCKED_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return LOOPBACK_HOSTS.has(url.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol);
}

// Exact match, except that a loopback redirect may use any port (RFC 8252 7.3):
// CLI tools pick a free port each time they sign in.
function redirectUriMatches(registered, requested) {
  if (registered === requested) return true;
  const a = parseUrl(registered);
  const b = parseUrl(requested);
  if (!a || !b || a.protocol !== 'http:' || !LOOPBACK_HOSTS.has(a.hostname)) return false;
  return (
    a.protocol === b.protocol &&
    a.hostname === b.hostname &&
    a.pathname === b.pathname &&
    a.search === b.search
  );
}

function hostOf(redirectUri) {
  const url = parseUrl(redirectUri);
  if (!url) return null;
  return url.host || url.protocol.replace(/:$/, '');
}

// ---------------------------------------------------------------------------
// Dynamic client registration (RFC 7591)

function cleanOptionalUrl(value) {
  if (typeof value !== 'string') return null;
  const url = parseUrl(value);
  return url && url.protocol === 'https:' ? url.href.slice(0, 500) : null;
}

export async function registerClient(body = {}) {
  const redirectUris = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > MAX_REDIRECT_URIS ||
    !redirectUris.every((uri) => typeof uri === 'string' && uri.length <= 2000)
  ) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris must list 1 to 10 URLs');
  }
  const bad = redirectUris.find((uri) => !isAcceptableRedirectUri(uri));
  if (bad) {
    throw new OAuthError(
      'invalid_redirect_uri',
      `Redirect URI not allowed: ${bad}. Use https, or http on localhost.`,
    );
  }

  const grantTypes = body.grant_types ?? ['authorization_code', 'refresh_token'];
  if (!Array.isArray(grantTypes) || !grantTypes.includes('authorization_code')) {
    throw new OAuthError('invalid_client_metadata', 'grant_types must include authorization_code');
  }
  const responseTypes = body.response_types ?? ['code'];
  if (!Array.isArray(responseTypes) || !responseTypes.every((type) => type === 'code')) {
    throw new OAuthError('invalid_client_metadata', 'Only response_type "code" is supported');
  }

  const authMethod = body.token_endpoint_auth_method ?? 'none';
  if (!['none', 'client_secret_post', 'client_secret_basic'].includes(authMethod)) {
    throw new OAuthError(
      'invalid_client_metadata',
      'token_endpoint_auth_method must be none, client_secret_post or client_secret_basic',
    );
  }

  const clientId = `fdk_client_${randomToken(18)}`;
  const clientSecret = authMethod === 'none' ? null : randomToken(32);
  const clientName =
    typeof body.client_name === 'string' && body.client_name.trim()
      ? body.client_name.trim().slice(0, 120)
      : null;

  const client = await OAuthClient.create({
    clientId,
    clientSecretHash: clientSecret ? sha256(clientSecret) : null,
    tokenEndpointAuthMethod: authMethod,
    clientName,
    clientUri: cleanOptionalUrl(body.client_uri),
    logoUri: cleanOptionalUrl(body.logo_uri),
    redirectUris,
  });

  const response = {
    client_id: client.clientId,
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    client_name: client.clientName ?? undefined,
    redirect_uris: client.redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: authMethod,
    scope: CONNECTOR_SCOPES.join(' '),
  };
  if (clientSecret) {
    response.client_secret = clientSecret;
    response.client_secret_expires_at = 0;
  }
  return response;
}

// ---------------------------------------------------------------------------
// The consent screen

function normaliseResource(value) {
  if (!value) return null;
  return String(value).replace(/\/+$/, '');
}

function parseScopes(scope) {
  if (!scope) return ['read'];
  const requested = String(scope).split(/\s+/).filter(Boolean);
  // Unknown scopes are dropped rather than refused: some clients always ask
  // for "openid profile" and similar. What we grant is what the token says.
  const granted = requested.filter((item) => CONNECTOR_SCOPES.includes(item));
  return granted.length > 0 ? granted : ['read'];
}

// Checks an authorization request. Problems with the client or redirect URI
// are shown on our page (redirecting to an unverified URI would be an open
// redirect); everything else goes back to the client as an OAuth error.
export async function checkAuthorizationRequest(params) {
  const clientId = typeof params.client_id === 'string' ? params.client_id : '';
  const client = clientId ? await OAuthClient.findOne({ clientId }).lean() : null;
  if (!client) {
    throw AppError.badRequest(
      'This app is not registered with FrameDesk. Go back and try connecting again.',
      'OAUTH_UNKNOWN_CLIENT',
    );
  }

  const redirectUri =
    params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null);
  if (!redirectUri || !client.redirectUris.some((uri) => redirectUriMatches(uri, redirectUri))) {
    throw AppError.badRequest(
      'The app sent a return address FrameDesk does not recognise.',
      'OAUTH_BAD_REDIRECT',
    );
  }

  const fail = (error, description) => ({
    client,
    redirectUri,
    state: params.state,
    error: { error, error_description: description },
  });
  if (params.response_type !== 'code') {
    return fail('unsupported_response_type', 'Only response_type=code is supported');
  }
  if (!params.code_challenge || params.code_challenge_method !== 'S256') {
    return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(params.code_challenge)) {
    return fail('invalid_request', 'code_challenge is malformed');
  }
  const resource = normaliseResource(params.resource);
  if (resource && resource !== MCP_RESOURCE) {
    return fail('invalid_target', `resource must be ${MCP_RESOURCE}`);
  }

  return {
    client,
    redirectUri,
    state: params.state,
    codeChallenge: params.code_challenge,
    resource,
    scopes: parseScopes(params.scope),
    error: null,
  };
}

function withQuery(uri, values) {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  return url.href;
}

// The workspaces this person could hand to an assistant.
export async function shareableWorkspaces(userId) {
  const memberships = await listActiveMembershipsForUser(userId);
  return memberships
    .filter((membership) => membership.workspaceId && VIEW_ROLES.includes(membership.role))
    .map((membership) => ({
      id: String(membership.workspaceId._id),
      name: membership.workspaceId.name,
      role: membership.role,
    }));
}

async function cleanWorkspaceChoice(userId, { allWorkspaces = true, workspaceIds = [] }) {
  if (allWorkspaces) return { allWorkspaces: true, workspaceIds: [] };
  const allowed = new Set((await shareableWorkspaces(userId)).map((workspace) => workspace.id));
  const chosen = [...new Set(workspaceIds.map(String))].filter((id) => allowed.has(id));
  if (chosen.length === 0) {
    throw AppError.badRequest('Pick at least one workspace', 'NO_WORKSPACES');
  }
  return {
    allWorkspaces: false,
    workspaceIds: chosen.map((id) => new mongoose.Types.ObjectId(id)),
  };
}

export async function describeAuthorizationRequest(userId, params) {
  const request = await checkAuthorizationRequest(params);
  return {
    client: {
      name: request.client.clientName ?? 'An AI assistant',
      host: hostOf(request.redirectUri),
      uri: request.client.clientUri,
      logoUri: request.client.logoUri,
    },
    scopes: request.scopes ?? [],
    error: request.error,
    workspaces: await shareableWorkspaces(userId),
  };
}

// Approve or deny. Either way the answer is a URL to send the browser to.
export async function decideAuthorization(
  userId,
  { params, approve, allWorkspaces, workspaceIds, allowDownloads = false },
) {
  const request = await checkAuthorizationRequest(params);
  if (request.error) {
    return {
      redirectTo: withQuery(request.redirectUri, { ...request.error, state: request.state }),
    };
  }
  if (!approve) {
    return {
      redirectTo: withQuery(request.redirectUri, {
        error: 'access_denied',
        error_description: 'The person declined to connect FrameDesk',
        state: request.state,
      }),
    };
  }

  const choice = await cleanWorkspaceChoice(userId, { allWorkspaces, workspaceIds });
  const host = hostOf(request.redirectUri);
  // Connecting the same assistant again updates its access instead of piling
  // up duplicates in the list.
  const grant = await ConnectorGrant.findOneAndUpdate(
    { userId, clientId: request.client.clientId, revokedAt: null },
    {
      $set: {
        name: request.client.clientName ?? host ?? 'AI assistant',
        clientHost: host,
        scopes: request.scopes,
        allowDownloads: Boolean(allowDownloads),
        ...choice,
      },
      $setOnInsert: { userId, kind: 'oauth', clientId: request.client.clientId },
    },
    { upsert: true, new: true },
  );
  await OAuthClient.updateOne({ _id: request.client._id }, { $set: { approved: true } });

  const code = PREFIX.code + randomToken(32);
  await OAuthCode.create({
    codeHash: sha256(code),
    grantId: grant._id,
    clientId: request.client.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    resource: request.resource,
    scopes: request.scopes,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  return {
    redirectTo: withQuery(request.redirectUri, {
      code,
      state: request.state,
      iss: PUBLIC_ORIGIN,
    }),
  };
}

// ---------------------------------------------------------------------------
// Token endpoint

function readClientCredentials(req) {
  const header = req.get('authorization');
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator > 0) {
      return {
        clientId: decodeURIComponent(decoded.slice(0, separator)),
        clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
      };
    }
  }
  return { clientId: req.body?.client_id, clientSecret: req.body?.client_secret };
}

async function authenticateClient(req) {
  const { clientId, clientSecret } = readClientCredentials(req);
  if (typeof clientId !== 'string' || !clientId) {
    throw new OAuthError('invalid_client', 'client_id is required', 401);
  }
  const client = await OAuthClient.findOne({ clientId }).lean();
  if (!client) throw new OAuthError('invalid_client', 'Unknown client', 401);
  if (client.clientSecretHash) {
    if (
      typeof clientSecret !== 'string' ||
      !safeEqual(sha256(clientSecret), client.clientSecretHash)
    ) {
      throw new OAuthError('invalid_client', 'Client authentication failed', 401);
    }
  }
  return client;
}

function verifyPkce(verifier, challenge) {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = createHash('sha256').update(verifier).digest('base64url');
  return safeEqual(computed, challenge);
}

async function liveGrant(grantId) {
  const grant = await ConnectorGrant.findOne({ _id: grantId, revokedAt: null }).lean();
  if (!grant) return null;
  const user = await User.findById(grant.userId).select('status').lean();
  return user?.status === 'active' ? grant : null;
}

async function issueTokenPair({ grant, clientId, scopes, resource }) {
  const accessToken = PREFIX.access + randomToken(32);
  const refreshToken = PREFIX.refresh + randomToken(40);
  const base = { grantId: grant._id, userId: grant.userId, clientId, scopes, resource };
  await ConnectorToken.insertMany([
    {
      ...base,
      kind: 'access',
      tokenHash: sha256(accessToken),
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_S * 1000),
    },
    {
      ...base,
      kind: 'refresh',
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000),
    },
  ]);
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_S,
    refresh_token: refreshToken,
    scope: scopes.join(' '),
  };
}

async function exchangeCode(client, body) {
  if (typeof body.code !== 'string') throw new OAuthError('invalid_request', 'code is required');
  // Claimed atomically, so a code can never be exchanged twice.
  const code = await OAuthCode.findOneAndUpdate(
    { codeHash: sha256(body.code), usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  ).lean();
  if (!code || code.clientId !== client.clientId) {
    throw new OAuthError('invalid_grant', 'The authorization code is invalid or has expired');
  }
  if (body.redirect_uri && body.redirect_uri !== code.redirectUri) {
    throw new OAuthError('invalid_grant', 'redirect_uri does not match the authorization request');
  }
  if (!verifyPkce(body.code_verifier, code.codeChallenge)) {
    throw new OAuthError('invalid_grant', 'PKCE verification failed');
  }
  const resource = normaliseResource(body.resource) ?? code.resource;
  if (resource && resource !== MCP_RESOURCE) {
    throw new OAuthError('invalid_target', `resource must be ${MCP_RESOURCE}`);
  }
  const grant = await liveGrant(code.grantId);
  if (!grant) throw new OAuthError('invalid_grant', 'Access was revoked');
  return issueTokenPair({ grant, clientId: client.clientId, scopes: code.scopes, resource });
}

async function exchangeRefreshToken(client, body) {
  if (typeof body.refresh_token !== 'string') {
    throw new OAuthError('invalid_request', 'refresh_token is required');
  }
  const tokenHash = sha256(body.refresh_token);
  const stored = await ConnectorToken.findOne({ tokenHash, kind: 'refresh' }).lean();
  if (!stored || stored.expiresAt <= new Date() || stored.clientId !== client.clientId) {
    throw new OAuthError('invalid_grant', 'The refresh token is invalid or has expired');
  }
  const claimed = await ConnectorToken.findOneAndUpdate(
    { _id: stored._id, usedAt: null },
    { $set: { usedAt: new Date() } },
  );
  if (!claimed) {
    // A refresh token used twice has leaked: end this connection entirely.
    await revokeGrantById(stored.grantId);
    throw new OAuthError('invalid_grant', 'The refresh token was already used');
  }
  const grant = await liveGrant(stored.grantId);
  if (!grant) throw new OAuthError('invalid_grant', 'Access was revoked');
  return issueTokenPair({
    grant,
    clientId: client.clientId,
    scopes: stored.scopes,
    resource: stored.resource,
  });
}

export async function handleTokenRequest(req) {
  const client = await authenticateClient(req);
  const body = req.body ?? {};
  if (body.grant_type === 'authorization_code') return exchangeCode(client, body);
  if (body.grant_type === 'refresh_token') return exchangeRefreshToken(client, body);
  throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token');
}

// RFC 7009: always answers 200, whether or not the token existed.
export async function handleRevocation(req) {
  const client = await authenticateClient(req);
  const token = req.body?.token;
  if (typeof token !== 'string') return;
  const stored = await ConnectorToken.findOne({ tokenHash: sha256(token) }).lean();
  if (!stored || stored.clientId !== client.clientId) return;
  if (stored.kind === 'refresh') await revokeGrantById(stored.grantId);
  else await ConnectorToken.deleteOne({ _id: stored._id });
}

// ---------------------------------------------------------------------------
// Bearer tokens on the MCP endpoint

const LAST_USED_EVERY_MS = 5 * 60 * 1000;

function touchGrant(grant) {
  if (grant.lastUsedAt && Date.now() - grant.lastUsedAt.getTime() < LAST_USED_EVERY_MS) return;
  ConnectorGrant.updateOne({ _id: grant._id }, { $set: { lastUsedAt: new Date() } }).catch(
    () => {},
  );
}

// Resolves a bearer token (OAuth access token or API key) to its grant, or null.
export async function resolveBearer(rawToken) {
  if (typeof rawToken !== 'string' || rawToken.length > 200) return null;
  const tokenHash = sha256(rawToken);

  let grant;
  if (rawToken.startsWith(PREFIX.key)) {
    grant = await ConnectorGrant.findOne({ keyHash: tokenHash, revokedAt: null }).lean();
  } else if (rawToken.startsWith(PREFIX.access)) {
    const token = await ConnectorToken.findOne({ tokenHash, kind: 'access' }).lean();
    if (!token || token.expiresAt <= new Date()) return null;
    if (token.resource && token.resource !== MCP_RESOURCE) return null;
    grant = await ConnectorGrant.findOne({ _id: token.grantId, revokedAt: null }).lean();
  } else {
    return null;
  }
  if (!grant) return null;

  const user = await User.findById(grant.userId).select('name email status').lean();
  if (!user || user.status !== 'active') return null;
  touchGrant(grant);
  return { grant, user };
}

// ---------------------------------------------------------------------------
// Managing connections from the account page

function toConnection(grant) {
  return {
    id: String(grant._id),
    kind: grant.kind,
    name: grant.name,
    clientHost: grant.clientHost,
    keyPreview: grant.keyPreview,
    scopes: grant.scopes,
    allWorkspaces: grant.allWorkspaces,
    workspaceIds: grant.workspaceIds.map(String),
    allowDownloads: Boolean(grant.allowDownloads),
    lastUsedAt: grant.lastUsedAt,
    createdAt: grant.createdAt,
  };
}

export async function listConnections(userId) {
  const grants = await ConnectorGrant.find({ userId, revokedAt: null })
    .sort({ createdAt: -1 })
    .lean();
  return {
    connections: grants.map(toConnection),
    workspaces: await shareableWorkspaces(userId),
    mcpUrl: MCP_RESOURCE,
  };
}

export async function createApiKey(
  userId,
  { name, allWorkspaces, workspaceIds, allowDownloads = false },
) {
  const count = await ConnectorGrant.countDocuments({ userId, kind: 'api_key', revokedAt: null });
  if (count >= MAX_API_KEYS) {
    throw AppError.conflict(
      `You can have up to ${MAX_API_KEYS} keys. Revoke one you no longer use first.`,
      'TOO_MANY_KEYS',
    );
  }
  const choice = await cleanWorkspaceChoice(userId, { allWorkspaces, workspaceIds });
  const key = PREFIX.key + randomToken(32);
  const grant = await ConnectorGrant.create({
    userId,
    kind: 'api_key',
    name,
    scopes: ['read'],
    keyHash: sha256(key),
    keyPreview: `${key.slice(0, PREFIX.key.length + 4)}…${key.slice(-4)}`,
    allowDownloads: Boolean(allowDownloads),
    ...choice,
  });
  // The key itself is shown once and never stored.
  return { connection: toConnection(grant.toObject()), key };
}

export async function updateConnectionWorkspaces(userId, grantId, { allowDownloads, ...choice }) {
  const cleaned = await cleanWorkspaceChoice(userId, choice);
  if (typeof allowDownloads === 'boolean') cleaned.allowDownloads = allowDownloads;
  const grant = await ConnectorGrant.findOneAndUpdate(
    { _id: grantId, userId, revokedAt: null },
    { $set: cleaned },
    { new: true },
  ).lean();
  if (!grant) throw AppError.notFound('Connection not found');
  return toConnection(grant);
}

async function revokeGrantById(grantId) {
  await ConnectorGrant.updateOne(
    { _id: grantId, revokedAt: null },
    { $set: { revokedAt: new Date(), keyHash: null } },
  );
  await ConnectorToken.deleteMany({ grantId });
  await OAuthCode.deleteMany({ grantId });
}

export async function revokeConnection(userId, grantId) {
  const grant = await ConnectorGrant.findOne({ _id: grantId, userId, revokedAt: null })
    .select('_id')
    .lean();
  if (!grant) throw AppError.notFound('Connection not found');
  await revokeGrantById(grant._id);
}
