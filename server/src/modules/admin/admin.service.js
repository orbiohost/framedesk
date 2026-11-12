import { AppError } from '../../utils/AppError.js';
import { UpgradeRequest } from '../billing/upgradeRequest.model.js';
import { recordPayment } from './adminSubscriptions.service.js';

// Admin reads span every workspace, so they opt out of the tenant scope guard explicitly.
const ALL_WORKSPACES = { crossWorkspace: true };

function toAdminRequestDto(request) {
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
  return requests.map(toAdminRequestDto);
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
    amount: amount ?? request.quotedAmount,
    planCode: request.planCode,
    interval: request.interval,
    method,
    reference,
    offerCode: request.offerCode,
    upgradeRequestId: request._id,
  });
}
