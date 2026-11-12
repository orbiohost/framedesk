import mongoose, { Schema } from 'mongoose';

export const TICKET_TYPES = ['question', 'bug', 'feature', 'feedback'];
export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

// A message from a user to the FrameDesk team: a question, a bug report, a
// feature request or general feedback. Tickets belong to the person who sent
// them (not to a workspace), so they are only ever read by that person and by
// platform admins. The workspace is kept as context for the team.
const supportTicketSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    type: { type: String, enum: TICKET_TYPES, required: true },
    subject: { type: String, required: true, trim: true, maxlength: 140 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    // 1-5, feedback only.
    rating: { type: Number, min: 1, max: 5, default: null },
    // Where they were and what they used, to help reproduce bugs.
    pageUrl: { type: String, default: null, maxlength: 500 },
    userAgent: { type: String, default: null, maxlength: 400 },
    status: { type: String, enum: TICKET_STATUSES, default: 'open' },
    reply: { type: String, default: null, maxlength: 5000 },
    repliedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    repliedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

supportTicketSchema.index({ userId: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });

export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
