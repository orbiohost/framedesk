import { AppError } from '../../utils/AppError.js';
import { UpgradeRequest } from '../billing/upgradeRequest.model.js';
import { getGstRules } from '../billing/billingSettings.service.js';
import { computeGst } from '../billing/gst.js';
import { recordPayment } from './adminSubscriptions.service.js';

// Admin reads span every workspace, so they opt out of the tenant scope guard explicitly.
const ALL_WORKSPACES = { crossWorkspace: true };

function toAdminRequestDto(request, rules) {
  return {
    id: String(request._id),
    workspace: request.workspaceId
      ? { id: String(request.workspaceId._id), name: request.workspaceId.name }
      : null,
    requestedBy: request.requestedBy
      ? { name: request.requestedBy.name, email: request.requestedBy.email }
      : null,
    planCode: request.planCode,
    interval: request.interval,
    quotedAmount: request.quotedAmount,
    // What to collect: the quote plus GST, when GST applies.
    amountDue: computeGst(request.quotedAmount, { rules }).total,
    offerCode: request.offerCode,
    status: request.status,
    createdAt: request.createdAt,
  };
}

export async function listUpgradeRequests({ status = 'open' } = {}) {
  const requests = await UpgradeRequest.find({ status })
    .setOptions(ALL_WORKSPACES)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('workspaceId', 'name')
    .populate('requestedBy', 'name email')
    .lean();
  const rules = await getGstRules();
  return requests.map((request) => toAdminRequestDto(request, rules));
}

// Marks the request paid: records the payment (which also switches the plan on).
export async function activateUpgradeRequest(requestId, adminId, { method, reference, amount }) {
  const request = await UpgradeRequest.findOneAndUpdate(
    { _id: requestId, status: 'open' },
    { $set: { status: 'activated', activatedBy: adminId, activatedAt: new Date() } },
    { new: true },
  )
    .setOptions(ALL_WORKSPACES)
    .lean();
  if (!request) throw AppError.notFound('Open upgrade request not found');

  await recordPayment(request.workspaceId, adminId, {
    // Quotes are "plus GST", so the default is the quote with GST on top.
    amount: amount ?? computeGst(request.quotedAmount, { rules: await getGstRules() }).total,
    planCode: request.planCode,
    interval: request.interval,
    method,
    reference,
    offerCode: request.offerCode,
    upgradeRequestId: request._id,
  });
}
