import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../admin/auditLog.service.js';
import { redirectUriFor } from './social.service.js';
import {
  APP_IDS,
  clearAppCredentials,
  credentialsFor,
  refreshSocialCredentials,
  saveAppCredentials,
  saveYoutubeApiKey,
  savedAppSummary,
  youtubeApiKey,
} from './socialCredentials.js';

// Admin › Social apps: the developer keys each platform's login needs, pasted
// in the browser instead of the server's .env. Mounted at /admin/social,
// behind the superadmin check.

const GUIDES = {
  instagram: {
    label: 'Instagram',
    console: 'https://developers.facebook.com/apps/',
    idLabel: 'Instagram app ID',
    secretLabel: 'Instagram app secret',
    scopes: ['instagram_business_basic', 'instagram_business_manage_insights'],
    steps: [
      'Open Meta for Developers › My Apps › Create app. Choose "Other", then type "Business".',
      'Add the "Instagram" product and open "API setup with Instagram login".',
      'Under "Set up Instagram business login" add the redirect URL below.',
      'Copy the Instagram app ID and Instagram app secret shown on that page (not the Meta app ID).',
      'While the app is in development, add each Instagram account as an Instagram tester (App roles › Roles) and accept the invite in Instagram. Submit App Review for the two permissions to let anyone connect.',
    ],
  },
  facebook: {
    label: 'Facebook Pages',
    console: 'https://developers.facebook.com/apps/',
    idLabel: 'App ID',
    secretLabel: 'App secret',
    scopes: ['pages_show_list', 'pages_read_engagement', 'read_insights'],
    steps: [
      'In the same Meta app (or a new Business app), add "Facebook Login for Business".',
      'Facebook Login › Settings: add the redirect URL below to "Valid OAuth Redirect URIs".',
      'Copy App ID and App secret from App settings › Basic.',
      'In development only app admins/testers can connect; request App Review for the three permissions to open it to everyone.',
    ],
  },
  youtube: {
    label: 'YouTube (Google)',
    console: 'https://console.cloud.google.com/apis/credentials',
    idLabel: 'OAuth client ID',
    secretLabel: 'Client secret',
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    steps: [
      'Google Cloud Console › APIs & Services › Library: enable "YouTube Data API v3".',
      'OAuth consent screen › Data access: add the scope youtube.readonly. Add yourself under Test users while the app is in testing.',
      'Credentials › your Web OAuth client (the one used for Google sign-in is fine): add the redirect URI below.',
      'Paste the client ID and secret here, or leave empty to use the Google sign-in keys from the server.',
    ],
  },
  tiktok: {
    label: 'TikTok',
    console: 'https://developers.tiktok.com/apps/',
    idLabel: 'Client key',
    secretLabel: 'Client secret',
    scopes: ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list'],
    steps: [
      'TikTok for Developers › Manage apps › Connect an app.',
      'Add the "Login Kit" product and the four scopes below; set the redirect URI below under Login Kit (Web).',
      'Copy the Client key and Client secret.',
      'Use Sandbox with your account as a target user to try it; submit the app for review to open it to everyone.',
    ],
  },
};

function hint(value) {
  if (!value) return null;
  return value.length <= 8 ? `${value.slice(0, 2)}…` : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

async function overview() {
  await refreshSocialCredentials({ force: true });
  const saved = await savedAppSummary();
  const yt = youtubeApiKey();
  return {
    apps: APP_IDS.map((id) => {
      const active = credentialsFor(id);
      return {
        id,
        ...GUIDES[id],
        redirectUri: redirectUriFor(id),
        configured: Boolean(active.id),
        source: active.source,
        activeIdHint: hint(active.id),
        saved: saved.apps[id],
      };
    }),
    youtubeApiKey: {
      configured: Boolean(yt.key),
      source: yt.source,
      saved: saved.youtubeApiKeySaved,
      console: 'https://console.cloud.google.com/apis/credentials',
      steps: [
        'Same Google Cloud project: enable "YouTube Data API v3".',
        'Credentials › Create credentials › API key. Restrict it to "YouTube Data API v3".',
        'Paste it here. Anyone can then add a YouTube channel from just its link (public stats, no login).',
      ],
    },
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

// Checks keys without a real login, where the platform allows it.
async function testApp(id) {
  const { id: clientId, secret } = credentialsFor(id);
  if (!clientId) return { ok: false, message: 'No keys set yet.' };
  const signal = AbortSignal.timeout(15_000);
  try {
    if (id === 'facebook') {
      const url = new URL('https://graph.facebook.com/oauth/access_token');
      url.search = new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        grant_type: 'client_credentials',
      });
      const body = await readJson(await fetch(url, { signal }));
      return body.access_token
        ? { ok: true, message: 'Meta accepted the App ID and secret.' }
        : { ok: false, message: body.error?.message ?? 'Meta refused these keys.' };
    }
    if (id === 'youtube') {
      // A made-up code: Google answers invalid_grant when the client itself is
      // fine, invalid_client when the ID or secret is wrong.
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: secret,
          code: 'framedesk-key-check',
          grant_type: 'authorization_code',
          redirect_uri: redirectUriFor('youtube'),
        }),
        signal,
      });
      const body = await readJson(response);
      if (body.error === 'invalid_grant')
        return { ok: true, message: 'Google accepted the client ID and secret.' };
      return {
        ok: false,
        message: body.error_description || body.error || 'Google refused these keys.',
      };
    }
    if (id === 'tiktok') {
      const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: clientId,
          client_secret: secret,
          grant_type: 'client_credentials',
        }),
        signal,
      });
      const body = await readJson(response);
      return body.access_token
        ? { ok: true, message: 'TikTok accepted the client key and secret.' }
        : {
            ok: false,
            message: body.error_description || body.error || 'TikTok refused these keys.',
          };
    }
    if (id === 'instagram') {
      // A made-up code: Instagram says "Invalid platform app" when the ID isn't
      // an Instagram app (usually the Meta App ID pasted by mistake), and
      // complains about the code itself when the app and secret are fine.
      const response = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: secret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUriFor('instagram'),
          code: 'framedesk-key-check',
        }),
        signal,
      });
      const body = await readJson(response);
      const message = String(body.error_message ?? body.error?.message ?? '');
      if (/platform app|client_id|app id/i.test(message)) {
        const metaUrl = new URL('https://graph.facebook.com/oauth/access_token');
        metaUrl.search = new URLSearchParams({
          client_id: clientId,
          client_secret: secret,
          grant_type: 'client_credentials',
        });
        const meta = await readJson(await fetch(metaUrl, { signal }));
        return {
          ok: false,
          message: meta.access_token
            ? 'This is your Meta App ID, not the Instagram app ID. In the Meta dashboard open Instagram › API setup with Instagram login › "Set up Instagram business login" and copy the "Instagram app ID" and "Instagram app secret" shown there (different numbers).'
            : `Instagram doesn't recognise this app ID (${message}). Copy the "Instagram app ID" from Instagram › API setup with Instagram login.`,
        };
      }
      if (/secret/i.test(message)) {
        return {
          ok: false,
          message:
            'Instagram knows the app ID but the secret is wrong. Copy the "Instagram app secret" again.',
        };
      }
      return { ok: true, message: 'Instagram accepted the app ID and secret.' };
    }
    return { ok: null, message: 'This platform can only be checked by logging in.' };
  } catch (error) {
    return {
      ok: false,
      message:
        error?.name === 'TimeoutError'
          ? 'The platform did not answer in time.'
          : 'Could not reach the platform.',
    };
  }
}

async function testYoutubeKey() {
  const { key } = youtubeApiKey();
  if (!key) return { ok: false, message: 'No API key set yet.' };
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.search = new URLSearchParams({ part: 'id', forHandle: '@YouTube', key });
    const body = await readJson(await fetch(url, { signal: AbortSignal.timeout(15_000) }));
    return body.items?.length
      ? { ok: true, message: 'The key works with the YouTube Data API.' }
      : { ok: false, message: body.error?.message ?? 'Google refused this key.' };
  } catch {
    return { ok: false, message: 'Could not reach Google.' };
  }
}

const router = Router();
const appParam = validate({ params: z.object({ app: z.enum(APP_IDS) }) });
const keyText = (label) =>
  z.string().trim().min(4, `Enter the ${label}`).max(500).regex(/^\S+$/, 'No spaces');

router.get(
  '/',
  asyncHandler(async (req, res) => sendSuccess(res, await overview())),
);

router.put(
  '/apps/:app',
  appParam,
  validate({
    body: z.object({ clientId: keyText('ID'), clientSecret: keyText('secret').optional() }),
  }),
  asyncHandler(async (req, res) => {
    const { app } = req.params;
    const saved = await savedAppSummary();
    if (!req.body.clientSecret && !saved.apps[app].secretSaved) {
      throw AppError.badRequest('Enter the secret', 'SECRET_REQUIRED');
    }
    await saveAppCredentials(app, req.body, req.user._id);
    await recordAudit({ actorId: req.user._id, action: 'social.app_keys_saved', details: { app } });
    sendSuccess(res, { ...(await overview()), test: await testApp(app) });
  }),
);

router.delete(
  '/apps/:app',
  appParam,
  asyncHandler(async (req, res) => {
    await clearAppCredentials(req.params.app);
    await recordAudit({
      actorId: req.user._id,
      action: 'social.app_keys_cleared',
      details: { app: req.params.app },
    });
    sendSuccess(res, await overview());
  }),
);

router.post(
  '/apps/:app/test',
  appParam,
  asyncHandler(async (req, res) => {
    await refreshSocialCredentials({ force: true });
    sendSuccess(res, { test: await testApp(req.params.app) });
  }),
);

router.put(
  '/youtube-key',
  validate({ body: z.object({ apiKey: keyText('API key') }) }),
  asyncHandler(async (req, res) => {
    await saveYoutubeApiKey(req.body.apiKey);
    await recordAudit({ actorId: req.user._id, action: 'social.youtube_key_saved' });
    sendSuccess(res, { ...(await overview()), test: await testYoutubeKey() });
  }),
);

router.delete(
  '/youtube-key',
  asyncHandler(async (req, res) => {
    await saveYoutubeApiKey(null);
    await recordAudit({ actorId: req.user._id, action: 'social.youtube_key_cleared' });
    sendSuccess(res, await overview());
  }),
);

router.post(
  '/youtube-key/test',
  asyncHandler(async (req, res) => {
    await refreshSocialCredentials({ force: true });
    sendSuccess(res, { test: await testYoutubeKey() });
  }),
);

export default router;
