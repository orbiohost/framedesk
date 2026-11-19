import { credentialsFor, youtubeApiKey } from './socialCredentials.js';

// The platforms whose own login we can send people through, and how to read
// their profile and recent posts once they have said yes. Every provider has
// the same shape:
//
//   enabled                     keys are configured
//   authorizeUrl({ state, challenge, redirectUri })
//   exchangeCode({ code, verifier, redirectUri }) -> tokenSet
//   refresh(tokenSet)           -> a fresh tokenSet, or null when not needed
//   identities(tokenSet)        -> [{ externalId, tokenSet, profile }] (one login can
//                                  hold several accounts, e.g. Facebook Pages)
//   snapshot(tokenSet, externalId) -> { profile, posts, accountMetrics }
//
// tokenSet: { accessToken, refreshToken, expiresAt, refreshExpiresAt, scopes }
// profile:  { handle, accountName, accountType, avatarUrl, profileUrl, bio,
//             followerCount, followingCount, postCount }
// post:     { externalId, title, caption, mediaType, mediaUrl, thumbnailUrl,
//             permalink, publishedAt, durationSeconds,
//             metrics: { likes, comments, shares, saves, views, reach } }

const GRAPH_VERSION = 'v23.0';
const REQUEST_TIMEOUT_MS = 20_000;
const POSTS_TO_SYNC = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export class SocialApiError extends Error {
  constructor(message, { status = 502, needsReconnect = false } = {}) {
    super(message);
    this.status = status;
    this.needsReconnect = needsReconnect;
  }
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function expiresIn(seconds) {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? new Date(Date.now() + n * 1000) : null;
}

function firstLine(text, max = 120) {
  const line = String(text ?? '')
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// Meta, Google and TikTok each word their errors differently; pull out a
// readable message and whether the user's login is no longer valid.
function readApiError(status, body) {
  const metaError = body?.error && typeof body.error === 'object' ? body.error : null;
  if (metaError && (metaError.message || metaError.code !== undefined)) {
    // TikTok: { error: { code: 'ok' | 'access_token_invalid' | ..., message } }
    if (typeof metaError.code === 'string') {
      const reconnect = /token|scope|auth/i.test(metaError.code);
      return new SocialApiError(metaError.message || metaError.code, {
        status,
        needsReconnect: reconnect,
      });
    }
    // Meta: code 190 = token expired/revoked, 10/200-299 = permission missing.
    const code = Number(metaError.code);
    const reconnect = code === 190 || code === 102 || code === 10 || (code >= 200 && code < 300);
    return new SocialApiError(metaError.message || 'The platform refused the request', {
      status,
      needsReconnect: reconnect,
    });
  }
  // Google: { error: { code, message, status } } handled above; token endpoint
  // answers { error: 'invalid_grant', error_description }.
  if (typeof body?.error === 'string') {
    return new SocialApiError(body.error_description || body.error, {
      status,
      needsReconnect: body.error === 'invalid_grant' || status === 401,
    });
  }
  return new SocialApiError(`The platform answered ${status}`, {
    status,
    needsReconnect: status === 401,
  });
}

async function request(url, { method = 'GET', headers = {}, form, json, bearer } = {}) {
  const init = { method, headers: { Accept: 'application/json', ...headers } };
  if (bearer) init.headers.Authorization = `Bearer ${bearer}`;
  if (form) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  } else if (json) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  }
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new SocialApiError(
      error?.name === 'TimeoutError'
        ? 'The platform took too long to answer'
        : 'Could not reach the platform',
    );
  }
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) throw readApiError(response.status, body);
  // TikTok answers 200 with error.code !== 'ok' on some failures.
  if (
    body?.error &&
    typeof body.error === 'object' &&
    body.error.code &&
    body.error.code !== 'ok'
  ) {
    throw readApiError(response.status, body);
  }
  return body ?? {};
}

function withQuery(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.href;
}

// Runs fn over items with at most `limit` calls in flight.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Instagram: "Instagram API with Instagram Login" (Business and Creator
// accounts, no Facebook Page needed).

const IG_GRAPH = `https://graph.instagram.com/${GRAPH_VERSION}`;
const IG_SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'];

function igMediaType(item) {
  if (item.media_product_type === 'REELS') return 'reel';
  if (item.media_product_type === 'STORY') return 'story';
  if (item.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  if (item.media_type === 'VIDEO') return 'video';
  return 'image';
}

async function igMediaInsights(mediaId, accessToken) {
  // "views" and "shares" don't exist on every kind of media; ask for less if refused.
  for (const metric of ['reach,saved,shares,views', 'reach,saved,shares', 'reach,saved']) {
    try {
      const body = await request(
        withQuery(`${IG_GRAPH}/${mediaId}/insights`, { metric, access_token: accessToken }),
      );
      const values = {};
      for (const row of body.data ?? []) {
        values[row.name] = num(row.values?.[0]?.value ?? row.total_value?.value);
      }
      return values;
    } catch (error) {
      if (error.needsReconnect && error.status === 401) throw error;
    }
  }
  return {};
}

async function igAccountInsights(accessToken) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - 28 * 24 * 60 * 60;
  try {
    const body = await request(
      withQuery(`${IG_GRAPH}/me/insights`, {
        metric: 'reach,profile_views,views',
        period: 'day',
        metric_type: 'total_value',
        since,
        until,
        access_token: accessToken,
      }),
    );
    const values = {};
    for (const row of body.data ?? []) values[row.name] = num(row.total_value?.value);
    return values;
  } catch {
    return {};
  }
}

const instagram = {
  id: 'instagram',
  platform: 'instagram',
  label: 'Instagram',
  get enabled() {
    return Boolean(credentialsFor('instagram').id);
  },
  authorizeUrl({ state, redirectUri }) {
    return withQuery('https://www.instagram.com/oauth/authorize', {
      client_id: credentialsFor('instagram').id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: IG_SCOPES.join(','),
      state,
      enable_fb_login: 0,
      force_reauth: 'true',
    });
  },
  async exchangeCode({ code, redirectUri }) {
    const short = await request('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      form: {
        client_id: credentialsFor('instagram').id,
        client_secret: credentialsFor('instagram').secret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      },
    });
    const row = Array.isArray(short.data) ? short.data[0] : short;
    if (!row?.access_token) throw new SocialApiError('Instagram did not return an access token');
    // Swap the 1-hour token for a 60-day one.
    const long = await request(
      withQuery('https://graph.instagram.com/access_token', {
        grant_type: 'ig_exchange_token',
        client_secret: credentialsFor('instagram').secret,
        access_token: row.access_token,
      }),
    );
    const permissions = Array.isArray(row.permissions)
      ? row.permissions
      : String(row.permissions ?? '')
          .split(',')
          .filter(Boolean);
    return {
      accessToken: long.access_token,
      refreshToken: null,
      expiresAt: expiresIn(long.expires_in ?? 60 * 24 * 60 * 60),
      refreshExpiresAt: null,
      scopes: permissions,
    };
  },
  async refresh(tokenSet) {
    // Long-lived tokens refresh themselves for another 60 days; do it once a
    // week before they run out.
    if (!tokenSet.expiresAt || tokenSet.expiresAt.getTime() - Date.now() > 7 * DAY_MS) return null;
    const body = await request(
      withQuery('https://graph.instagram.com/refresh_access_token', {
        grant_type: 'ig_refresh_token',
        access_token: tokenSet.accessToken,
      }),
    );
    return { ...tokenSet, accessToken: body.access_token, expiresAt: expiresIn(body.expires_in) };
  },
  async identities(tokenSet) {
    const { profile, externalId } = await igProfile(tokenSet.accessToken);
    return [{ externalId, tokenSet, profile }];
  },
  async snapshot(tokenSet) {
    const { profile } = await igProfile(tokenSet.accessToken);
    const media = await request(
      withQuery(`${IG_GRAPH}/me/media`, {
        fields:
          'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
        limit: POSTS_TO_SYNC,
        access_token: tokenSet.accessToken,
      }),
    );
    const items = (media.data ?? []).slice(0, POSTS_TO_SYNC);
    const insights = await mapLimit(items, 5, (item) =>
      igMediaInsights(item.id, tokenSet.accessToken),
    );
    const posts = items.map((item, index) => {
      const extra = insights[index] ?? {};
      return {
        externalId: String(item.id),
        title: firstLine(item.caption) || `${igMediaType(item)} post`,
        caption: item.caption ?? '',
        mediaType: igMediaType(item),
        mediaUrl: item.media_type === 'VIDEO' ? null : (item.media_url ?? null),
        thumbnailUrl: item.thumbnail_url ?? item.media_url ?? null,
        permalink: item.permalink ?? null,
        publishedAt: item.timestamp ? new Date(item.timestamp) : new Date(),
        durationSeconds: null,
        metrics: {
          likes: num(item.like_count),
          comments: num(item.comments_count),
          shares: num(extra.shares),
          saves: num(extra.saved),
          views: num(extra.views),
          reach: num(extra.reach),
        },
      };
    });
    const account = await igAccountInsights(tokenSet.accessToken);
    return {
      profile,
      posts,
      accountMetrics: {
        reach: num(account.reach),
        profileViews: num(account.profile_views),
        totalViews: num(account.views),
      },
    };
  },
};

async function igProfile(accessToken) {
  const me = await request(
    withQuery(`${IG_GRAPH}/me`, {
      fields:
        'id,user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count,biography',
      access_token: accessToken,
    }),
  );
  return {
    externalId: String(me.user_id ?? me.id),
    profile: {
      handle: me.username,
      accountName: me.name || me.username,
      accountType: String(me.account_type ?? 'business').toLowerCase(),
      avatarUrl: me.profile_picture_url ?? null,
      profileUrl: me.username ? `https://www.instagram.com/${me.username}/` : null,
      bio: me.biography ?? '',
      followerCount: num(me.followers_count),
      followingCount: num(me.follows_count),
      postCount: num(me.media_count),
    },
  };
}

// ---------------------------------------------------------------------------
// Facebook Pages, through Facebook Login. Each Page the person manages becomes
// its own account; Page tokens made from a long-lived user token don't expire.

const FB_GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const FB_SCOPES = ['pages_show_list', 'pages_read_engagement', 'read_insights'];

function fbMediaType(post) {
  const type = post.attachments?.data?.[0]?.media_type;
  if (type === 'video') return 'video';
  if (type === 'album') return 'carousel';
  if (type === 'photo') return 'image';
  return 'post';
}

function fbProfile(page) {
  return {
    handle: page.username || page.name,
    accountName: page.name,
    accountType: 'page',
    avatarUrl: page.picture?.data?.url ?? null,
    profileUrl: page.link ?? `https://www.facebook.com/${page.id}`,
    bio: page.about ?? '',
    followerCount: num(page.followers_count ?? page.fan_count),
    followingCount: 0,
    postCount: 0,
  };
}

const PAGE_FIELDS =
  'id,name,username,category,fan_count,followers_count,link,about,picture.type(large){url}';

const facebook = {
  id: 'facebook',
  platform: 'facebook',
  label: 'Facebook',
  get enabled() {
    return Boolean(credentialsFor('facebook').id);
  },
  authorizeUrl({ state, redirectUri }) {
    return withQuery(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`, {
      client_id: credentialsFor('facebook').id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: FB_SCOPES.join(','),
      state,
    });
  },
  async exchangeCode({ code, redirectUri }) {
    const short = await request(
      withQuery(`${FB_GRAPH}/oauth/access_token`, {
        client_id: credentialsFor('facebook').id,
        client_secret: credentialsFor('facebook').secret,
        redirect_uri: redirectUri,
        code,
      }),
    );
    const long = await request(
      withQuery(`${FB_GRAPH}/oauth/access_token`, {
        grant_type: 'fb_exchange_token',
        client_id: credentialsFor('facebook').id,
        client_secret: credentialsFor('facebook').secret,
        fb_exchange_token: short.access_token,
      }),
    );
    return {
      accessToken: long.access_token,
      refreshToken: null,
      expiresAt: expiresIn(long.expires_in),
      refreshExpiresAt: null,
      scopes: FB_SCOPES,
    };
  },
  async refresh() {
    return null;
  },
  async identities(tokenSet) {
    const body = await request(
      withQuery(`${FB_GRAPH}/me/accounts`, {
        fields: `${PAGE_FIELDS},access_token`,
        limit: 50,
        access_token: tokenSet.accessToken,
      }),
    );
    return (body.data ?? []).map((page) => ({
      externalId: String(page.id),
      tokenSet: {
        accessToken: page.access_token,
        refreshToken: null,
        expiresAt: null,
        refreshExpiresAt: null,
        scopes: tokenSet.scopes,
      },
      profile: fbProfile(page),
    }));
  },
  async snapshot(tokenSet, externalId) {
    const page = await request(
      withQuery(`${FB_GRAPH}/${externalId}`, {
        fields: PAGE_FIELDS,
        access_token: tokenSet.accessToken,
      }),
    );
    const feed = await request(
      withQuery(`${FB_GRAPH}/${externalId}/posts`, {
        fields:
          'id,message,created_time,permalink_url,full_picture,shares,attachments{media_type},reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
        limit: POSTS_TO_SYNC,
        access_token: tokenSet.accessToken,
      }),
    );
    const items = feed.data ?? [];
    const reach = await mapLimit(items, 5, async (post) => {
      try {
        const body = await request(
          withQuery(`${FB_GRAPH}/${post.id}/insights`, {
            metric: 'post_impressions_unique',
            access_token: tokenSet.accessToken,
          }),
        );
        return num(body.data?.[0]?.values?.[0]?.value);
      } catch {
        return 0;
      }
    });
    const posts = items.map((post, index) => ({
      externalId: String(post.id),
      title: firstLine(post.message) || 'Facebook post',
      caption: post.message ?? '',
      mediaType: fbMediaType(post),
      mediaUrl: post.full_picture ?? null,
      thumbnailUrl: post.full_picture ?? null,
      permalink: post.permalink_url ?? null,
      publishedAt: post.created_time ? new Date(post.created_time) : new Date(),
      durationSeconds: null,
      metrics: {
        likes: num(post.reactions?.summary?.total_count),
        comments: num(post.comments?.summary?.total_count),
        shares: num(post.shares?.count),
        saves: 0,
        views: 0,
        reach: reach[index] ?? 0,
      },
    }));
    return { profile: { ...fbProfile(page), postCount: posts.length }, posts, accountMetrics: {} };
  },
};

// ---------------------------------------------------------------------------
// YouTube, through Google OAuth (read-only).

const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];

function ytClient() {
  return credentialsFor('youtube');
}

// ISO 8601 duration (PT1H2M3S) to seconds.
function isoSeconds(value) {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(value ?? ''));
  if (!match) return null;
  const [, d, h, m, s] = match.map((part) => Number(part ?? 0));
  return d * 86400 + h * 3600 + m * 60 + s;
}

function ytChannelProfile(channel) {
  const snippet = channel.snippet ?? {};
  const stats = channel.statistics ?? {};
  const handle = snippet.customUrl ? snippet.customUrl.replace(/^@/, '') : channel.id;
  return {
    handle,
    accountName: snippet.title ?? handle,
    accountType: 'channel',
    avatarUrl: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.default?.url ?? null,
    profileUrl: snippet.customUrl
      ? `https://www.youtube.com/${snippet.customUrl.startsWith('@') ? snippet.customUrl : `@${snippet.customUrl}`}`
      : `https://www.youtube.com/channel/${channel.id}`,
    bio: snippet.description ?? '',
    followerCount: stats.hiddenSubscriberCount ? 0 : num(stats.subscriberCount),
    followingCount: 0,
    postCount: num(stats.videoCount),
  };
}

// auth: { bearer } for a linked account, { key } for public data.
function ytGet(path, params, auth) {
  return request(withQuery(`${YT_API}/${path}`, auth.key ? { ...params, key: auth.key } : params), {
    bearer: auth.bearer,
  });
}

async function ytChannels(accessToken) {
  const body = await ytGet(
    'channels',
    { part: 'snippet,statistics,contentDetails', mine: 'true' },
    {
      bearer: accessToken,
    },
  );
  return body.items ?? [];
}

async function ytVideos(channel, auth) {
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return [];
  const list = await ytGet(
    'playlistItems',
    { part: 'contentDetails', playlistId: uploads, maxResults: POSTS_TO_SYNC },
    auth,
  );
  const ids = (list.items ?? []).map((item) => item.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const details = await ytGet(
    'videos',
    { part: 'snippet,statistics,contentDetails', id: ids.join(',') },
    auth,
  );
  return (details.items ?? []).map(ytPost);
}

function ytPost(video) {
  const snippet = video.snippet ?? {};
  const stats = video.statistics ?? {};
  const seconds = isoSeconds(video.contentDetails?.duration);
  const tagged = /#shorts?\b/i.test(`${snippet.title} ${snippet.description}`);
  const isShort = seconds !== null && (seconds <= 60 || (seconds <= 180 && tagged));
  return {
    externalId: String(video.id),
    title: snippet.title ?? 'YouTube video',
    caption: snippet.description ?? '',
    mediaType: isShort ? 'short' : 'video',
    mediaUrl: null,
    thumbnailUrl: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? null,
    permalink: isShort
      ? `https://www.youtube.com/shorts/${video.id}`
      : `https://www.youtube.com/watch?v=${video.id}`,
    publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : new Date(),
    durationSeconds: seconds,
    metrics: {
      likes: num(stats.likeCount),
      comments: num(stats.commentCount),
      shares: 0,
      saves: num(stats.favoriteCount),
      views: num(stats.viewCount),
      reach: 0,
    },
  };
}

// Public channel by @handle, channel id (UC...) or a link to either.
export const youtubePublic = {
  get enabled() {
    return Boolean(youtubeApiKey().key);
  },
  async find(ref) {
    const auth = { key: youtubeApiKey().key };
    const params = { part: 'snippet,statistics,contentDetails' };
    if (/^UC[\w-]{20,}$/.test(ref)) params.id = ref;
    else params.forHandle = ref.startsWith('@') ? ref : `@${ref}`;
    const body = await ytGet('channels', params, auth);
    const channel = body.items?.[0];
    if (!channel)
      throw new SocialApiError('No YouTube channel found with that handle or link', {
        status: 404,
      });
    return { externalId: String(channel.id), profile: ytChannelProfile(channel), channel };
  },
  async snapshot(externalId) {
    const auth = { key: youtubeApiKey().key };
    const body = await ytGet(
      'channels',
      { part: 'snippet,statistics,contentDetails', id: externalId },
      auth,
    );
    const channel = body.items?.[0];
    if (!channel)
      throw new SocialApiError('The YouTube channel is no longer available', { status: 404 });
    return {
      profile: ytChannelProfile(channel),
      posts: await ytVideos(channel, auth),
      accountMetrics: { totalViews: num(channel.statistics?.viewCount) },
    };
  },
};

const youtube = {
  id: 'youtube',
  platform: 'youtube',
  label: 'YouTube',
  usesPkce: true,
  get enabled() {
    const client = ytClient();
    return Boolean(client.id && client.secret);
  },
  authorizeUrl({ state, challenge, redirectUri }) {
    return withQuery('https://accounts.google.com/o/oauth2/v2/auth', {
      client_id: ytClient().id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: YT_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'true',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
  },
  async exchangeCode({ code, verifier, redirectUri }) {
    const client = ytClient();
    const body = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      form: {
        code,
        client_id: client.id,
        client_secret: client.secret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      },
    });
    const scopes = String(body.scope ?? '')
      .split(' ')
      .filter(Boolean);
    if (!scopes.some((scope) => scope.includes('youtube'))) {
      throw new SocialApiError(
        'YouTube access was not granted. Tick the YouTube permission and try again.',
        {
          status: 403,
        },
      );
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: expiresIn(body.expires_in),
      refreshExpiresAt: null,
      scopes,
    };
  },
  async refresh(tokenSet) {
    if (tokenSet.expiresAt && tokenSet.expiresAt.getTime() - Date.now() > 2 * 60 * 1000)
      return null;
    if (!tokenSet.refreshToken) {
      throw new SocialApiError('YouTube access has expired', { status: 401, needsReconnect: true });
    }
    const client = ytClient();
    const body = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      form: {
        client_id: client.id,
        client_secret: client.secret,
        refresh_token: tokenSet.refreshToken,
        grant_type: 'refresh_token',
      },
    });
    return { ...tokenSet, accessToken: body.access_token, expiresAt: expiresIn(body.expires_in) };
  },
  async identities(tokenSet) {
    const channels = await ytChannels(tokenSet.accessToken);
    if (channels.length === 0) {
      throw new SocialApiError('This Google account has no YouTube channel', { status: 404 });
    }
    return channels.map((channel) => ({
      externalId: String(channel.id),
      tokenSet,
      profile: ytChannelProfile(channel),
    }));
  },
  async snapshot(tokenSet, externalId) {
    const channels = await ytChannels(tokenSet.accessToken);
    const channel = channels.find((item) => item.id === externalId) ?? channels[0];
    if (!channel)
      throw new SocialApiError('The YouTube channel is no longer available', { status: 404 });
    const posts = await ytVideos(channel, { bearer: tokenSet.accessToken });
    return {
      profile: ytChannelProfile(channel),
      posts,
      accountMetrics: { totalViews: num(channel.statistics?.viewCount) },
    };
  },
};

// ---------------------------------------------------------------------------
// TikTok, through Login Kit (Display API).

const TT_API = 'https://open.tiktokapis.com/v2';
const TT_SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list'];
const TT_USER_FIELDS =
  'open_id,avatar_url,display_name,username,bio_description,profile_deep_link,follower_count,following_count,likes_count,video_count';

function ttTokenSet(body) {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: expiresIn(body.expires_in),
    refreshExpiresAt: expiresIn(body.refresh_expires_in),
    scopes: String(body.scope ?? '')
      .split(',')
      .filter(Boolean),
  };
}

async function ttUser(accessToken) {
  const body = await request(withQuery(`${TT_API}/user/info/`, { fields: TT_USER_FIELDS }), {
    bearer: accessToken,
  });
  const user = body.data?.user ?? {};
  return {
    externalId: String(user.open_id),
    profile: {
      handle: user.username || user.display_name,
      accountName: user.display_name || user.username,
      accountType: 'creator',
      avatarUrl: user.avatar_url ?? null,
      profileUrl:
        user.profile_deep_link ??
        (user.username ? `https://www.tiktok.com/@${user.username}` : null),
      bio: user.bio_description ?? '',
      followerCount: num(user.follower_count),
      followingCount: num(user.following_count),
      postCount: num(user.video_count),
    },
    totalLikes: num(user.likes_count),
  };
}

const tiktok = {
  id: 'tiktok',
  platform: 'tiktok',
  label: 'TikTok',
  get enabled() {
    return Boolean(credentialsFor('tiktok').id);
  },
  authorizeUrl({ state, redirectUri }) {
    return withQuery('https://www.tiktok.com/v2/auth/authorize/', {
      client_key: credentialsFor('tiktok').id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: TT_SCOPES.join(','),
      state,
    });
  },
  async exchangeCode({ code, redirectUri }) {
    const body = await request(`${TT_API}/oauth/token/`, {
      method: 'POST',
      form: {
        client_key: credentialsFor('tiktok').id,
        client_secret: credentialsFor('tiktok').secret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      },
    });
    if (!body.access_token) {
      throw new SocialApiError(body.error_description || 'TikTok did not return an access token');
    }
    return ttTokenSet(body);
  },
  async refresh(tokenSet) {
    if (tokenSet.expiresAt && tokenSet.expiresAt.getTime() - Date.now() > 5 * 60 * 1000)
      return null;
    if (!tokenSet.refreshToken) {
      throw new SocialApiError('TikTok access has expired', { status: 401, needsReconnect: true });
    }
    const body = await request(`${TT_API}/oauth/token/`, {
      method: 'POST',
      form: {
        client_key: credentialsFor('tiktok').id,
        client_secret: credentialsFor('tiktok').secret,
        grant_type: 'refresh_token',
        refresh_token: tokenSet.refreshToken,
      },
    });
    if (!body.access_token) {
      throw new SocialApiError('TikTok access has expired', { status: 401, needsReconnect: true });
    }
    return ttTokenSet(body);
  },
  async identities(tokenSet) {
    const { externalId, profile } = await ttUser(tokenSet.accessToken);
    return [{ externalId, tokenSet, profile }];
  },
  async snapshot(tokenSet) {
    const { profile, totalLikes } = await ttUser(tokenSet.accessToken);
    const body = await request(
      withQuery(`${TT_API}/video/list/`, {
        fields:
          'id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count,duration',
      }),
      { method: 'POST', bearer: tokenSet.accessToken, json: { max_count: 20 } },
    );
    const posts = (body.data?.videos ?? []).map((video) => ({
      externalId: String(video.id),
      title: video.title || firstLine(video.video_description) || 'TikTok video',
      caption: video.video_description ?? '',
      mediaType: 'video',
      mediaUrl: null,
      thumbnailUrl: video.cover_image_url ?? null,
      permalink: video.share_url ?? null,
      publishedAt: video.create_time ? new Date(Number(video.create_time) * 1000) : new Date(),
      durationSeconds: num(video.duration) || null,
      metrics: {
        likes: num(video.like_count),
        comments: num(video.comment_count),
        shares: num(video.share_count),
        saves: 0,
        views: num(video.view_count),
        reach: 0,
      },
    }));
    return { profile, posts, accountMetrics: { totalLikes } };
  },
};

export const PROVIDERS = { instagram, facebook, youtube, tiktok };

export function getProvider(id) {
  return Object.hasOwn(PROVIDERS, id) ? PROVIDERS[id] : null;
}

// What the connect dialog shows: which platforms can log in for real right now.
export function providerAvailability() {
  return Object.fromEntries(
    Object.values(PROVIDERS).map((provider) => [provider.id, { oauth: provider.enabled }]),
  );
}
