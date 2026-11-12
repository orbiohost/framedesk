import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Workspace } from '../workspaces/workspace.model.js';
import { notifyAdminsOfTicket, notifyUserOfReply } from './support.notify.js';
import * as support from './support.service.js';

export const listMine = asyncHandler(async (req, res) => {
  const tickets = await support.listMyTickets(req.user._id);
  sendSuccess(res, { tickets });
});

export const create = asyncHandler(async (req, res) => {
  const ticket = await support.createTicket(req.user, req.body, {
    userAgent: req.get('user-agent'),
  });
  const workspace = req.body.workspaceId
    ? await Workspace.findById(req.body.workspaceId).select('name').lean()
    : null;
  // Mail goes out in the background; a mail problem never loses the ticket.
  notifyAdminsOfTicket(ticket, req.user, workspace?.name).catch(() => {});
  sendSuccess(res, { ticket }, { status: 201 });
});

export const adminList = asyncHandler(async (req, res) => {
  const tickets = await support.listAllTickets(req.query);
  sendSuccess(res, { tickets });
});

export const adminUpdate = asyncHandler(async (req, res) => {
  const ticket = await support.updateTicket(req.params.ticketId, req.user._id, req.body);
  if (req.body.reply) notifyUserOfReply(ticket);
  sendSuccess(res, { ticket });
});
