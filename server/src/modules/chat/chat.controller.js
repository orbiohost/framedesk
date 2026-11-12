import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ADMIN_ROLES } from '../members/roles.js';
import * as chatService from './chat.service.js';

export const list = asyncHandler(async (req, res) => {
  const messages = await chatService.listMessages(req.workspace._id, req.query);
  sendSuccess(res, { messages });
});

export const create = asyncHandler(async (req, res) => {
  const message = await chatService.createMessage(req.workspace._id, req.user._id, req.body);
  sendSuccess(res, { message }, { status: 201 });
});

export const remove = asyncHandler(async (req, res) => {
  await chatService.deleteMessage(req.workspace._id, req.params.messageId, {
    userId: req.user._id,
    isAdmin: ADMIN_ROLES.includes(req.membership.role),
  });
  sendSuccess(res, { deleted: true });
});
