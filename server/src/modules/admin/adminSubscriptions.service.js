import { AppError } from '../../utils/AppError.js';
import { recordDiscountUse } from '../billing/discounts.service.js';
import { freeState } from '../billing/planLifecycle.service.js';
import { containsInsensitive } from '../../utils/objects.js';
import { getGstRules } from '../billing/billingSettings.service.js';
import { computeGst } from '../billing/gst.js';
import { billedToSnapshot, recordPaidPeriod } from '../billing/subscription.service.js';
import { findPlan, getCatalog, planStorageBytes } from '../plans/plans.service.js';
import { User } from '../users/user.model.js';
import { findPoolWorkspace } from '../workspaces/storagePool.js';
import { Workspace, storageLimitBytes } from '../workspaces/workspace.model.js';
import { recordAudit } from './auditLog.service.js';

const PAYING_STATUSES = ['active', 'past_due'];

// Monthly value of a subscription: yearly plans count as a twelfth per month.
export function monthlyValue(billing) {
  if (!PAYING_STATUSES.includes(billing.status) || !billing.amount) return 0;
  return billing.interval === 'yearly' ? billing.amount / 12 : billing.amount;
}

function toSubscriptionDto(workspace, owner) {
  return {
    workspaceId: String(workspace._id),
    workspaceName: workspace.name,
    owner: owner ? { id: String(owner._id), name: owner.name, email: owner.email } : null,
    billing: workspace.billing,
    monthlyValue: Math.round(monthlyValue(workspace.billing)),
    storage: { usedBytes: workspace.storage.usedBytes, limitBytes: storageLimitBytes(workspace) },
    createdAt: workspace.createdAt,
  };
}

// Plans live on the owner's account workspace; a workspace that shares it
// resolves to that account, so a payment there covers all of the owner's workspaces.
async function findWorkspaceOrThrow(workspaceId) {
  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace) throw AppError.notFound('Workspace not found');
  return findPoolWorkspace(workspace);
}

export async function listSubscriptions({ status, plan, q }) {
  // Workspaces sharing an owner's account have no subscription of their own.
  const filter = { storagePoolId: null };
  if (status) filter['billing.status'] = status;
  if (plan) filter['billing.planCode'] = plan;
  if (q) {
    const owners = await User.find({ email: containsInsensitive(q) })
      .select('_id')
      .lean();
    filter.$or = [
      { name: containsInsensitive(q) },
      { ownerId: { $in: owners.map((user) => user._id) } },
    ];
  }

  const workspaces = await Workspace.find(filter)
    .sort({ createdAt: -1 })
    .limit(300)
    .populate('ownerId', 'name email')
    .lean();
  return workspaces.map((workspace) => toSubscriptionDto(workspace, workspace.ownerId));
}

// A payment recorded by hand. `amount` is what was received, so any GST is
// taken out of it rather than added on top.
export async function recordPayment(requestedWorkspaceId, adminId, input) {
  const workspace = await findWorkspaceOrThrow(requestedWorkspaceId);
  const workspaceId = workspace._id;
  const billedTo = await billedToSnapshot(workspace.ownerId);
  const { taxableAmount, tax } = computeGst(input.amount, {
    rules: await getGstRules(),
    buyer: billedTo,
    inclusive: true,
  });

  const payment = await recordPaidPeriod(workspace, {
    amount: input.amount,
    taxableAmount,
    tax,
    billedTo,
    planCode: input.planCode,
    interval: input.interval,
    method: input.method,
    reference: input.reference || null,
    offerCode: input.offerCode ?? null,
    listAmount: input.listAmount ?? null,
    discount: input.discount ?? null,
    paidAt: input.paidAt ?? new Date(),
    recordedBy: adminId,
    upgradeRequestId: input.upgradeRequestId ?? null,
  });
  // A coupon or referral discount from the upgrade request is now used up.
  await recordDiscountUse({ pool: workspace, paymentId: payment._id, discount: input.discount });
  await recordAudit({
    actorId: adminId,
    action: 'payment.record',
    workspaceId,
    details: {
      amount: input.amount,
      planCode: input.planCode,
      interval: input.interval,
      method: input.method,
      reference: input.reference ?? null,
    },
  });
  return payment;
}

function trialExtension(workspace, days) {
  if (workspace.billing.status !== 'trialing') {
    throw AppError.badRequest('Only workspaces on a trial can have it extended', 'NOT_ON_TRIAL');
  }
  const from =
    workspace.billing.trialEndsAt > new Date() ? workspace.billing.trialEndsAt : new Date();
  return { 'billing.trialEndsAt': new Date(from.getTime() + days * 24 * 60 * 60 * 1000) };
}

async function statusChange(status) {
  // Back to the free plan, with its space.
  if (status === 'free') return freeState();
  return {
    'billing.status': status,
    'billing.canceledAt': status === 'canceled' ? new Date() : null,
  };
}

// Manual adjustments: extend a trial, change status (e.g. after a failed payment), or switch plan.
export async function adjustSubscription(requestedWorkspaceId, adminId, change) {
  const workspace = await findWorkspaceOrThrow(requestedWorkspaceId);
  const workspaceId = workspace._id;
  let update;
  if (change.action === 'extend_trial') update = trialExtension(workspace, change.days);
  if (change.action === 'set_status') update = await statusChange(change.status);
  if (change.action === 'change_plan') {
    const plan = findPlan(await getCatalog(), change.planCode);
    update = { 'billing.planCode': plan.code, 'storage.planLimitBytes': planStorageBytes(plan) };
  }

  await Workspace.updateOne({ _id: workspaceId }, { $set: update });
  await recordAudit({
    actorId: adminId,
    action: `subscription.${change.action}`,
    workspaceId,
    details: change,
  });
  const updated = await Workspace.findById(workspaceId).populate('ownerId', 'name email').lean();
  return toSubscriptionDto(updated, updated.ownerId);
}
