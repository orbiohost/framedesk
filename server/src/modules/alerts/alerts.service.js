import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { Membership } from '../members/membership.model.js';
import { ADMIN_ROLES } from '../members/roles.js';
import { pushToUser } from '../notifications/push.service.js';
import { Project } from '../projects/project.model.js';
import { User } from '../users/user.model.js';
import { ALERT_LIFETIME_MS, MAX_ALERT_RECIPIENTS, ProjectAlert } from './alert.model.js';
import {
  alertSettingsOf,
  effectiveSettings,
  inQuietHours,
  quietHoursEnd,
} from './alertSettings.js';

// Project alerts: ring teammates' phones and computers about a project until
// they open it. The first push goes out at once; alertWorker.js repeats it.

const SAME_ALERT_COOLDOWN_MS = 30 * 1000;
const MINUTE = 60 * 1000;

const VIBRATE = [400, 200, 400, 200, 800];

function projectUrl(alert) {
  return `${env.CLIENT_URL}/w/${alert.workspaceId}/projects/${alert.projectId}?alert=${alert._id}`;
}

function payloadFor(alert, settings, { quiet, repeat }) {
  const from = alert.senderName || 'A teammate';
  return {
    kind: 'project-alert',
    alertId: String(alert._id),
    title: `${repeat ? '🔔 Reminder: ' : '🔔 '}${alert.projectTitle}`,
    body: alert.message
      ? `${from}: ${alert.message}`
      : `${from} needs you on this project. Tap to open it.`,
    url: projectUrl(alert),
    // Repeats replace the earlier notification and buzz again.
    tag: `alert-${alert._id}`,
    requireInteraction: true,
    silent: quiet,
    vibrate: settings.vibrate && !quiet ? VIBRATE : [],
  };
}

// Sends one push to one recipient and schedules the next repeat.
async function ring(alert, recipient, user) {
  const settings = effectiveSettings(user, alert);
  const timeZone = user.notificationPrefs?.timeZone ?? 'Asia/Kolkata';
  const now = new Date();
  const quiet = inQuietHours(settings, timeZone, now);
  const sends = (recipient.sends ?? 0) + 1;
  const delivered = await pushToUser(
    user._id,
    payloadFor(alert, settings, { quiet, repeat: sends > 1 }),
  ).catch((err) => {
    logger.warn({ err: err.message }, 'Project alert push failed');
    return 0;
  });
  // maxRepeats 0: keep going until the project is opened (within the lifetime).
  // A test rings once.
  const done = alert.test || (settings.maxRepeats > 0 && sends > settings.maxRepeats);
  const expiresAt = alert.createdAt.getTime() + ALERT_LIFETIME_MS;
  let nextAt = done ? null : new Date(now.getTime() + settings.repeatMinutes * MINUTE);
  if (nextAt && quiet) nextAt = quietHoursEnd(settings, timeZone, now);
  if (nextAt && nextAt.getTime() > expiresAt) nextAt = null;
  await ProjectAlert.updateOne(
    { _id: alert._id, workspaceId: alert.workspaceId },
    {
      $set: {
        'recipients.$[me].sends': sends,
        'recipients.$[me].lastSentAt': now,
        'recipients.$[me].nextAt': nextAt,
        'recipients.$[me].delivered': delivered,
      },
    },
    { arrayFilters: [{ 'me.userId': user._id, 'me.status': 'ringing' }] },
  );
  return delivered;
}

/**
 * Rings people about a project. userIds: who (empty: every active member
 * except the sender); test: only the sender, to try their own settings.
 */
export async function sendAlert(
  { workspace, user, membership },
  { projectId, userIds, message, test, ring: ringOverride },
) {
  const project = await Project.findOne({ _id: projectId, workspaceId: workspace._id })
    .select('title')
    .lean();
  if (!project) throw AppError.notFound('Project not found', 'PROJECT_NOT_FOUND');

  const recent = await ProjectAlert.exists({
    workspaceId: workspace._id,
    projectId,
    senderId: user._id,
    createdAt: { $gt: new Date(Date.now() - SAME_ALERT_COOLDOWN_MS) },
  });
  if (recent && !test) {
    throw AppError.tooManyRequests('You just sent an alert for this project. Wait a few seconds.');
  }

  let targetIds;
  if (test) {
    targetIds = [String(user._id)];
  } else {
    const members = await Membership.find({ workspaceId: workspace._id, status: 'active' })
      .select('userId role')
      .lean();
    const others = members
      .map((member) => String(member.userId))
      .filter((id) => id !== String(user._id));
    if (userIds?.length) {
      const memberIds = new Set(others);
      const wanted = [...new Set(userIds.map(String))].filter((id) => id !== String(user._id));
      if (wanted.some((id) => !memberIds.has(id))) {
        throw AppError.badRequest('Some of those people are not in this workspace', 'NOT_A_MEMBER');
      }
      targetIds = wanted;
    } else {
      targetIds = others;
    }
  }
  if (targetIds.length === 0) {
    throw AppError.badRequest(
      'There is nobody else in this workspace to alert yet',
      'NO_RECIPIENTS',
    );
  }
  targetIds = targetIds.slice(0, MAX_ALERT_RECIPIENTS);

  const users = await User.find({ _id: { $in: targetIds } })
    .select('name alertPrefs notificationPrefs')
    .lean();
  const senderIsAdmin = ADMIN_ROLES.includes(membership?.role);
  const recipients = users.map((target) => {
    const settings = alertSettingsOf(target);
    const blocked =
      !test && (!settings.enabled || (settings.allowFrom === 'admins' && !senderIsAdmin));
    return {
      userId: target._id,
      status: blocked ? 'blocked' : 'ringing',
      nextAt: null,
    };
  });

  const alert = (
    await ProjectAlert.create({
      workspaceId: workspace._id,
      projectId,
      projectTitle: project.title,
      senderId: user._id,
      senderName: user.name,
      message: message?.trim() ?? '',
      recipients,
      ring: ringOverride ?? {},
      test: Boolean(test),
    })
  ).toObject();

  const byId = new Map(users.map((target) => [String(target._id), target]));
  await Promise.all(
    alert.recipients
      .filter((recipient) => recipient.status === 'ringing')
      .map((recipient) => ring(alert, recipient, byId.get(String(recipient.userId)))),
  );
  return projectAlertDto(
    await ProjectAlert.findOne({ _id: alert._id, workspaceId: workspace._id }).lean(),
    await namesOf(alert),
  );
}

async function namesOf(alert) {
  const users = await User.find({ _id: { $in: alert.recipients.map((r) => r.userId) } })
    .select('name')
    .lean();
  return new Map(users.map((row) => [String(row._id), row.name]));
}

function projectAlertDto(alert, names) {
  return {
    id: String(alert._id),
    projectId: String(alert.projectId),
    sender: { id: String(alert.senderId), name: alert.senderName },
    message: alert.message,
    createdAt: alert.createdAt,
    recipients: alert.recipients.map((recipient) => ({
      userId: String(recipient.userId),
      name: names.get(String(recipient.userId)) ?? 'Former member',
      status: recipient.status,
      sends: recipient.sends,
      delivered: recipient.delivered,
      respondedAt: recipient.respondedAt,
    })),
  };
}

// The project's latest alerts, with who opened them.
export async function listProjectAlerts(workspaceId, projectId) {
  const alerts = await ProjectAlert.find({ workspaceId, projectId })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  const ids = [
    ...new Set(alerts.flatMap((alert) => alert.recipients.map((r) => String(r.userId)))),
  ];
  const users = await User.find({ _id: { $in: ids } })
    .select('name')
    .lean();
  const names = new Map(users.map((row) => [String(row._id), row.name]));
  return alerts.map((alert) => projectAlertDto(alert, names));
}

// This person's alerts in one workspace for the header's notifications list:
// ones sent to them (ringing or answered) and replies to ones they sent,
// from the last three days.
export async function alertInbox(workspaceId, userId) {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const alerts = await ProjectAlert.find({
    workspaceId,
    createdAt: { $gt: since },
    test: { $ne: true },
    $or: [{ 'recipients.userId': userId }, { senderId: userId }],
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  const names = await namesOf({ recipients: alerts.flatMap((alert) => alert.recipients) });
  return alerts.map((alert) => {
    const mine = alert.recipients.find((r) => String(r.userId) === String(userId));
    const sentByMe = String(alert.senderId) === String(userId);
    return {
      id: String(alert._id),
      projectId: String(alert.projectId),
      projectTitle: alert.projectTitle,
      sender: alert.senderName,
      message: alert.message,
      createdAt: alert.createdAt,
      // received: my status; sent: how the people I alerted answered.
      kind: sentByMe && !mine ? 'sent' : 'received',
      status: mine?.status ?? null,
      opened: alert.recipients
        .filter((r) => r.status === 'opened')
        .map((r) => names.get(String(r.userId)) ?? 'Someone'),
      waiting: alert.recipients.filter((r) => r.status === 'ringing').length,
    };
  });
}

// Alerts ringing for this person, in every workspace (the app's popup).
export async function activeAlertsFor(user) {
  const since = new Date(Date.now() - ALERT_LIFETIME_MS);
  const alerts = await ProjectAlert.find({
    recipients: { $elemMatch: { userId: user._id, status: 'ringing' } },
    createdAt: { $gt: since },
  })
    .setOptions({ crossWorkspace: true })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  const settings = alertSettingsOf(user);
  const timeZone = user.notificationPrefs?.timeZone ?? 'Asia/Kolkata';
  return {
    settings,
    quiet: inQuietHours(settings, timeZone),
    alerts: alerts.map((alert) => {
      const mine = alert.recipients.find((r) => String(r.userId) === String(user._id));
      return {
        id: String(alert._id),
        workspaceId: String(alert.workspaceId),
        projectId: String(alert.projectId),
        projectTitle: alert.projectTitle,
        sender: alert.senderName,
        message: alert.message,
        createdAt: alert.createdAt,
        // Changes with every repeat: the app rings again when it does.
        sends: mine?.sends ?? 0,
        // How long the app rings for this alert (the sender may have set it).
        ringSeconds: alert.ring?.ringSeconds ?? settings.ringSeconds,
        lastSentAt: mine?.lastSentAt ?? alert.createdAt,
      };
    }),
  };
}

// "Open project" or "Dismiss" on the popup: stops the ringing for this person.
export async function respondToAlert(user, alertId, action) {
  const alert = await ProjectAlert.findOne({ _id: alertId, 'recipients.userId': user._id })
    .setOptions({ crossWorkspace: true })
    .select('workspaceId')
    .lean();
  if (!alert) throw AppError.notFound('Alert not found', 'ALERT_NOT_FOUND');
  await stopRinging({ _id: alert._id, workspaceId: alert.workspaceId }, user._id, action);
}

// Opening the project answers every alert about it.
export async function openedProject(workspaceId, projectId, userId) {
  const result = await ProjectAlert.updateMany(
    { workspaceId, projectId, recipients: { $elemMatch: { userId, status: 'ringing' } } },
    {
      $set: {
        'recipients.$[me].status': 'opened',
        'recipients.$[me].respondedAt': new Date(),
        'recipients.$[me].nextAt': null,
      },
    },
    { arrayFilters: [{ 'me.userId': userId, 'me.status': 'ringing' }] },
  );
  return result.modifiedCount;
}

async function stopRinging(filter, userId, status) {
  await ProjectAlert.updateOne(
    filter,
    {
      $set: {
        'recipients.$[me].status': status,
        'recipients.$[me].respondedAt': new Date(),
        'recipients.$[me].nextAt': null,
      },
    },
    { arrayFilters: [{ 'me.userId': userId, 'me.status': 'ringing' }] },
  );
}

// --- Worker ------------------------------------------------------------------

// One pass: sends the repeats that are due and retires alerts past their lifetime.
export async function sweepAlerts() {
  const now = new Date();
  const expiredBefore = new Date(now.getTime() - ALERT_LIFETIME_MS);
  await ProjectAlert.updateMany(
    { createdAt: { $lte: expiredBefore }, 'recipients.status': 'ringing' },
    { $set: { 'recipients.$[ringing].status': 'expired', 'recipients.$[ringing].nextAt': null } },
    { arrayFilters: [{ 'ringing.status': 'ringing' }] },
  ).setOptions({ crossWorkspace: true });

  const due = await ProjectAlert.find({
    recipients: { $elemMatch: { status: 'ringing', nextAt: { $ne: null, $lte: now } } },
  })
    .setOptions({ crossWorkspace: true })
    .limit(200)
    .lean();
  let sent = 0;
  for (const alert of due) {
    for (const recipient of alert.recipients) {
      if (recipient.status !== 'ringing' || !recipient.nextAt || recipient.nextAt > now) continue;
      // Claim this repeat so a second API process doesn't send it too.
      const claimed = await ProjectAlert.updateOne(
        { _id: alert._id, workspaceId: alert.workspaceId },
        { $set: { 'recipients.$[me].nextAt': new Date(now.getTime() + 10 * MINUTE) } },
        {
          arrayFilters: [
            { 'me.userId': recipient.userId, 'me.status': 'ringing', 'me.nextAt': { $lte: now } },
          ],
        },
      );
      if (claimed.modifiedCount === 0) continue;
      const user = await User.findById(recipient.userId)
        .select('name alertPrefs notificationPrefs')
        .lean();
      if (!user) continue;
      const settings = alertSettingsOf(user);
      if (!settings.enabled) {
        await stopRinging({ _id: alert._id, workspaceId: alert.workspaceId }, user._id, 'blocked');
        continue;
      }
      await ring(alert, recipient, user);
      sent += 1;
    }
  }
  return sent;
}
