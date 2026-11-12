import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notifyAdminsOfUpgradeRequest } from './upgradeRequests.notify.js';
import * as upgradeRequests from './upgradeRequests.service.js';

export const current = asyncHandler(async (req, res) => {
  const request = await upgradeRequests.findOpenRequest(req.workspace._id);
  sendSuccess(res, { request });
});

export const create = asyncHandler(async (req, res) => {
  const request = await upgradeRequests.requestUpgrade(req.workspace._id, req.user._id, req.body);
  await notifyAdminsOfUpgradeRequest(req.workspace._id, request, req.user);
  sendSuccess(res, { request }, { status: 201 });
});
