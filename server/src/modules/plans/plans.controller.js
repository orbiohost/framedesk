import { sendSuccess } from '../../utils/apiResponse.js';
import { getPricing } from './plans.service.js';

// Public: the website shows prices before anyone signs in.
export function pricing(req, res) {
  res.set('Cache-Control', 'public, max-age=300');
  sendSuccess(res, getPricing());
}
