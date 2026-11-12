import { AppError } from '../../utils/AppError.js';
import { Membership } from '../members/membership.model.js';
import { SupportTicket } from './supportTicket.model.js';

const MAX_LIST = 200;

function toTicketDto(ticket) {
  return {
    id: String(ticket._id),
    type: ticket.type,
    subject: ticket.subject,
    message: ticket.message,
    rating: ticket.rating,
    status: ticket.status,
    reply: ticket.reply,
    repliedAt: ticket.repliedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function toAdminTicketDto(ticket) {
  return {
    ...toTicketDto(ticket),
    user: ticket.userId
      ? { id: String(ticket.userId._id), name: ticket.userId.name, email: ticket.userId.email }
      : null,
    workspace: ticket.workspaceId
      ? { id: String(ticket.workspaceId._id), name: ticket.workspaceId.name }
      : null,
    pageUrl: ticket.pageUrl,
    userAgent: ticket.userAgent,
  };
}

export async function listMyTickets(userId) {
  const tickets = await SupportTicket.find({ userId })
    .sort({ createdAt: -1 })
    .limit(MAX_LIST)
    .lean();
  return tickets.map(toTicketDto);
}

export async function createTicket(user, input, { userAgent }) {
  // Only link a workspace the person actually belongs to.
  let workspaceId = null;
  if (input.workspaceId) {
    const member = await Membership.exists({
      workspaceId: input.workspaceId,
      userId: user._id,
      status: 'active',
    });
    if (member) workspaceId = input.workspaceId;
  }
  const ticket = await SupportTicket.create({
    userId: user._id,
    workspaceId,
    type: input.type,
    subject: input.subject,
    message: input.message,
    rating: input.type === 'feedback' ? (input.rating ?? null) : null,
    pageUrl: input.pageUrl ?? null,
    userAgent: userAgent ? userAgent.slice(0, 400) : null,
  });
  return toTicketDto(ticket);
}

// ---- Admin ----

export async function listAllTickets({ status, type } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  const tickets = await SupportTicket.find(filter)
    .sort({ createdAt: -1 })
    .limit(MAX_LIST)
    .populate('userId', 'name email')
    .populate('workspaceId', 'name')
    .lean();
  return tickets.map(toAdminTicketDto);
}

// Returns the updated ticket, plus the reply text when a new reply was sent
// (so the caller can email it to the person).
export async function updateTicket(ticketId, adminId, { status, reply }) {
  const $set = {};
  if (status) $set.status = status;
  if (reply) {
    Object.assign($set, { reply, repliedBy: adminId, repliedAt: new Date() });
    // Answering a fresh ticket moves it along unless a status was chosen.
    if (!status) $set.status = 'resolved';
  }
  const ticket = await SupportTicket.findByIdAndUpdate(ticketId, { $set }, { new: true })
    .populate('userId', 'name email')
    .populate('workspaceId', 'name')
    .lean();
  if (!ticket) throw AppError.notFound('Ticket not found');
  return toAdminTicketDto(ticket);
}

export function countOpenTickets() {
  return SupportTicket.countDocuments({ status: 'open' });
}
