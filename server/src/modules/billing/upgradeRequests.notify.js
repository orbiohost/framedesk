import { env } from '../../config/env.js';
import { APP_NAME } from '../../config/constants.js';
import { deliverEmailInBackground } from '../../utils/mailer.js';
import { User } from '../users/user.model.js';
import { Workspace } from '../workspaces/workspace.model.js';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

// Tells the people who activate plans that a workspace is waiting for a payment link.
export async function notifyAdminsOfUpgradeRequest(workspaceId, request, requester) {
  const [admins, workspace] = await Promise.all([
    User.find({ isSuperadmin: true, status: 'active' }).select('email').lean(),
    Workspace.findById(workspaceId).select('name').lean(),
  ]);

  for (const admin of admins) {
    deliverEmailInBackground({
      to: admin.email,
      subject: `${APP_NAME}: ${workspace.name} wants ${request.planCode} (${request.interval})`,
      text: [
        `${requester.name} (${requester.email}) asked to upgrade "${workspace.name}".`,
        '',
        `Plan: ${request.planCode}, billed ${request.interval}`,
        `Amount to collect: ${inr.format(request.quotedAmount)}${request.offerCode ? ` (${request.offerCode})` : ''}`,
        '',
        `Send them a payment link, then activate the plan here: ${env.CLIENT_URL}/admin/upgrade-requests`,
      ].join('\n'),
    });
  }
}
