import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPricing } from './plans.service.js';

// Public: the website shows prices before anyone signs in.
export const pricing = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  sendSuccess(res, await getPricing());
});
