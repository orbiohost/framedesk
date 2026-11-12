import { z } from 'zod';
import { objectId, optionalObjectId } from '../../utils/zodHelpers.js';
import { TICKET_STATUSES, TICKET_TYPES } from './supportTicket.model.js';

export const createTicketSchema = z.object({
  type: z.enum(TICKET_TYPES),
  subject: z.string().trim().min(3, 'Add a short subject').max(140),
  message: z.string().trim().min(10, 'Tell us a little more (10 characters or more)').max(5000),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  workspaceId: optionalObjectId,
  pageUrl: z.string().trim().max(500).nullable().optional(),
});

export const ticketIdParam = z.object({ ticketId: objectId });

export const adminTicketsQuerySchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  type: z.enum(TICKET_TYPES).optional(),
});

export const adminUpdateTicketSchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    reply: z.string().trim().min(1).max(5000).optional(),
  })
  .refine((body) => body.status || body.reply, { message: 'Nothing to update' });
