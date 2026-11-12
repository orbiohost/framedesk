import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as adminUsers from './adminUsers.service.js';

export const list = asyncHandler(async (req, res) => {
  sendSuccess(res, await adminUsers.listUsers(req.query));
});

export const detail = asyncHandler(async (req, res) => {
  sendSuccess(res, await adminUsers.getUserDetail(req.params.userId));
});

export const setStatus = asyncHandler(async (req, res) => {
  const user = await adminUsers.setUserStatus(req.user._id, req.params.userId, req.body.status);
  sendSuccess(res, { user });
});
