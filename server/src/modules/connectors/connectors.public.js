import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import cors from 'cors';
import express, { Router } from 'express';
import { mcpLimiter, oauthLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { createMcpServer } from './mcp.server.js';
import {
  MCP_PATH,
  MCP_RESOURCE,
  OAuthError,
  PUBLIC_ORIGIN,
  handleRevocation,
  handleTokenRequest,
  registerClient,
  resolveBearer,
} from './oauth.service.js';
import { CONNECTOR_SCOPES } from './connector.models.js';

// The parts of the AI connector that outside apps call: OAuth discovery and
// sign-in (Claude, ChatGPT and other MCP clients follow the MCP authorization
// spec) and the MCP endpoint itself. Mounted ahead of the app's cookie/CSRF
// stack: nothing here reads cookies, every call carries its own credentials,
// so any origin may call it.
export const connectorPublicRouter = Router();

const openCors = cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  exposedHeaders: ['WWW-Authenticate', 'Mcp-Session-Id', 'Mcp-Protocol-Version'],
  maxAge: 86400,
});

const PROTECTED_RESOURCE_METADATA_URL = `${PUBLIC_ORIGIN}/.well-known/oauth-protected-resource${MCP_PATH}`;

const authorizationServerMetadata = Object.freeze({
  issuer: PUBLIC_ORIGIN,
  authorization_endpoint: `${PUBLIC_ORIGIN}/api/oauth/authorize`,
  token_endpoint: `${PUBLIC_ORIGIN}/api/oauth/token`,
  registration_endpoint: `${PUBLIC_ORIGIN}/api/oauth/register`,
  revocation_endpoint: `${PUBLIC_ORIGIN}/api/oauth/revoke`,
  response_types_supported: ['code'],
  response_modes_supported: ['query'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  scopes_supported: CONNECTOR_SCOPES,
  authorization_response_iss_parameter_supported: true,
  service_documentation: `${PUBLIC_ORIGIN}/`,
});

const protectedResourceMetadata = Object.freeze({
  resource: MCP_RESOURCE,
  resource_name: 'FrameDesk',
  authorization_servers: [PUBLIC_ORIGIN],
  scopes_supported: CONNECTOR_SCOPES,
  bearer_methods_supported: ['header'],
});

function sendMetadata(document) {
  return (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(document);
  };
}

// Clients try both the bare and the path-suffixed well-known URLs (RFC 8414 /
// RFC 9728), so answer on either.
connectorPublicRouter.options(/^\/\.well-known\/oauth-.*/, openCors);
connectorPublicRouter.get(
  /^\/\.well-known\/oauth-authorization-server(\/.*)?$/,
  openCors,
  sendMetadata(authorizationServerMetadata),
);
connectorPublicRouter.get(
  /^\/\.well-known\/oauth-protected-resource(\/.*)?$/,
  openCors,
  sendMetadata(protectedResourceMetadata),
);

// ---------------------------------------------------------------------------
// OAuth endpoints

const oauthBody = [
  express.urlencoded({ extended: false, limit: '64kb' }),
  express.json({ limit: '64kb' }),
];

// OAuth answers errors as { error, error_description }, never cached.
function oauthEndpoint(handler) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    try {
      await handler(req, res);
    } catch (err) {
      if (!(err instanceof OAuthError)) return next(err);
      if (err.status === 401) res.set('WWW-Authenticate', 'Basic realm="FrameDesk"');
      res.status(err.status).json({ error: err.error, error_description: err.message });
    }
  };
}

connectorPublicRouter.use('/api/oauth', openCors, oauthLimiter);

connectorPublicRouter.post(
  '/api/oauth/register',
  oauthBody,
  oauthEndpoint(async (req, res) => {
    res.status(201).json(await registerClient(req.body));
  }),
);

// The consent screen is part of the web app (it needs the person signed in),
// so the authorize endpoint hands the request over to it unchanged.
connectorPublicRouter.get('/api/oauth/authorize', (req, res) => {
  const queryIndex = req.originalUrl.indexOf('?');
  const query = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
  res.redirect(302, `${PUBLIC_ORIGIN}/connect/authorize${query}`);
});

connectorPublicRouter.post(
  '/api/oauth/token',
  oauthBody,
  oauthEndpoint(async (req, res) => {
    res.json(await handleTokenRequest(req));
  }),
);

connectorPublicRouter.post(
  '/api/oauth/revoke',
  oauthBody,
  oauthEndpoint(async (req, res) => {
    await handleRevocation(req);
    res.status(200).end();
  }),
);

// ---------------------------------------------------------------------------
// The MCP endpoint (Streamable HTTP, stateless: every POST stands alone)

function unauthorized(res, { invalid }) {
  const challenge = [`Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}"`];
  if (invalid) challenge.push('error="invalid_token"');
  res.set('WWW-Authenticate', challenge.join(', '));
  res.status(401).json({
    error: invalid ? 'invalid_token' : 'unauthorized',
    error_description: invalid
      ? 'The token is invalid, expired or revoked'
      : 'Sign in with OAuth or send an API key as "Authorization: Bearer <key>"',
  });
}

const authenticateBearer = asyncHandler(async (req, res, next) => {
  const match = req.get('authorization')?.match(/^Bearer\s+(\S+)\s*$/i);
  if (!match) return unauthorized(res, { invalid: false });
  const connector = await resolveBearer(match[1]);
  if (!connector) return unauthorized(res, { invalid: true });
  req.connector = connector;
  next();
});

const handleMcp = asyncHandler(async (req, res) => {
  const server = createMcpServer(req.connector);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

function methodNotAllowed(req, res) {
  res.set('Allow', 'POST');
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'This MCP server is stateless: use POST.' },
    id: null,
  });
}

connectorPublicRouter.options(MCP_PATH, openCors);
connectorPublicRouter.post(
  MCP_PATH,
  openCors,
  authenticateBearer,
  mcpLimiter,
  express.json({ limit: '1mb' }),
  handleMcp,
);
connectorPublicRouter.get(MCP_PATH, openCors, methodNotAllowed);
connectorPublicRouter.delete(MCP_PATH, openCors, methodNotAllowed);
