import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as avatarsService from './avatars.service.js';
import * as usersService from './users.service.js';

export function getMe(req, res) {
  sendSuccess(res, { user: usersService.toPublicUser(req.user) });
}

export const updateMe = asyncHandler(async (req, res) => {
  const user = await usersService.updateProfile(req.user._id, req.body);
  sendSuccess(res, { user: usersService.toPublicUser(user) });
});

export const setAvatar = asyncHandler(async (req, res) => {
  const user = await avatarsService.setAvatar(req.user._id, req.body.image);
  sendSuccess(res, { user: usersService.toPublicUser(user) });
});

export const clearAvatar = asyncHandler(async (req, res) => {
  const user = await avatarsService.clearAvatar(req.user._id);
  sendSuccess(res, { user: usersService.toPublicUser(user) });
});

export const changePassword = asyncHandler(async (req, res) => {
  await usersService.changePassword(req.user._id, req.body, req.sessionId);
  sendSuccess(res, { changed: true });
});
