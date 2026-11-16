import { z } from 'zod';
import { objectId, optionalText, searchQuery } from '../../utils/zodHelpers.js';
import { SOCIAL_PLATFORMS } from './socialAccount.model.js';
import { MEDIA_TYPES, PERFORMANCE_SCORES } from './socialContent.model.js';

const count = z.coerce.number().int().min(0).max(10_000_000_000);
const timeZone = z.string().trim().max(64).optional();

export const accountParamsSchema = z.object({
  accountId: objectId,
});

export const contentParamsSchema = z.object({
  contentId: objectId,
});

export const providerParamsSchema = z.object({
  provider: z.enum(['instagram', 'facebook', 'youtube', 'tiktok']),
});

export const lookupSchema = z.object({
  input: z.string().trim().min(1, 'Paste a profile link or @handle').max(500),
  platform: z.enum(SOCIAL_PLATFORMS).optional(),
});

export const publicAccountSchema = z.object({
  input: z.string().trim().min(1).max(500),
  goal: optionalText(200),
  category: optionalText(80),
});

const MAX_IMAGE_CHARS = 2_000_000; // ~1.5 MB per screenshot after base64
export const importExtractSchema = z
  .object({
    platform: z.enum(SOCIAL_PLATFORMS),
    images: z.array(z.string().max(MAX_IMAGE_CHARS, 'A screenshot is too large')).max(8, 'Up to 8 screenshots at a time').optional(),
    text: z.string().max(400_000, 'That file is too large; export a shorter date range').optional(),
  })
  .refine((value) => value.images?.length || value.text?.trim(), 'Add a screenshot or an exported file');

const importedPost = z.object({
  caption: z.string().trim().min(1).max(5000),
  title: z.string().trim().max(300).optional(),
  mediaType: z.enum(MEDIA_TYPES).optional(),
  permalink: z.string().trim().max(1000).optional(),
  publishedAt: z.coerce.date().optional(),
  likes: count.optional(),
  comments: count.optional(),
  shares: count.optional(),
  saves: count.optional(),
  views: count.optional(),
  reach: count.optional(),
  clicks: count.optional(),
});

export const importSaveSchema = z
  .object({
    accountId: objectId.optional(),
    account: z
      .object({
        platform: z.enum(SOCIAL_PLATFORMS),
        handle: z.string().trim().max(200).optional(),
        accountName: z.string().trim().max(120).optional(),
        category: optionalText(80),
        goal: optionalText(200),
      })
      .optional(),
    profile: z
      .object({
        handle: z.string().trim().max(200).optional(),
        accountName: z.string().trim().max(120).optional(),
        followerCount: count.optional(),
        followingCount: count.optional(),
        postCount: count.optional(),
        bio: z.string().trim().max(1000).optional(),
      })
      .optional(),
    posts: z.array(importedPost).max(100),
  })
  .refine((value) => value.accountId || value.account, 'Pick the account to import into');

export const startOAuthSchema = z.object({
  returnTo: z.string().trim().max(500).optional(),
});

// An account added by hand: real numbers the team reads off the platform.
export const manualAccountSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  handle: z.string().trim().min(1, 'Enter the account handle').max(200),
  accountName: z.string().trim().max(120).optional(),
  accountType: optionalText(60),
  category: optionalText(80),
  goal: optionalText(200),
  bio: optionalText(1000),
  profileUrl: optionalText(500),
  followerCount: count.optional(),
  followingCount: count.optional(),
  postCount: count.optional(),
});

export const updateAccountSchema = z
  .object({
    handle: z.string().trim().min(1).max(200).optional(),
    accountName: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().max(80).optional(),
    goal: z.string().trim().max(200).optional(),
    bio: z.string().trim().max(1000).optional(),
    profileUrl: z.string().trim().max(500).optional(),
    followerCount: count.optional(),
    followingCount: count.optional(),
    postCount: count.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

export const manualPostSchema = z.object({
  title: z.string().trim().max(300).optional(),
  caption: z.string().trim().min(1, 'Paste the caption or describe the post').max(5000),
  mediaType: z.enum(MEDIA_TYPES).optional(),
  permalink: z.string().trim().max(1000).optional(),
  publishedAt: z.coerce.date().optional(),
  likes: count.optional(),
  comments: count.optional(),
  shares: count.optional(),
  saves: count.optional(),
  views: count.optional(),
  reach: count.optional(),
  clicks: count.optional(),
});

export const updateManualPostSchema = manualPostSchema.partial();

export const analyticsQuerySchema = z.object({
  tz: timeZone,
});

export const listContentQuerySchema = z.object({
  platform: z.enum([...SOCIAL_PLATFORMS, 'all']).optional(),
  accountId: objectId.optional(),
  mediaType: z.enum([...MEDIA_TYPES, 'all']).optional(),
  performanceScore: z.enum([...PERFORMANCE_SCORES, 'all']).optional(),
  q: searchQuery,
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const generateSuggestionsSchema = z
  .object({
    accountId: objectId.optional(),
    platform: z.enum(SOCIAL_PLATFORMS).optional(),
    goal: z.string().trim().max(200).optional(),
    topic: z.string().trim().max(200).optional(),
    targetAudience: z.string().trim().max(200).optional(),
    timeZone,
  })
  .refine((value) => value.accountId || value.platform, 'Pick an account or a platform');

export const optimizePostSchema = z.object({
  accountId: objectId.optional(),
  platform: z.enum(SOCIAL_PLATFORMS),
  caption: z.string().trim().min(1, 'Caption or message is required').max(5000),
  goal: z.string().trim().max(200).optional(),
});
