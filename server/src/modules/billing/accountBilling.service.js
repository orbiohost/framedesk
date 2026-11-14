import { AppError } from '../../utils/AppError.js';
import { PLANS } from '../plans/plans.catalog.js';
import { toBillingProfile } from '../users/users.service.js';
import { Workspace, storageLimitBytes } from '../workspaces/workspace.model.js';
import { getSeller } from './billingSettings.service.js';
import { AI_CREDITS_CODE, AI_RESET_CODE, Payment } from './payment.model.js';
import { effectiveBilling } from './planLifecycle.service.js';
import { UpgradeRequest } from './upgradeRequest.model.js';

// A person's own billing: the plans on the workspaces they own, every payment
// made for them, and the upgrade requests they sent. Payments are stored on the
// owner's account workspace, so ownership is what decides who sees a bill.

const ACROSS_OWNED = { crossWorkspace: true };
const HISTORY_LIMIT = 200;

export function planName(code) {
  if (code === AI_CREDITS_CODE) return 'AI credits';
  if (code === AI_RESET_CODE) return 'AI usage reset';
  return PLANS.find((plan) => plan.code === code)?.name ?? code ?? 'No plan';
}

// Payments from before sequential numbering get a stable number from their id.
function legacyInvoiceNumber(payment) {
  const paidAt = new Date(payment.paidAt);
  const month = `${paidAt.getUTCFullYear()}${String(paidAt.getUTCMonth() + 1).padStart(2, '0')}`;
  return `FD-${month}-${String(payment._id).slice(-6).toUpperCase()}`;
}

function periodStartOf(payment) {
  if (!payment.periodEnd) return null;
  const start = new Date(payment.periodEnd);
  start.setMonth(start.getMonth() - (payment.interval === 'yearly' ? 12 : 1));
  return start;
}

// A saved payment as the invoice renderer wants it. New payments carry their
// own seller and billed-to details.
export function invoiceFromPayment(payment, workspace) {
  const dto = toPaymentDto(payment, new Map([[String(workspace._id), workspace.name]]));
  return { payment: dto, seller: dto.seller, billedTo: dto.billedTo };
}

function toPaymentDto(payment, workspaceNames) {
  return {
    id: String(payment._id),
    invoiceNumber: payment.invoiceNumber ?? legacyInvoiceNumber(payment),
    seller: payment.seller ?? null,
    workspaceId: String(payment.workspaceId),
    workspaceName: workspaceNames.get(String(payment.workspaceId)) ?? 'Workspace',
    kind: payment.kind ?? 'plan',
    credits: payment.credits ?? null,
    planCode: payment.planCode,
    planName: planName(payment.planCode),
    interval: payment.interval,
    amount: payment.amount,
    taxableAmount: payment.taxableAmount ?? payment.amount,
    tax: payment.tax ?? null,
    billedTo: payment.billedTo ?? null,
    currency: payment.currency ?? 'INR',
    method: payment.method,
    razorpayMethod: payment.razorpay?.method ?? null,
    reference: payment.reference,
    offerCode: payment.offerCode,
    paidAt: payment.paidAt,
    periodStart: periodStartOf(payment),
    periodEnd: payment.periodEnd,
  };
}

function toRequestDto(request, workspaceNames) {
  return {
    id: String(request._id),
    workspaceName: workspaceNames.get(String(request.workspaceId)) ?? 'Workspace',
    planCode: request.planCode,
    planName: planName(request.planCode),
    interval: request.interval,
    quotedAmount: request.quotedAmount,
    offerCode: request.offerCode,
    status: request.status,
    createdAt: request.createdAt,
    activatedAt: request.activatedAt,
  };
}

function toAccountDto(workspace, sharedCount) {
  const billing = effectiveBilling(workspace.billing);
  return {
    workspaceId: String(workspace._id),
    workspaceName: workspace.name,
    sharedWorkspaces: sharedCount,
    planCode: billing.planCode,
    planName: billing.planCode ? planName(billing.planCode) : null,
    status: billing.status,
    interval: billing.interval,
    amount: billing.amount,
    currentPeriodEnd: billing.currentPeriodEnd,
    trialEndsAt: billing.trialEndsAt,
    graceEndsAt: billing.graceEndsAt,
    storage: { usedBytes: workspace.storage.usedBytes, limitBytes: storageLimitBytes(workspace) },
  };
}

async function ownedWorkspaces(userId) {
  return Workspace.find({ ownerId: userId }).sort({ createdAt: 1 }).lean();
}

export async function getAccountBilling(user) {
  const workspaces = await ownedWorkspaces(user._id);
  const ids = workspaces.map((workspace) => workspace._id);
  const names = new Map(workspaces.map((workspace) => [String(workspace._id), workspace.name]));

  const [payments, requests] = ids.length
    ? await Promise.all([
        Payment.find({ workspaceId: { $in: ids } })
          .setOptions(ACROSS_OWNED)
          .sort({ paidAt: -1, _id: -1 })
          .limit(HISTORY_LIMIT)
          .lean(),
        UpgradeRequest.find({ workspaceId: { $in: ids } })
          .setOptions(ACROSS_OWNED)
          .sort({ createdAt: -1 })
          .limit(50)
          .lean(),
      ])
    : [[], []];

  const accounts = workspaces
    .filter((workspace) => !workspace.storagePoolId)
    .map((account) =>
      toAccountDto(
        account,
        workspaces.filter((ws) => String(ws.storagePoolId) === String(account._id)).length,
      ),
    );

  return {
    accounts,
    payments: payments.map((payment) => toPaymentDto(payment, names)),
    requests: requests.map((request) => toRequestDto(request, names)),
    totals: {
      amount: Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100,
      count: payments.length,
    },
    seller: await getSeller(),
    billedTo: { name: user.name, email: user.email, ...toBillingProfile(user) },
  };
}

// One payment, only if it belongs to a workspace this person owns.
export async function getInvoice(user, paymentId) {
  const payment = await Payment.findById(paymentId).setOptions(ACROSS_OWNED).lean();
  const workspace = payment && (await Workspace.findById(payment.workspaceId).lean());
  if (!workspace || String(workspace.ownerId) !== String(user._id)) {
    throw AppError.notFound('Invoice not found');
  }
  const dto = toPaymentDto(payment, new Map([[String(workspace._id), workspace.name]]));
  return {
    payment: dto,
    // As printed when issued; older payments use the current details.
    seller: dto.seller ?? (await getSeller()),
    // The address as it was when paid; older payments fall back to the current one.
    billedTo: dto.billedTo ?? { name: user.name, email: user.email, ...toBillingProfile(user) },
  };
}
