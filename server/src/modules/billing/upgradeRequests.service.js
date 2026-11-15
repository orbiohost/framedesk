import { quote } from '../plans/plans.service.js';
import { findPoolWorkspaceById } from '../workspaces/storagePool.js';
import { discountFor } from './discounts.service.js';
import { UpgradeRequest } from './upgradeRequest.model.js';

export function toUpgradeRequestDto(request) {
  return {
    id: String(request._id),
    planCode: request.planCode,
    interval: request.interval,
    quotedAmount: request.quotedAmount,
    offerCode: request.offerCode,
    listAmount: request.listAmount ?? request.quotedAmount,
    discount: request.discount
      ? {
          code: request.discount.code,
          amount: request.discount.amount,
          label: request.discount.label,
        }
      : null,
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
export async function requestUpgrade(workspaceId, userId, { planCode, interval, couponCode }) {
  const { amount: listAmount, offerCode } = await quote(planCode, interval);
  const pool = await findPoolWorkspaceById(workspaceId);
  const discount = await discountFor({ pool, planCode, interval, amount: listAmount, couponCode });
  const amount = listAmount - (discount?.amount ?? 0);
  const request = await UpgradeRequest.findOneAndUpdate(
    { workspaceId, status: 'open' },
    {
      $set: {
        planCode,
        interval,
        quotedAmount: amount,
        listAmount,
        discount: discount && {
          kind: discount.kind,
          code: discount.code,
          amount: discount.amount,
          label: discount.label,
        },
        offerCode,
        requestedBy: userId,
      },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean();
  return toUpgradeRequestDto(request);
}
