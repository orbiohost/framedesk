import mongoose, { Schema } from 'mongoose';

// AI connectors let people plug FrameDesk into their own assistant (Claude,
// ChatGPT, Gemini, a local model...) through MCP. Two ways in:
//   - OAuth: the assistant registers itself, the person approves it once, and
//     it holds a short-lived access token plus a rotating refresh token.
//   - API key: the person creates a key here and pastes it into a client that
//     takes a header (Gemini CLI, Claude Desktop config, LM Studio, scripts).
// Both end up as one ConnectorGrant, which says whose data and which
// workspaces. Revoking the grant cuts off every token issued under it.

export const CONNECTOR_SCOPES = ['read'];
export const GRANT_KINDS = ['oauth', 'api_key'];
export const TOKEN_KINDS = ['access', 'refresh'];

// An assistant that registered itself (RFC 7591 dynamic client registration).
const oauthClientSchema = new Schema(
  {
    clientId: { type: String, required: true, unique: true },
    // Only for confidential clients; public clients (the usual case) have none.
    clientSecretHash: { type: String, default: null },
    tokenEndpointAuthMethod: {
      type: String,
      enum: ['none', 'client_secret_post', 'client_secret_basic'],
      default: 'none',
    },
    clientName: { type: String, trim: true, maxlength: 120, default: null },
    clientUri: { type: String, maxlength: 500, default: null },
    logoUri: { type: String, maxlength: 500, default: null },
    redirectUris: { type: [String], required: true },
    // Set once someone approves it; unapproved registrations are cleaned up.
    approved: { type: Boolean, default: false },
  },
  { timestamps: true },
);
// Registrations nobody ever approved go after 30 days.
oauthClientSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 3600, partialFilterExpression: { approved: false } },
);

// One person's permission for one assistant (or one API key).
const connectorGrantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: GRANT_KINDS, required: true },
    // What the person sees in their list: the assistant's name, or the key's label.
    name: { type: String, required: true, trim: true, maxlength: 120 },
    clientId: { type: String, default: null },
    // The redirect host, shown so people can tell two "Claude"s apart.
    clientHost: { type: String, default: null },
    scopes: { type: [String], enum: CONNECTOR_SCOPES, default: ['read'] },
    // true: every workspace the person can see, now and later.
    allWorkspaces: { type: Boolean, default: true },
    workspaceIds: { type: [Schema.Types.ObjectId], ref: 'Workspace', default: [] },
    // API keys only: the hash, and the first characters to recognise it by.
    keyHash: { type: String, default: null },
    keyPreview: { type: String, default: null },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
connectorGrantSchema.index({ userId: 1, revokedAt: 1, createdAt: -1 });
connectorGrantSchema.index(
  { keyHash: 1 },
  { unique: true, partialFilterExpression: { keyHash: { $type: 'string' } } },
);
connectorGrantSchema.index({ userId: 1, clientId: 1, revokedAt: 1 });

// Authorization codes live for a minute and work once.
const oauthCodeSchema = new Schema(
  {
    codeHash: { type: String, required: true, unique: true },
    grantId: { type: Schema.Types.ObjectId, ref: 'ConnectorGrant', required: true },
    clientId: { type: String, required: true },
    redirectUri: { type: String, required: true },
    codeChallenge: { type: String, required: true },
    resource: { type: String, default: null },
    scopes: { type: [String], default: ['read'] },
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
oauthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const connectorTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    kind: { type: String, enum: TOKEN_KINDS, required: true },
    grantId: { type: Schema.Types.ObjectId, ref: 'ConnectorGrant', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clientId: { type: String, required: true },
    scopes: { type: [String], default: ['read'] },
    resource: { type: String, default: null },
    // Refresh tokens: set when exchanged. Seeing one again means it leaked.
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
connectorTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
connectorTokenSchema.index({ grantId: 1 });

export const OAuthClient = mongoose.model('OAuthClient', oauthClientSchema);
export const ConnectorGrant = mongoose.model('ConnectorGrant', connectorGrantSchema);
export const OAuthCode = mongoose.model('OAuthCode', oauthCodeSchema);
export const ConnectorToken = mongoose.model('ConnectorToken', connectorTokenSchema);
