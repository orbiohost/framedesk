import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';

export const SOCIAL_PLATFORMS = [
  'instagram',
  'whatsapp',
  'youtube',
  'tiktok',
  'linkedin',
  'twitter',
  'facebook',
];

// connected: synced fine. error: the last sync failed (statusMessage says why).
// reconnect: the platform revoked or expired our access; the user must log in again.
export const ACCOUNT_STATUSES = ['connected', 'syncing', 'error', 'reconnect', 'disconnected'];

// oauth: linked through the platform's login, synced from its API.
// public: public profile data read with the server's API key (YouTube), no login.
// manual: stats and posts typed in or imported by the team.
export const CONNECTION_TYPES = ['oauth', 'public', 'manual'];

const MAX_HISTORY = 120;

const socialAccountSchema = new Schema(
  {
    platform: {
      type: String,
      enum: SOCIAL_PLATFORMS,
      required: true,
    },
    connection: {
      type: String,
      enum: CONNECTION_TYPES,
      default: 'manual',
    },
    // The platform's own id for this account (IG user id, page id, channel id...).
    externalId: {
      type: String,
      default: null,
    },
    handle: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    accountName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    accountType: {
      type: String,
      trim: true,
      maxlength: 60,
      default: 'business',
    },
    category: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    // What the team wants from this channel; steers the AI.
    goal: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    profileUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    avatarUrl: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    followerCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    followingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    postCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    engagementRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: 'connected',
    },
    statusMessage: {
      type: String,
      default: null,
      maxlength: 250,
    },
    metrics: {
      reach: { type: Number, default: 0 },
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      storyViews: { type: Number, default: 0 },
      reelPlays: { type: Number, default: 0 },
      messagesSent: { type: Number, default: 0 },
      openRate: { type: Number, default: 0 },
      growthRate: { type: Number, default: 0 },
      profileViews: { type: Number, default: 0 },
      totalViews: { type: Number, default: 0 },
      totalLikes: { type: Number, default: 0 },
    },
    // Follower count over time (one point per sync, at most one per hour), for growth.
    history: {
      type: [
        {
          _id: false,
          at: { type: Date, required: true },
          followers: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    // Encrypted OAuth tokens. Never sent to the browser.
    auth: {
      type: {
        _id: false,
        accessToken: { type: String, default: null },
        refreshToken: { type: String, default: null },
        expiresAt: { type: Date, default: null },
        refreshExpiresAt: { type: Date, default: null },
        scopes: { type: [String], default: [] },
      },
      select: false,
      default: null,
    },
    // The latest AI content analysis for this account.
    aiInsight: {
      type: Schema.Types.Mixed,
      default: null,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
    connectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true, minimize: false },
);

socialAccountSchema.plugin(workspaceScopePlugin);
socialAccountSchema.index({ workspaceId: 1, platform: 1 });
socialAccountSchema.index({ workspaceId: 1, status: 1 });
socialAccountSchema.index(
  { workspaceId: 1, platform: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } },
);
// For the background sync: linked accounts, oldest sync first.
socialAccountSchema.index({ connection: 1, lastSyncedAt: 1 });

socialAccountSchema.statics.MAX_HISTORY = MAX_HISTORY;

export const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);
