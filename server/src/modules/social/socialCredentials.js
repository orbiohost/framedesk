import mongoose, { Schema } from 'mongoose';
import { env } from '../../config/env.js';
import { openToken, sealToken } from './socialTokens.js';

// The developer-app keys each platform's login needs. A superadmin can paste
// them in Admin › Social apps (stored here, secrets encrypted); anything not
// set there falls back to the server's .env.

export const APP_IDS = ['instagram', 'facebook', 'youtube', 'tiktok'];

const appSchema = new Schema(
  {
    clientId: { type: String, default: null },
    clientSecret: { type: String, default: null }, // sealed
    updatedAt: { type: Date, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false },
);

const settingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    apps: {
      instagram: { type: appSchema, default: () => ({}) },
      facebook: { type: appSchema, default: () => ({}) },
      youtube: { type: appSchema, default: () => ({}) },
      tiktok: { type: appSchema, default: () => ({}) },
    },
    youtubeApiKey: { type: String, default: null }, // sealed
  },
  { timestamps: true },
);

export const SocialAppSettings = mongoose.model('SocialAppSettings', settingsSchema);

function envPair(id) {
  switch (id) {
    case 'instagram':
      return [env.INSTAGRAM_APP_ID, env.INSTAGRAM_APP_SECRET];
    case 'facebook':
      return [env.META_APP_ID, env.META_APP_SECRET];
    case 'youtube':
      return env.YOUTUBE_CLIENT_ID
        ? [env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET]
        : [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET];
    case 'tiktok':
      return [env.TIKTOK_CLIENT_KEY, env.TIKTOK_CLIENT_SECRET];
    default:
      return [undefined, undefined];
  }
}

const REFRESH_MS = 60 * 1000;
let fromDb = { apps: {}, youtubeApiKey: null };
let loadedAt = 0;
let loading = null;

// Reads the saved keys (at most once a minute, or right away with force).
export async function refreshSocialCredentials({ force = false } = {}) {
  if (!force && Date.now() - loadedAt < REFRESH_MS) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const doc = await SocialAppSettings.findOne({ key: 'default' }).lean();
      const apps = {};
      for (const id of APP_IDS) {
        const app = doc?.apps?.[id];
        const secret = openToken(app?.clientSecret);
        if (app?.clientId && secret) apps[id] = { id: app.clientId, secret };
      }
      fromDb = { apps, youtubeApiKey: openToken(doc?.youtubeApiKey) };
      loadedAt = Date.now();
    } finally {
      loading = null;
    }
  })();
  return loading;
}

// { id, secret, source: 'admin' | 'env' | null }
export function credentialsFor(appId) {
  const saved = fromDb.apps[appId];
  if (saved) return { ...saved, source: 'admin' };
  const [id, secret] = envPair(appId);
  if (id && secret) return { id, secret, source: 'env' };
  return { id: null, secret: null, source: null };
}

export function youtubeApiKey() {
  if (fromDb.youtubeApiKey) return { key: fromDb.youtubeApiKey, source: 'admin' };
  if (env.YOUTUBE_API_KEY) return { key: env.YOUTUBE_API_KEY, source: 'env' };
  return { key: null, source: null };
}

export async function saveAppCredentials(appId, { clientId, clientSecret }, adminId) {
  const update = {
    [`apps.${appId}.clientId`]: clientId,
    [`apps.${appId}.updatedAt`]: new Date(),
    [`apps.${appId}.updatedBy`]: adminId,
  };
  if (clientSecret) update[`apps.${appId}.clientSecret`] = sealToken(clientSecret);
  await SocialAppSettings.updateOne({ key: 'default' }, { $set: update }, { upsert: true });
  await refreshSocialCredentials({ force: true });
}

export async function clearAppCredentials(appId) {
  await SocialAppSettings.updateOne(
    { key: 'default' },
    {
      $set: {
        [`apps.${appId}`]: { clientId: null, clientSecret: null, updatedAt: new Date(), updatedBy: null },
      },
    },
    { upsert: true },
  );
  await refreshSocialCredentials({ force: true });
}

export async function saveYoutubeApiKey(apiKey) {
  await SocialAppSettings.updateOne(
    { key: 'default' },
    { $set: { youtubeApiKey: apiKey ? sealToken(apiKey) : null } },
    { upsert: true },
  );
  await refreshSocialCredentials({ force: true });
}

// What the admin page may show about a saved app: never the secret.
export async function savedAppSummary() {
  const doc = await SocialAppSettings.findOne({ key: 'default' }).lean();
  return {
    apps: Object.fromEntries(
      APP_IDS.map((id) => {
        const app = doc?.apps?.[id];
        return [
          id,
          {
            clientId: app?.clientId ?? null,
            secretSaved: Boolean(app?.clientSecret),
            updatedAt: app?.updatedAt ?? null,
          },
        ];
      }),
    ),
    youtubeApiKeySaved: Boolean(doc?.youtubeApiKey),
  };
}
