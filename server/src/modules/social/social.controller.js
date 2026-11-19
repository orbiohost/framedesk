import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { baseCookieOptions } from '../../utils/cookies.js';
import * as socialService from './social.service.js';
import { OAUTH_STATE_TTL_MS } from './socialTokens.js';

function aiContext(req) {
  return { workspace: req.workspace, pool: req.storagePool, user: req.user };
}

// Holds the state of a login in progress. Lax, so it comes back on the
// platform's top-level redirect to the callback.
const STATE_COOKIE = 'social_oauth';
const stateCookieOptions = () => ({
  ...baseCookieOptions(),
  path: socialService.OAUTH_CALLBACK_BASE,
  httpOnly: true,
  sameSite: 'lax',
});

export const getProviders = asyncHandler(async (req, res) => {
  sendSuccess(res, { providers: await socialService.getProviders() });
});

export const lookupProfile = asyncHandler(async (req, res) => {
  sendSuccess(res, { lookup: await socialService.lookupProfile(req.workspace._id, req.body) });
});

export const createPublicAccount = asyncHandler(async (req, res) => {
  const account = await socialService.createPublicAccount(
    req.workspace._id,
    req.user._id,
    req.body,
  );
  sendSuccess(res, { account }, { status: 201 });
});

export const extractImport = asyncHandler(async (req, res) => {
  sendSuccess(res, { extracted: await socialService.extractImport(aiContext(req), req.body) });
});

export const saveImport = asyncHandler(async (req, res) => {
  const result = await socialService.saveImport(req.workspace._id, req.user._id, req.body);
  sendSuccess(res, result, { status: 201 });
});

export const startOAuth = asyncHandler(async (req, res) => {
  const { url, state } = await socialService.startOAuth(
    { workspace: req.workspace, user: req.user },
    req.params.provider,
    req.body ?? {},
  );
  res.cookie(STATE_COOKIE, state, { ...stateCookieOptions(), maxAge: OAUTH_STATE_TTL_MS });
  sendSuccess(res, { url });
});

export const oauthCallback = asyncHandler(async (req, res) => {
  const cookieState = req.cookies?.[STATE_COOKIE] ?? null;
  res.clearCookie(STATE_COOKIE, stateCookieOptions());
  const redirect = await socialService.finishOAuth(req.params.provider, {
    query: req.query,
    cookieState,
  });
  res.set('Cache-Control', 'no-store');
  res.redirect(302, redirect);
});

export const listAccounts = asyncHandler(async (req, res) => {
  const accounts = await socialService.listAccounts(req.workspace._id);
  sendSuccess(res, { accounts });
});

export const getAccount = asyncHandler(async (req, res) => {
  const account = await socialService.getAccount(req.workspace._id, req.params.accountId);
  sendSuccess(res, { account });
});

export const createManualAccount = asyncHandler(async (req, res) => {
  const account = await socialService.createManualAccount(
    req.workspace._id,
    req.user._id,
    req.body,
  );
  sendSuccess(res, { account }, { status: 201 });
});

export const updateAccount = asyncHandler(async (req, res) => {
  const account = await socialService.updateAccount(
    req.workspace._id,
    req.params.accountId,
    req.body,
  );
  sendSuccess(res, { account });
});

export const disconnectAccount = asyncHandler(async (req, res) => {
  const result = await socialService.disconnectAccount(req.workspace._id, req.params.accountId);
  sendSuccess(res, result);
});

export const syncAccount = asyncHandler(async (req, res) => {
  const account = await socialService.syncAccount(req.workspace._id, req.params.accountId);
  sendSuccess(res, { account });
});

export const addManualPost = asyncHandler(async (req, res) => {
  const post = await socialService.addManualPost(req.workspace._id, req.params.accountId, req.body);
  sendSuccess(res, { post }, { status: 201 });
});

export const updateManualPost = asyncHandler(async (req, res) => {
  const post = await socialService.updateManualPost(
    req.workspace._id,
    req.params.contentId,
    req.body,
  );
  sendSuccess(res, { post });
});

export const deleteContent = asyncHandler(async (req, res) => {
  const result = await socialService.deleteContent(req.workspace._id, req.params.contentId);
  sendSuccess(res, result);
});

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await socialService.getAnalytics(req.workspace._id, req.query);
  sendSuccess(res, { analytics });
});

export const listContent = asyncHandler(async (req, res) => {
  const posts = await socialService.listContent(req.workspace._id, req.query);
  sendSuccess(res, { posts });
});

export const getContent = asyncHandler(async (req, res) => {
  const post = await socialService.getContent(req.workspace._id, req.params.contentId);
  sendSuccess(res, { post });
});

export const generateSuggestions = asyncHandler(async (req, res) => {
  const suggestions = await socialService.generateSuggestions(aiContext(req), req.body);
  sendSuccess(res, { suggestions });
});

export const optimizePost = asyncHandler(async (req, res) => {
  const result = await socialService.optimizePost(aiContext(req), req.body);
  sendSuccess(res, { result });
});
