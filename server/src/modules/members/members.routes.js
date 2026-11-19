import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { optionalAuthenticate } from '../../middleware/optionalAuthenticate.js';
import { canAdminister, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { email, objectId } from '../../utils/zodHelpers.js';
import * as controller from './members.controller.js';
import {
  acceptInvite,
  createInvite,
  listInvites,
  previewInvite,
  revokeInvite,
} from './invites.service.js';
import { changeMemberRole, removeMember } from './members.service.js';
import { INVITE_ROLES } from './roles.js';

// Mounted at /workspaces/:workspaceId/members.
const router = Router();

router.get('/', canView, controller.list);

router.get(
  '/invites',
  canAdminister,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { invites: await listInvites(req.workspace._id) });
  }),
);

router.post(
  '/invites',
  canAdminister,
  validate({ body: z.object({ email, role: z.enum(INVITE_ROLES).default('editor') }) }),
  asyncHandler(async (req, res) => {
    const result = await createInvite(
      { workspace: req.workspace, pool: req.storagePool, inviter: req.user },
      req.body,
    );
    sendSuccess(res, result, { status: 201 });
  }),
);

router.delete(
  '/invites/:inviteId',
  canAdminister,
  validate({ params: z.object({ inviteId: objectId }) }),
  asyncHandler(async (req, res) => {
    await revokeInvite(req.workspace._id, req.params.inviteId);
    sendSuccess(res, { ok: true });
  }),
);

const memberParams = z.object({ userId: objectId });

router.patch(
  '/:userId',
  canAdminister,
  validate({ params: memberParams, body: z.object({ role: z.enum(INVITE_ROLES) }) }),
  asyncHandler(async (req, res) => {
    await changeMemberRole(req.workspace, req.user._id, req.params.userId, req.body.role);
    sendSuccess(res, { ok: true });
  }),
);

router.delete(
  '/:userId',
  validate({ params: memberParams }),
  asyncHandler(async (req, res) => {
    await removeMember(req.workspace, req.membership, req.params.userId);
    sendSuccess(res, { ok: true });
  }),
);

export default router;

// Mounted at /invites/:token: opening and accepting an invite link.
export const publicInviteRouter = Router({ mergeParams: true });

const tokenParams = z.object({ token: z.string().min(20).max(200) });

publicInviteRouter.get(
  '/',
  optionalAuthenticate,
  validate({ params: tokenParams }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { invite: await previewInvite(req.params.token, req.user) });
  }),
);

publicInviteRouter.post(
  '/accept',
  authenticate,
  validate({ params: tokenParams }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await acceptInvite(req.params.token, req.user));
  }),
);
