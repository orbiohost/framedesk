import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getAccountBilling, getInvoice } from '../billing/accountBilling.service.js';
import { invoiceFileName, renderInvoicePdf } from '../billing/invoicePdf.js';
import * as avatarsService from './avatars.service.js';
import * as usersService from './users.service.js';

export function getMe(req, res) {
  sendSuccess(res, { user: usersService.toPublicUser(req.user) });
}

export const updateMe = asyncHandler(async (req, res) => {
  const user = await usersService.updateProfile(req.user._id, req.body);
  sendSuccess(res, { user: usersService.toPublicUser(user) });
});

export const setAvatar = asyncHandler(async (req, res) => {
  const user = await avatarsService.setAvatar(req.user._id, req.body.image);
  sendSuccess(res, { user: usersService.toPublicUser(user) });
});

export const clearAvatar = asyncHandler(async (req, res) => {
  const user = await avatarsService.clearAvatar(req.user._id);
  sendSuccess(res, { user: usersService.toPublicUser(user) });
});

export const changePassword = asyncHandler(async (req, res) => {
  await usersService.changePassword(req.user._id, req.body, req.sessionId);
  sendSuccess(res, { changed: true });
});

export const updateBillingProfile = asyncHandler(async (req, res) => {
  const user = await usersService.updateBillingProfile(req.user._id, req.body);
  sendSuccess(res, { user: usersService.toPublicUser(user) });
});

export const getBilling = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  sendSuccess(res, await getAccountBilling(req.user));
});

export const downloadInvoice = asyncHandler(async (req, res) => {
  const invoice = await getInvoice(req.user, req.params.paymentId);
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${disposition}; filename="${invoiceFileName(invoice.payment)}"`,
    'Cache-Control': 'private, no-store',
  });
  res.send(renderInvoicePdf(invoice));
});
