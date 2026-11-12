import { quote } from '../plans/plans.service.js';
import { UpgradeRequest } from './upgradeRequest.model.js';

export function toUpgradeRequestDto(request) {
  return {
    id: String(request._id),
    planCode: request.planCode,
    interval: request.interval,
    quotedAmount: request.quotedAmount,
    offerCode: request.offerCode,
    status: request.status,
    createdAt: request.createdAt,
  };
}

export async function findOpenRequest(workspaceId) {
  const request = await UpgradeRequest.findOne({ workspaceId, status: 'open' })
    .sort({ createdAt: -1 })
    .lean();
  return request ? toUpgradeRequestDto(request) : null;
}

// One open request per workspace: asking again replaces the plan choice
// (and re-quotes the price, so an expired offer can't be kept by re-submitting).
export async function requestUpgrade(workspaceId, userId, { planCode, interval }) {
  const { amount, offerCode } = quote(planCode, interval);
  const request = await UpgradeRequest.findOneAndUpdate(
    { workspaceId, status: 'open' },
    { $set: { planCode, interval, quotedAmount: amount, offerCode, requestedBy: userId } },
    { new: true, upsert: true, runValidators: true },
  ).lean();
  return toUpgradeRequestDto(request);
}
