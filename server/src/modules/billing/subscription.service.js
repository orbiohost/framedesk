import { findPlan, getCatalog, planStorageBytes } from '../plans/plans.service.js';
import { toBillingProfile } from '../users/users.service.js';
import { User } from '../users/user.model.js';
import { logger } from '../../utils/logger.js';
import { deliverEmailInBackground } from '../../utils/mailer.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { invoiceFromPayment } from './accountBilling.service.js';
import { paymentReceiptEmail } from './billing.emails.js';
import { invoiceFileName, renderInvoicePdf } from './invoicePdf.js';
import { getBillingSettings, nextInvoiceNumber, sellerFrom } from './billingSettings.service.js';
import { AI_CREDITS_CODE, AI_RESET_CODE, Payment } from './payment.model.js';
import { UpgradeRequest } from './upgradeRequest.model.js';

// Turning money received into a paid period. Shared by payments an admin
// records by hand and payments made online through Razorpay.

export function addInterval(from, interval) {
  const end = new Date(from);
  end.setMonth(end.getMonth() + (interval === 'yearly' ? 12 : 1));
  return end;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = { monthly: 30.4375 * DAY_MS, yearly: 365.25 * DAY_MS };

// Price per millisecond of a plan bought at `amount` (before GST) for `interval`.
function ratePerMs(amount, interval) {
  const length = INTERVAL_MS[interval];
  return amount > 0 && length ? amount / length : 0;
}

/**
 * The paid period a new payment buys: { periodStart, periodEnd }.
 *  - Nothing active: starts now.
 *  - Same plan still running: added on after the current period (renewing early).
 *  - Different plan still running: the unused time is converted at what was
 *    actually paid for it into time on the new plan, starting now. Carrying the
 *    old end date over unchanged would let a cheap yearly Starter plus one
 *    monthly Agency payment buy 13 months of Agency.
 * `amount` is the new plan's price before GST.
 */
export function nextPeriod(workspace, paidAt, { planCode, interval, amount }) {
  const { billing } = workspace;
  const end = billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd) : null;
  const running = billing.status === 'active' && end && end > paidAt;

  if (!running) return { periodStart: paidAt, periodEnd: addInterval(paidAt, interval) };
  if (billing.planCode === planCode) {
    return { periodStart: end, periodEnd: addInterval(end, interval) };
  }

  const oldRate = ratePerMs(billing.amount, billing.interval);
  const newRate = ratePerMs(amount, interval);
  // Complimentary time (no amount paid) carries no credit onto a paid plan.
  const creditMs = oldRate > 0 && newRate > 0 ? ((end - paidAt) * oldRate) / newRate : 0;
  const periodStart = new Date(paidAt.getTime() + Math.floor(creditMs));
  return { periodStart, periodEnd: addInterval(periodStart, interval) };
}

// Puts a workspace on a paid plan until `periodEnd`, with that plan's storage.
// `amount` is the plan price before GST (it drives MRR).
export async function applyPlan(workspaceId, { planCode, interval, amount, periodEnd }) {
  const plan = findPlan(await getCatalog(), planCode);
  await Workspace.updateOne(
    { _id: workspaceId },
    {
      $set: {
        'billing.planCode': plan.code,
        'billing.status': 'active',
        'billing.interval': interval,
        'billing.amount': amount,
        'billing.trialEndsAt': null,
        'billing.canceledAt': null,
        'billing.pastDueSince': null,
        'billing.currentPeriodEnd': periodEnd,
        'storage.planLimitBytes': planStorageBytes(plan),
      },
    },
  );
}

// The owner's name, email and billing address, as an invoice prints them.
export async function billedToSnapshot(userId) {
  const user = await User.findById(userId).lean();
  return user ? { name: user.name, email: user.email, ...toBillingProfile(user) } : null;
}

// Closes the workspace owner's open upgrade request once the plan is paid.
export async function closeOpenUpgradeRequests(workspaceIds, actorId = null) {
  await UpgradeRequest.updateMany(
    { workspaceId: { $in: workspaceIds }, status: 'open' },
    { $set: { status: 'activated', activatedBy: actorId, activatedAt: new Date() } },
  ).setOptions({ crossWorkspace: true });
}

/**
 * Records a payment on the account workspace and switches its plan on.
 * `fields` are the Payment fields (amount, taxableAmount, tax, method, ...).
 */
export async function recordPaidPeriod(workspace, fields) {
  const paidAt = fields.paidAt ?? new Date();
  const { periodStart, periodEnd } = nextPeriod(workspace, paidAt, {
    planCode: fields.planCode,
    interval: fields.interval,
    amount: fields.taxableAmount ?? fields.amount,
  });
  const settings = await getBillingSettings();
  // Saved before it gets an invoice number: if this is a duplicate report of a
  // Razorpay payment, create() fails here and no number is used up, so the
  // invoice series keeps no gaps.
  const created = await Payment.create({
    ...fields,
    workspaceId: workspace._id,
    paidAt,
    periodStart,
    periodEnd,
    seller: sellerFrom(settings),
  });
  const payment = await Payment.findOneAndUpdate(
    { _id: created._id, workspaceId: workspace._id },
    { $set: { invoiceNumber: await nextInvoiceNumber(settings.invoicePrefix, paidAt) } },
    { new: true },
  ).lean();
  await applyPlan(workspace._id, {
    planCode: fields.planCode,
    interval: fields.interval,
    amount: fields.taxableAmount ?? fields.amount,
    periodEnd,
  });
  sendReceipt(payment, workspace);
  return payment;
}

/**
 * Records a payment for a pack of AI credits on the account workspace, with
 * its own invoice number. The caller adds the credits (credits.service.js).
 */
// kind 'credits' (a pack) or 'reset' (AI usage limits started over).
export async function recordCreditPurchase(workspace, { kind = 'credits', ...fields }) {
  const paidAt = fields.paidAt ?? new Date();
  const settings = await getBillingSettings();
  // As in recordPaidPeriod: saved first, numbered after, so duplicates use no number.
  const created = await Payment.create({
    ...fields,
    kind,
    planCode: kind === 'reset' ? AI_RESET_CODE : AI_CREDITS_CODE,
    credits: kind === 'reset' ? null : fields.credits,
    interval: null,
    workspaceId: workspace._id,
    paidAt,
    periodStart: null,
    periodEnd: null,
    seller: sellerFrom(settings),
  });
  const payment = await Payment.findOneAndUpdate(
    { _id: created._id, workspaceId: workspace._id },
    { $set: { invoiceNumber: await nextInvoiceNumber(settings.invoicePrefix, paidAt) } },
    { new: true },
  ).lean();
  sendReceipt(payment, workspace);
  return payment;
}

/**
 * Takes back the paid time a fully refunded payment bought. Partial refunds are
 * only recorded; an admin decides what they mean. Runs once per payment: the
 * conditional update makes repeated refund webhooks harmless.
 * Returns { payment, revoked } or null when the payment was already handled.
 */
export async function revokeRefundedPayment(paymentId, { refundedPaise, fullyRefunded }) {
  const refundedAmount = Math.round(refundedPaise) / 100;
  const payment = await Payment.findOneAndUpdate(
    { _id: paymentId, refundedAt: null },
    {
      $set: {
        refundedAmount,
        ...(fullyRefunded ? { refundedAt: new Date() } : {}),
      },
    },
    { new: true },
  )
    .setOptions({ crossWorkspace: true })
    .lean();
  if (!payment || !fullyRefunded) return payment ? { payment, revoked: false } : null;
  // Credit packs bought no time; checkout.service.js takes the credits back.
  if (payment.kind !== 'plan' || !payment.periodEnd) return { payment, revoked: true };

  const start = payment.periodStart ?? payment.paidAt;
  const boughtMs = new Date(payment.periodEnd) - new Date(start);
  const workspace = await Workspace.findById(payment.workspaceId).lean();
  if (workspace?.billing?.currentPeriodEnd && boughtMs > 0) {
    const now = Date.now();
    const cutTo = Math.max(now, new Date(workspace.billing.currentPeriodEnd) - boughtMs);
    await Workspace.updateOne(
      { _id: workspace._id },
      { $set: { 'billing.currentPeriodEnd': new Date(cutTo) } },
    );
  }
  return { payment, revoked: true };
}

// Emails the invoice to whoever it is billed to. Never fails the payment.
function sendReceipt(payment, workspace) {
  try {
    const invoice = invoiceFromPayment(payment, workspace);
    if (!invoice.billedTo?.email) return;
    deliverEmailInBackground(
      paymentReceiptEmail({
        payment: invoice.payment,
        billedTo: invoice.billedTo,
        pdf: renderInvoicePdf(invoice),
        fileName: invoiceFileName(invoice.payment),
      }),
    );
  } catch (err) {
    logger.error({ err, paymentId: String(payment._id) }, 'Could not send payment receipt');
  }
}
