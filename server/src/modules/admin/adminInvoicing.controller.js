import { env } from '../../config/env.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  getBillingSettings,
  gstFrom,
  previewInvoiceNumber,
  sellerFrom,
  updateBillingSettings,
} from '../billing/billingSettings.service.js';
import { computeGst } from '../billing/gst.js';
import { renderInvoicePdf } from '../billing/invoicePdf.js';
import { isRazorpayEnabled } from '../billing/razorpay.client.js';
import { recordAudit } from './auditLog.service.js';

// Keys stay in the server's .env (secrets don't belong in a web form);
// the admin page only shows whether they're set and in which mode.
function razorpayStatus() {
  const keyId = env.RAZORPAY_KEY_ID ?? '';
  return {
    configured: isRazorpayEnabled(),
    mode: keyId.startsWith('rzp_live_') ? 'live' : keyId ? 'test' : null,
    keyIdHint: keyId ? `${keyId.slice(0, 9)}…${keyId.slice(-4)}` : null,
    webhookConfigured: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
    webhookUrl: `${env.CLIENT_URL.replace(/\/$/, '')}/api/billing/razorpay/webhook`,
  };
}

async function settingsPayload(settings) {
  return {
    settings,
    nextInvoiceNumber: await previewInvoiceNumber(settings.invoicePrefix),
    razorpay: razorpayStatus(),
  };
}

export const getSettings = asyncHandler(async (req, res) => {
  sendSuccess(res, await settingsPayload(await getBillingSettings()));
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await updateBillingSettings(req.body, req.user._id);
  await recordAudit({
    actorId: req.user._id,
    action: 'billing.settings_update',
    details: req.body,
  });
  sendSuccess(res, await settingsPayload(settings));
});

// A made-up invoice using the saved settings, to check how real ones will look.
export const samplePdf = asyncHandler(async (req, res) => {
  const settings = await getBillingSettings();
  const buyer = {
    name: 'Sample Customer',
    email: 'customer@example.com',
    companyName: 'Sample Films Pvt Ltd',
    addressLine: '221 Example Street',
    city: settings.city || 'Mumbai',
    state: settings.state || 'Maharashtra',
    postalCode: '400001',
    country: 'India',
  };
  const { taxableAmount, tax, total } = computeGst(999, { rules: gstFrom(settings), buyer });
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const pdf = renderInvoicePdf({
    payment: {
      invoiceNumber: await previewInvoiceNumber(settings.invoicePrefix),
      workspaceName: 'Sample Studio',
      planName: 'Studio',
      interval: 'monthly',
      amount: total,
      taxableAmount,
      tax,
      currency: 'INR',
      method: 'razorpay',
      razorpayMethod: 'upi',
      reference: 'pay_SAMPLE0000',
      offerCode: null,
      paidAt: now,
      periodStart: now,
      periodEnd,
    },
    seller: sellerFrom(settings),
    billedTo: buyer,
  });
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'inline; filename="sample-invoice.pdf"',
    'Cache-Control': 'no-store',
  });
  res.send(pdf);
});
