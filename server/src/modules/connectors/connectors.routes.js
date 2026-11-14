import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  createApiKey,
  decideAuthorization,
  describeAuthorizationRequest,
  listConnections,
  revokeConnection,
  updateConnectionWorkspaces,
} from './oauth.service.js';

// The signed-in side of AI connectors: the account page's list of connected
// assistants and API keys, and the consent screen's approve/deny.
const router = Router();
router.use(authenticate);

const objectIdString = z.string().refine(mongoose.isValidObjectId, 'Invalid id');

const workspaceChoice = {
  allWorkspaces: z.boolean().default(true),
  workspaceIds: z.array(objectIdString).max(100).default([]),
};

// The authorization request as the assistant sent it. Everything is checked
// in the service; here it only has to be a flat set of short strings.
const authorizationParams = z
  .record(z.string(), z.string().max(2000))
  .refine((params) => Object.keys(params).length <= 20, 'Too many parameters');

const connectionParams = z.object({ connectionId: objectIdString });

router.get(
  '/',
  asyncHandler(async (req, res) => sendSuccess(res, await listConnections(req.user._id))),
);

router.post(
  '/keys',
  validate({
    body: z.object({
      name: z.string().trim().min(1, 'Give the key a name').max(80),
      ...workspaceChoice,
    }),
  }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await createApiKey(req.user._id, req.body), { status: 201 }),
  ),
);

router.patch(
  '/:connectionId',
  validate({ params: connectionParams, body: z.object(workspaceChoice) }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, {
      connection: await updateConnectionWorkspaces(req.user._id, req.params.connectionId, req.body),
    }),
  ),
);

router.delete(
  '/:connectionId',
  validate({ params: connectionParams }),
  asyncHandler(async (req, res) => {
    await revokeConnection(req.user._id, req.params.connectionId);
    sendSuccess(res, { revoked: true });
  }),
);

router.get(
  '/authorize',
  validate({ query: authorizationParams }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await describeAuthorizationRequest(req.user._id, req.query)),
  ),
);

router.post(
  '/authorize',
  validate({
    body: z.object({ params: authorizationParams, approve: z.boolean(), ...workspaceChoice }),
  }),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await decideAuthorization(req.user._id, req.body)),
  ),
);

export default router;
