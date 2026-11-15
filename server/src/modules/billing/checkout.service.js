import { Types } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { recordAudit } from '../admin/auditLog.service.js';
import { findPack, getAiSettings, isAiLive } from '../ai/aiSettings.service.js';
import { CreditLedger } from '../ai/creditLedger.model.js';
import { addCredits, resetPriceFor, resetUsageWindows } from '../ai/credits.service.js';
import { quote } from '../plans/plans.service.js';
import { discountFor, recordDiscountUse } from './discounts.service.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { planName } from './accountBilling.service.js';
import { getBillingSettings, gstFrom, sellerFrom } from './billingSettings.service.js';
import { CHECKOUT_ORDER_TTL_MS, CheckoutOrder } from './checkoutOrder.model.js';
import { computeGst } from './gst.js';
import { Payment } from './payment.model.js';
import {
  capturePayment,
  createOrder,
  fetchPayment,
  isCheckoutSignatureValid,
  isRazorpayEnabled,
  razorpayKeyId,
} from './razorpay.client.js';
import {
  applyPlan,
  billedToSnapshot,
  closeOpenUpgradeRequests,
  recordCreditPurchase,
  recordPaidPeriod,
  revokeRefundedPayment,
} from './subscription.service.js';

// Online plan purchases:
//   1. createCheckout   - price + GST worked out here, a Razorpay order created for it.
//   2. Razorpay Checkout runs in the browser.
//   3. confirmCheckout  - the browser hands back the signed result; we verify and fulfil.
// The webhook (razorpayWebhook.js) calls fulfilOrder too, for payments whose
// browser closed before step 3. Fulfilment is idempotent, so both may run.

const ACROSS = { crossWorkspace: true };

function orderLabel(order) {
  if (order.kind === 'reset') return 'AI usage limit reset';
  return order.kind === 'credits'
    ? `${order.credits.toLocaleString('en-IN')} AI credits`
    : `${planName(order.planCode)} plan, ${order.interval}`;
}

async function toCheckoutDto(order, user) {
  const seller = sellerFrom(await getBillingSettings());
  return {
    orderId: order.razorpayOrderId,
    keyId: razorpayKeyId(),
    amountPaise: order.amountPaise,
    currency: order.currency,
    expiresAt: order.expiresAt,
    businessName: seller.name,
    description: orderLabel(order),
    prefill: { name: user.name, email: user.email, contact: order.billedTo?.phone ?? '' },
    summary: {
      kind: order.kind ?? 'plan',
      packCode: order.packCode,
      credits: order.credits,
      planCode: order.planCode,
      planName: planName(order.planCode),
      interval: order.interval,
      offerCode: order.offerCode,
      listAmount: order.listAmount,
      discount: order.discount,
      taxableAmount: order.taxableAmount,
      tax: order.tax,
      amount: order.amount,
    },
  };
}

// What is being bought: a plan for an interval, or a pack of AI credits.
// The price always comes from the server's own catalogue.
async function itemFor(pool, { planCode, interval, packCode, product, couponCode }) {
  if (product === 'ai-reset') {
    const settings = await getAiSettings();
    if (!isAiLive(settings)) {
      throw AppError.unavailable('The AI assistant is off right now', 'AI_OFF');
    }
    const price = resetPriceFor(pool, settings);
    if (!price) {
      throw AppError.badRequest('Limit resets need a plan', 'RESET_UNAVAILABLE');
    }
    return {
      kind: 'reset',
      packCode: null,
      credits: null,
      planCode: null,
      interval: null,
      amount: price,
      offerCode: null,
    };
  }
  if (packCode) {
    const settings = await getAiSettings();
    if (!isAiLive(settings)) {
      throw AppError.unavailable('AI credits are not on sale right now', 'AI_OFF');
    }
    const pack = findPack(settings, packCode);
    if (!pack) throw AppError.badRequest('Unknown credit pack', 'UNKNOWN_PACK');
    return {
      kind: 'credits',
      packCode: pack.code,
      credits: pack.credits,
      planCode: null,
      interval: null,
      amount: pack.price,
      offerCode: null,
    };
  }
  const { amount: listAmount, offerCode } = await quote(planCode, interval);
  const found = await discountFor({ pool, planCode, interval, amount: listAmount, couponCode });
  const discount = found && {
    kind: found.kind,
    code: found.code,
    amount: found.amount,
    label: found.label,
  };
  return {
    kind: 'plan',
    planCode,
    interval,
    packCode: null,
    credits: null,
    amount: listAmount - (discount?.amount ?? 0),
    listAmount,
    discount,
    offerCode,
  };
}

// Price, GST and who the invoice goes to, for something bought on this account.
async function priceFor(pool, selection) {
  const item = await itemFor(pool, selection);
  const { amount } = item;
  const [billedTo, settings] = await Promise.all([
    billedToSnapshot(pool.ownerId),
    getBillingSettings(),
  ]);
  const { taxableAmount, tax, total } = computeGst(amount, {
    rules: gstFrom(settings),
    buyer: billedTo,
  });
  return { item, billedTo, taxableAmount, tax, total };
}

function itemSummary(item) {
  return {
    kind: item.kind,
    planCode: item.planCode,
    planName: item.kind === 'plan' ? planName(item.planCode) : null,
    interval: item.interval,
    packCode: item.packCode,
    credits: item.credits,
    offerCode: item.offerCode,
    listAmount: item.listAmount ?? null,
    discount: item.discount ?? null,
  };
}

// What checkout will charge, without creating an order.
export async function previewCheckout({ pool }, selection) {
  const { item, billedTo, taxableAmount, tax, total } = await priceFor(pool, selection);
  return {
    ...itemSummary(item),
    taxableAmount,
    tax,
    amount: total,
    billedTo,
    onlinePayment: isRazorpayEnabled(),
  };
}

export async function createCheckout({ pool, user }, selection) {
  if (!isRazorpayEnabled()) {
    throw AppError.unavailable('Online payments are not set up yet', 'PAYMENTS_DISABLED');
  }
  const { item, billedTo, taxableAmount, tax, total } = await priceFor(pool, selection);
  const { kind, planCode, interval, packCode, credits, offerCode, listAmount, discount } = item;
  const amountPaise = Math.round(total * 100);

  const id = new Types.ObjectId();
  const razorpayOrder = await createOrder({
    amountPaise,
    receipt: `fd_${id}`,
    notes: {
      workspaceId: String(pool._id),
      ...(kind === 'credits'
        ? { packCode, credits: String(credits) }
        : kind === 'reset'
          ? { product: 'ai-reset' }
          : { planCode, interval }),
      userId: String(user._id),
    },
  });

  const order = await CheckoutOrder.create({
    _id: id,
    workspaceId: pool._id,
    userId: user._id,
    kind,
    planCode,
    interval,
    packCode,
    credits,
    offerCode,
    listAmount: listAmount ?? null,
    discount: discount ?? null,
    taxableAmount,
    tax,
    amount: total,
    amountPaise,
    billedTo,
    razorpayOrderId: razorpayOrder.id,
  });
  return toCheckoutDto(order, user);
}

function isOrderExpired(order, now = new Date()) {
  // Orders saved before expiry existed fall back to createdAt.
  const expiresAt =
    order.expiresAt ?? new Date(new Date(order.createdAt).getTime() + CHECKOUT_ORDER_TTL_MS);
  return expiresAt <= now;
}

// Makes sure Razorpay really holds the money for this order before we hand out a plan.
async function capturedPaymentFor(order, paymentId, knownEntity) {
  let payment = knownEntity ?? (await fetchPayment(paymentId));
  if (
    payment.id !== paymentId ||
    payment.order_id !== order.razorpayOrderId ||
    payment.amount !== order.amountPaise ||
    payment.currency !== order.currency
  ) {
    logger.warn({ paymentId, orderId: order.razorpayOrderId }, 'Razorpay payment does not match');
    throw AppError.badRequest('This payment does not match the order', 'PAYMENT_MISMATCH');
  }
  if (payment.status === 'authorized' && isOrderExpired(order)) {
    // Not capturing it means Razorpay returns the money to the buyer by itself,
    // so an old order (perhaps at an offer price that has ended) can't be used.
    await markOrderFailed(order.razorpayOrderId, 'Order expired before payment');
    throw AppError.badRequest(
      'This checkout has expired and you have not been charged. Please start again.',
      'CHECKOUT_EXPIRED',
    );
  }
  if (payment.status === 'authorized') {
    try {
      payment = await capturePayment(paymentId, {
        amountPaise: order.amountPaise,
        currency: order.currency,
      });
    } catch (error) {
      // Auto-capture (or the other of checkout/webhook) may have got there
      // first; what matters is whether Razorpay now holds the money.
      payment = await fetchPayment(paymentId);
      if (payment.status !== 'captured') throw error;
    }
  }
  if (payment.status !== 'captured') {
    throw AppError.badRequest('The payment has not gone through yet', 'PAYMENT_NOT_CAPTURED');
  }
  return payment;
}

function isDuplicateKey(error) {
  return error?.code === 11000;
}

/** Records the payment and switches the plan on. Safe to call more than once. */
export async function fulfilOrder(order, paymentId, { paymentEntity } = {}) {
  if (order.status === 'paid' && order.paymentId) {
    return Payment.findById(order.paymentId).setOptions(ACROSS).lean();
  }
  const razorpayPayment = await capturedPaymentFor(order, paymentId, paymentEntity);
  const workspace = await Workspace.findById(order.workspaceId).lean();
  if (!workspace) throw AppError.notFound('Workspace not found');
  if (order.kind === 'credits' || order.kind === 'reset') {
    return fulfilCreditOrder(order, workspace, paymentId, razorpayPayment);
  }

  let payment;
  try {
    payment = await recordPaidPeriod(workspace, {
      amount: order.amount,
      taxableAmount: order.taxableAmount,
      tax: order.tax,
      billedTo: order.billedTo,
      planCode: order.planCode,
      interval: order.interval,
      method: 'razorpay',
      source: 'razorpay',
      reference: paymentId,
      offerCode: order.offerCode,
      listAmount: order.listAmount ?? null,
      discount: order.discount ?? null,
      paidAt: razorpayPayment.created_at ? new Date(razorpayPayment.created_at * 1000) : new Date(),
      razorpay: { orderId: order.razorpayOrderId, paymentId, method: razorpayPayment.method },
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    // Recorded already (checkout and webhook raced). Re-applying the plan is
    // harmless and covers a crash between saving the payment and applying it.
    payment = await Payment.findOne({ 'razorpay.paymentId': paymentId }).setOptions(ACROSS).lean();
    await applyPlan(workspace._id, {
      planCode: payment.planCode,
      interval: payment.interval,
      amount: payment.taxableAmount ?? payment.amount,
      periodEnd: payment.periodEnd,
    });
  }

  // Counted once per payment, however often this runs.
  await recordDiscountUse({ pool: workspace, paymentId: payment._id, discount: order.discount });
  await CheckoutOrder.updateOne(
    { _id: order._id, workspaceId: order.workspaceId },
    {
      $set: {
        status: 'paid',
        razorpayPaymentId: paymentId,
        paymentId: payment._id,
        paidAt: payment.paidAt,
        failureReason: null,
      },
    },
  );
  const sharing = await Workspace.find({
    $or: [{ _id: workspace._id }, { storagePoolId: workspace._id }],
  })
    .select('_id')
    .lean();
  await closeOpenUpgradeRequests(sharing.map((ws) => ws._id));
  await recordAudit({
    actorId: order.userId,
    action: 'payment.razorpay',
    workspaceId: workspace._id,
    details: {
      amount: order.amount,
      planCode: order.planCode,
      interval: order.interval,
      paymentId,
      // Captured automatically after the order expired: honoured, since the
      // money was taken, but flagged so an admin can review it.
      lateOrder: isOrderExpired(order, payment.paidAt ?? new Date()),
    },
  }).catch((error) => logger.error({ err: error }, 'Could not write audit entry'));
  return payment;
}

// A credit pack: record the payment (with an invoice), then add the credits.
// Both steps are idempotent, so checkout and the webhook may both get here.
async function fulfilCreditOrder(order, workspace, paymentId, razorpayPayment) {
  let payment;
  try {
    payment = await recordCreditPurchase(workspace, {
      kind: order.kind,
      amount: order.amount,
      taxableAmount: order.taxableAmount,
      tax: order.tax,
      billedTo: order.billedTo,
      credits: order.credits,
      method: 'razorpay',
      source: 'razorpay',
      reference: paymentId,
      paidAt: razorpayPayment.created_at ? new Date(razorpayPayment.created_at * 1000) : new Date(),
      razorpay: { orderId: order.razorpayOrderId, paymentId, method: razorpayPayment.method },
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    payment = await Payment.findOne({ 'razorpay.paymentId': paymentId }).setOptions(ACROSS).lean();
  }
  if (order.kind === 'reset') {
    // Once per payment: the ledger row is unique per payment and kind.
    const first = await CreditLedger.create({
      workspaceId: workspace._id,
      kind: 'reset',
      credits: 0,
      userId: order.userId,
      paymentId: payment._id,
      note: 'Usage limits reset',
    }).catch((error) => {
      if (isDuplicateKey(error)) return null;
      throw error;
    });
    if (first) await resetUsageWindows(workspace._id);
  } else {
    // Counted once per payment, however often this runs.
    await addCredits(workspace._id, payment.credits ?? order.credits, {
      kind: 'purchase',
      userId: order.userId,
      paymentId: payment._id,
      note: `Bought ${order.credits} credits`,
    });
  }
  await CheckoutOrder.updateOne(
    { _id: order._id, workspaceId: order.workspaceId },
    {
      $set: {
        status: 'paid',
        razorpayPaymentId: paymentId,
        paymentId: payment._id,
        paidAt: payment.paidAt,
        failureReason: null,
      },
    },
  );
  await recordAudit({
    actorId: order.userId,
    action: order.kind === 'reset' ? 'payment.razorpay_ai_reset' : 'payment.razorpay_credits',
    workspaceId: workspace._id,
    details: { amount: order.amount, credits: order.credits, packCode: order.packCode, paymentId },
  }).catch((error) => logger.error({ err: error }, 'Could not write audit entry'));
  return payment;
}

/**
 * A refund made in the Razorpay dashboard (or a lost dispute). Always re-reads
 * the payment from Razorpay rather than trusting the event's copy.
 */
export async function handleRefund(razorpayPaymentId) {
  const payment = await Payment.findOne({ 'razorpay.paymentId': razorpayPaymentId })
    .setOptions(ACROSS)
    .lean();
  if (!payment) return;
  const live = await fetchPayment(razorpayPaymentId);
  const refundedPaise = Number(live.amount_refunded) || 0;
  if (refundedPaise <= 0) return;
  const fullyRefunded = live.status === 'refunded' || refundedPaise >= live.amount;

  const result = await revokeRefundedPayment(payment._id, { refundedPaise, fullyRefunded });
  if (!result) return;
  if (payment.kind === 'credits' && fullyRefunded) {
    // Takes back what is left of the refunded credits (never below zero).
    await addCredits(payment.workspaceId, -(payment.credits ?? 0), {
      kind: 'refund',
      paymentId: payment._id,
      note: 'Credit pack refunded',
    });
  }
  await recordAudit({
    actorId: null,
    action: fullyRefunded ? 'payment.refunded' : 'payment.partially_refunded',
    workspaceId: payment.workspaceId,
    details: { paymentId: razorpayPaymentId, refundedAmount: refundedPaise / 100 },
  }).catch((error) => logger.error({ err: error }, 'Could not write audit entry'));
}

export async function recordDispute(razorpayPaymentId, dispute) {
  const payment = await Payment.findOne({ 'razorpay.paymentId': razorpayPaymentId })
    .setOptions(ACROSS)
    .lean();
  if (!payment) return;
  logger.warn({ paymentId: razorpayPaymentId }, 'Razorpay payment disputed');
  await recordAudit({
    actorId: null,
    action: 'payment.disputed',
    workspaceId: payment.workspaceId,
    details: {
      paymentId: razorpayPaymentId,
      disputeId: dispute?.id ?? null,
      amount: (Number(dispute?.amount) || 0) / 100,
      reason: dispute?.reason_code ?? null,
    },
  }).catch((error) => logger.error({ err: error }, 'Could not write audit entry'));
}

export async function confirmCheckout({ pool }, { orderId, paymentId, signature }) {
  if (!isCheckoutSignatureValid({ orderId, paymentId, signature })) {
    throw AppError.badRequest('The payment could not be verified', 'PAYMENT_SIGNATURE_INVALID');
  }
  const order = await CheckoutOrder.findOne({
    workspaceId: pool._id,
    razorpayOrderId: orderId,
  }).lean();
  if (!order) throw AppError.notFound('Order not found');
  const payment = await fulfilOrder(order, paymentId);
  return {
    paid: true,
    kind: payment.kind ?? 'plan',
    paymentId: String(payment._id),
    planCode: payment.planCode,
    periodEnd: payment.periodEnd,
    credits: payment.credits ?? null,
  };
}

export function findOrderByRazorpayId(orderId) {
  return CheckoutOrder.findOne({ razorpayOrderId: orderId }).setOptions(ACROSS).lean();
}

export async function markOrderFailed(orderId, reason) {
  await CheckoutOrder.updateOne(
    { razorpayOrderId: orderId, status: 'created' },
    { $set: { status: 'failed', failureReason: reason?.slice(0, 300) ?? null } },
  ).setOptions(ACROSS);
}
