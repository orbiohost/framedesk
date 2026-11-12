import { env } from '../../config/env.js';
import { APP_NAME } from '../../config/constants.js';
import { deliverEmailInBackground } from '../../utils/mailer.js';
import { User } from '../users/user.model.js';

export const TICKET_TYPE_LABELS = {
  question: 'Question',
  bug: 'Bug report',
  feature: 'Feature request',
  feedback: 'Feedback',
};

// Tells the platform admins a new ticket came in.
export async function notifyAdminsOfTicket(ticket, user, workspaceName) {
  const admins = await User.find({ isSuperadmin: true, status: 'active' }).select('email').lean();
  const label = TICKET_TYPE_LABELS[ticket.type];
  for (const admin of admins) {
    deliverEmailInBackground({
      to: admin.email,
      replyTo: user.email,
      subject: `${APP_NAME} support · ${label}: ${ticket.subject}`,
      text: [
        `${user.name} (${user.email})${workspaceName ? ` in "${workspaceName}"` : ''} sent a ${label.toLowerCase()}.`,
        ticket.rating
          ? `Rating: ${'★'.repeat(ticket.rating)}${'☆'.repeat(5 - ticket.rating)}`
          : null,
        '',
        ticket.message,
        '',
        `Reply from the admin area: ${env.CLIENT_URL}/admin/support`,
      ]
        .filter((line) => line !== null)
        .join('\n'),
    });
  }
}

// Sends the team's answer to the person who opened the ticket.
export function notifyUserOfReply(ticket) {
  if (!ticket.user?.email) return;
  deliverEmailInBackground({
    to: ticket.user.email,
    subject: `Re: ${ticket.subject}`,
    text: [
      `Hi ${ticket.user.name},`,
      '',
      `The ${APP_NAME} team replied to your ${TICKET_TYPE_LABELS[ticket.type].toLowerCase()}:`,
      '',
      ticket.reply,
      '',
      '---',
      `You wrote: ${ticket.message.length > 600 ? `${ticket.message.slice(0, 600)}…` : ticket.message}`,
      '',
      `See all your requests: ${env.CLIENT_URL}/app`,
    ].join('\n'),
  });
}
