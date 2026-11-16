import mongoose, { Schema } from 'mongoose';
import { workspaceScopePlugin } from '../../utils/workspaceScope.plugin.js';
import { SOCIAL_PLATFORMS } from './socialAccount.model.js';

export const MEDIA_TYPES = [
  'reel',
  'carousel',
  'image',
  'video',
  'short',
  'broadcast',
  'story',
  'post',
  'thread',
];

export const PERFORMANCE_SCORES = ['top', 'good', 'average', 'low'];

// synced: pulled from the platform's API. manual: added by the team.
export const CONTENT_SOURCES = ['synced', 'manual'];

const socialContentSchema = new Schema(
  {
    socialAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'SocialAccount',
      required: true,
    },
    platform: {
      type: String,
      enum: SOCIAL_PLATFORMS,
      required: true,
    },
    source: {
      type: String,
      enum: CONTENT_SOURCES,
      default: 'manual',
    },
    // The platform's id for the post, so a re-sync updates instead of duplicating.
    externalId: {
      type: String,
      default: null,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: '',
    },
    mediaType: {
      type: String,
      enum: MEDIA_TYPES,
      default: 'post',
    },
    mediaUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },
    thumbnailUrl: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },
    permalink: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: null,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
    performanceScore: {
      type: String,
      enum: PERFORMANCE_SCORES,
      default: 'average',
    },
    metrics: {
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      saves: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
      reach: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      engagementRate: { type: Number, default: 0 },
    },
    // Filled in by the AI account analysis; empty until then.
    aiAnalysis: {
      hookScore: { type: Number, min: 0, max: 100, default: null },
      keyTakeaway: { type: String, default: null },
      improvementTip: { type: String, default: null },
    },
  },
  { timestamps: true },
);

socialContentSchema.plugin(workspaceScopePlugin);
socialContentSchema.index({ workspaceId: 1, platform: 1, publishedAt: -1 });
socialContentSchema.index({ workspaceId: 1, performanceScore: 1 });
socialContentSchema.index({ workspaceId: 1, socialAccountId: 1, publishedAt: -1 });
socialContentSchema.index(
  { workspaceId: 1, socialAccountId: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } },
);

export const SocialContent = mongoose.model('SocialContent', socialContentSchema);
