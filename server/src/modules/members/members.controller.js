import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { listActiveMembers } from './members.service.js';

export const list = asyncHandler(async (req, res) => {
  const members = await listActiveMembers(req.workspace._id);
  sendSuccess(res, { members });
});
