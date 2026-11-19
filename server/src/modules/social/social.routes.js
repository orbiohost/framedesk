import { Router } from 'express';
import { authLimiter } from '../../middleware/rateLimit.js';
import { canManage, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './social.controller.js';
import {
  accountParamsSchema,
  analyticsQuerySchema,
  contentParamsSchema,
  generateSuggestionsSchema,
  importExtractSchema,
  importSaveSchema,
  lookupSchema,
  publicAccountSchema,
  listContentQuerySchema,
  manualAccountSchema,
  manualPostSchema,
  optimizePostSchema,
  providerParamsSchema,
  startOAuthSchema,
  updateAccountSchema,
  updateManualPostSchema,
} from './social.validation.js';

const router = Router();
const withAccountId = validate({ params: accountParamsSchema });
const withContentId = validate({ params: contentParamsSchema });

// Which platforms can be linked through their own login on this server.
router.get('/providers', canView, controller.getProviders);
// Starts a real login with the platform; answers with the URL to send the browser to.
router.post(
  '/oauth/:provider/start',
  canManage,
  validate({ params: providerParamsSchema, body: startOAuthSchema }),
  controller.startOAuth,
);

// "Paste a link": which platform it is and the ways it can connect.
router.post('/lookup', canManage, validate({ body: lookupSchema }), controller.lookupProfile);
// A YouTube channel from just its link (public data, no login).
router.post(
  '/accounts/public',
  canManage,
  validate({ body: publicAccountSchema }),
  controller.createPublicAccount,
);
// Import with AI: read screenshots / exported files, then save the checked result.
router.post(
  '/import/extract',
  canManage,
  validate({ body: importExtractSchema }),
  controller.extractImport,
);
router.post('/import/save', canManage, validate({ body: importSaveSchema }), controller.saveImport);

// Accounts
router.get('/accounts', canView, controller.listAccounts);
router.post(
  '/accounts',
  canManage,
  validate({ body: manualAccountSchema }),
  controller.createManualAccount,
);
router.get('/accounts/:accountId', canView, withAccountId, controller.getAccount);
router.patch(
  '/accounts/:accountId',
  canManage,
  validate({ params: accountParamsSchema, body: updateAccountSchema }),
  controller.updateAccount,
);
router.post('/accounts/:accountId/sync', canManage, withAccountId, controller.syncAccount);
router.delete('/accounts/:accountId', canManage, withAccountId, controller.disconnectAccount);
router.post(
  '/accounts/:accountId/posts',
  canManage,
  validate({ params: accountParamsSchema, body: manualPostSchema }),
  controller.addManualPost,
);

// Analytics overview
router.get(
  '/analytics',
  canView,
  validate({ query: analyticsQuerySchema }),
  controller.getAnalytics,
);

// Content feed & details
router.get(
  '/content',
  canView,
  validate({ query: listContentQuerySchema }),
  controller.listContent,
);
router.get('/content/:contentId', canView, withContentId, controller.getContent);
router.patch(
  '/content/:contentId',
  canManage,
  validate({ params: contentParamsSchema, body: updateManualPostSchema }),
  controller.updateManualPost,
);
router.delete('/content/:contentId', canManage, withContentId, controller.deleteContent);

// AI: analyse an account's real posts and plan what to post next
router.post(
  '/suggestions',
  canView,
  validate({ body: generateSuggestionsSchema }),
  controller.generateSuggestions,
);

// AI caption & hook rewrite
router.post('/optimize', canView, validate({ body: optimizePostSchema }), controller.optimizePost);

export default router;

// Public: where Instagram, Facebook, Google and TikTok send the browser back
// after the login. The one-time state (plus its cookie) says who started it.
export const socialOAuthRouter = Router();
socialOAuthRouter.get(
  '/:provider/callback',
  authLimiter,
  validate({ params: providerParamsSchema }),
  controller.oauthCallback,
);
