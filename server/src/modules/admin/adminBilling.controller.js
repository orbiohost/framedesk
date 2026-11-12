import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { listPayments, paymentsCsv } from './adminPayments.service.js';
import * as subscriptions from './adminSubscriptions.service.js';

const UTF8_BOM = String.fromCharCode(0xfeff);

export const listSubscriptions = asyncHandler(async (req, res) => {
  sendSuccess(res, { subscriptions: await subscriptions.listSubscriptions(req.query) });
});

export const adjustSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptions.adjustSubscription(
    req.params.workspaceId,
    req.user._id,
    req.body,
  );
  sendSuccess(res, { subscription });
});

export const recordPayment = asyncHandler(async (req, res) => {
  await subscriptions.recordPayment(req.params.workspaceId, req.user._id, req.body);
  sendSuccess(res, { recorded: true }, { status: 201 });
});

export const payments = asyncHandler(async (req, res) => {
  sendSuccess(res, await listPayments(req.query));
});

export const paymentsExport = asyncHandler(async (req, res) => {
  const csv = await paymentsCsv(req.query);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="framedesk-sales-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
  // The BOM makes Excel read the rupee sign and Indian names correctly.
  res.send(`${UTF8_BOM}${csv}`);
});
