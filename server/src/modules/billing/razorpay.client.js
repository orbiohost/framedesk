import { createHmac } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { safeEqual } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

// The few Razorpay REST calls checkout needs, over fetch with basic auth.
// Docs: https://razorpay.com/docs/api/orders/ and /payments/

const API_BASE = 'https://api.razorpay.com/v1';
const TIMEOUT_MS = 15_000;

export function isRazorpayEnabled() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export function razorpayKeyId() {
  return env.RAZORPAY_KEY_ID;
}

async function call(path, { method = 'GET', body } = {}) {
  if (!isRazorpayEnabled()) throw AppError.unavailable('Online payments are not set up');
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    logger.error({ err: error, path }, 'Razorpay request failed');
    throw AppError.unavailable('Could not reach the payment provider. Please try again.');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    logger.error({ status: response.status, path, error: payload?.error }, 'Razorpay error');
    throw new AppError(
      502,
      'PAYMENT_PROVIDER_ERROR',
      payload?.error?.description ?? 'The payment provider returned an error',
    );
  }
  return payload;
}

// amount is in paise. notes: up to 15 string pairs, shown in the Razorpay dashboard.
export function createOrder({ amountPaise, currency = 'INR', receipt, notes }) {
  return call('/orders', {
    method: 'POST',
    body: { amount: amountPaise, currency, receipt, notes },
  });
}

export function fetchPayment(paymentId) {
  return call(`/payments/${encodeURIComponent(paymentId)}`);
}

// Accounts set to manual capture leave payments "authorized"; capture them here.
export function capturePayment(paymentId, { amountPaise, currency = 'INR' }) {
  return call(`/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: 'POST',
    body: { amount: amountPaise, currency },
  });
}

function hmac(secret, payload) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

// Checkout's handler returns this signature; only our key secret can produce it.
export function isCheckoutSignatureValid({ orderId, paymentId, signature }) {
  if (!isRazorpayEnabled() || !signature) return false;
  return safeEqual(hmac(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
}

// Webhooks are signed over the raw request body with the webhook secret.
export function isWebhookSignatureValid(rawBody, signature) {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  return safeEqual(hmac(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
}
