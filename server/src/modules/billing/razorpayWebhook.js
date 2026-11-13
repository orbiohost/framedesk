import express, { Router } from 'express';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import {
  findOrderByRazorpayId,
  fulfilOrder,
  handleRefund,
  markOrderFailed,
  recordDispute,
} from './checkout.service.js';
import { isWebhookSignatureValid } from './razorpay.client.js';

// POST /api/billing/razorpay/webhook. Mounted before express.json(): the
// signature covers the exact bytes Razorpay sent. No session and no CSRF token;
// the HMAC signature is the authentication.
export const razorpayWebhookRouter = Router();

const FULFIL_EVENTS = new Set(['payment.authorized', 'payment.captured', 'order.paid']);
const REFUND_EVENTS = new Set(['refund.processed', 'payment.refunded']);
const DISPUTE_EVENTS = new Set(['payment.dispute.created', 'payment.dispute.lost']);

async function handleEvent(event) {
  const payment = event.payload?.payment?.entity;

  if (REFUND_EVENTS.has(event.event)) {
    const paymentId = event.payload?.refund?.entity?.payment_id ?? payment?.id;
    if (paymentId) await handleRefund(paymentId);
    return;
  }
  if (DISPUTE_EVENTS.has(event.event)) {
    const dispute = event.payload?.dispute?.entity;
    const paymentId = dispute?.payment_id ?? payment?.id;
    if (paymentId) await recordDispute(paymentId, dispute);
    return;
  }

  if (!payment?.order_id) return;
  const order = await findOrderByRazorpayId(payment.order_id);
  // Orders this app didn't create (e.g. other products on the same account).
  if (!order) return;

  if (FULFIL_EVENTS.has(event.event)) {
    await fulfilOrder(order, payment.id, { paymentEntity: payment });
  } else if (event.event === 'payment.failed') {
    await markOrderFailed(payment.order_id, payment.error_description);
  }
}

razorpayWebhookRouter.post(
  '/razorpay/webhook',
  express.raw({ type: 'application/json', limit: '256kb' }),
  async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!isWebhookSignatureValid(rawBody, req.get('x-razorpay-signature'))) {
      logger.warn({ ip: req.ip }, 'Razorpay webhook with a bad signature rejected');
      return res.status(400).json({ success: false });
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ success: false });
    }

    try {
      await handleEvent(event);
      res.json({ success: true });
    } catch (error) {
      // A permanent problem (payment doesn't match, order expired): retrying
      // can't fix it, so acknowledge it rather than have Razorpay resend forever.
      if (error instanceof AppError && error.statusCode < 500) {
        logger.warn({ code: error.code, event: event.event }, 'Razorpay webhook not applied');
        return res.json({ success: true });
      }
      // A non-2xx answer makes Razorpay retry the webhook later.
      logger.error({ err: error, event: event.event }, 'Razorpay webhook failed');
      res.status(500).json({ success: false });
    }
  },
);
