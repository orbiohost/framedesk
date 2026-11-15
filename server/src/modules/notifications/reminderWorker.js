import { APP_NAME } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { deliverEmailInBackground } from '../../utils/mailer.js';
import { Event } from '../calendar/event.model.js';
import { Membership } from '../members/membership.model.js';
import { Project } from '../projects/project.model.js';
import { Task } from '../tasks/task.model.js';
import { User } from '../users/user.model.js';
import { SentReminder } from './notification.models.js';
import { pushToUser } from './push.service.js';
import { anchorFor, fireTimes, MAX_LEAD_MINUTES, reminderOffsetsFor } from './reminderRules.js';

// Once a minute: every reminder whose moment has come (within the last few
// minutes, to ride out a restart) goes to the people concerned, on their
// devices and/or by email, once.

const TICK_MS = 60 * 1000;
const FIRST_TICK_AFTER_MS = 20 * 1000;
const CATCH_UP_MS = 10 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const OPEN_PROJECT_STATUSES = ['draft', 'active', 'pending', 'review'];

let timer = null;
let firstRun = null;
let running = false;

function scanRange(now) {
  return {
    $gte: new Date(now.getTime() - 2 * DAY_MS),
    $lte: new Date(now.getTime() + MAX_LEAD_MINUTES * MINUTE_MS + 2 * DAY_MS),
  };
}

const cross = { crossWorkspace: true };

async function loadCandidates(now) {
  const range = scanRange(now);
  const [events, tasks, projects] = await Promise.all([
    Event.find({ startsAt: range })
      .setOptions(cross)
      .select('workspaceId title type startsAt allDay location assigneeIds createdBy reminders')
      .lean(),
    Task.find({ dueDate: range, status: { $ne: 'done' } })
      .setOptions(cross)
      .select('workspaceId title dueDate assigneeId createdBy reminders projectId')
      .lean(),
    Project.find({ dueDate: range, status: { $in: OPEN_PROJECT_STATUSES } })
      .setOptions(cross)
      .select('workspaceId title dueDate createdBy reminders')
      .lean(),
  ]);
  const projectIds = [
    ...new Set(
      tasks
        .map((task) => task.projectId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const projectTitles = new Map(
    projectIds.length
      ? (
          await Project.find({ _id: { $in: projectIds } })
            .setOptions(cross)
            .select('title')
            .lean()
        ).map((project) => [String(project._id), project.title])
      : [],
  );
  return [
    ...events.map((item) => ({
      kind: 'event',
      item,
      date: item.startsAt,
      mode: item.allDay ? 'localDay' : 'timed',
      recipients: [...item.assigneeIds, item.createdBy],
    })),
    ...tasks.map((item) => ({
      kind: 'task',
      item: { ...item, projectTitle: projectTitles.get(String(item.projectId)) ?? null },
      date: item.dueDate,
      mode: 'localDay',
      recipients: [item.assigneeId ?? item.createdBy],
    })),
    ...projects.map((item) => ({
      kind: 'project',
      item,
      date: item.dueDate,
      mode: 'localDay',
      recipients: [item.createdBy],
    })),
  ];
}

// --------------------------------------------------------------- wording --

function formatIn(date, timeZone, options) {
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone, ...options }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-IN', options).format(date);
  }
}

// Days since 1970 for the calendar date `date` falls on in `timeZone`.
function dayNumber(date, timeZone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA').formatToParts(date);
  }
  const v = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return Date.UTC(v.year, v.month - 1, v.day) / DAY_MS;
}

function inMinutes(minutes) {
  if (minutes <= 1) return 'now';
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

function whenDue(candidate, prefs, now) {
  const zone = prefs.timeZone;
  const dueDay =
    candidate.mode === 'dateOnly'
      ? Date.UTC(
          candidate.date.getUTCFullYear(),
          candidate.date.getUTCMonth(),
          candidate.date.getUTCDate(),
        ) / DAY_MS
      : dayNumber(new Date(candidate.date.getTime() + 12 * 60 * MINUTE_MS), zone);
  const days = dueDay - dayNumber(now, zone);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  return `on ${formatIn(new Date(dueDay * DAY_MS), 'UTC', { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

function messageFor(candidate, prefs, now) {
  const { kind, item } = candidate;
  const base = `${env.CLIENT_URL}/w/${item.workspaceId}`;
  if (kind === 'event') {
    if (candidate.mode === 'timed') {
      const minutes = Math.round((candidate.date.getTime() - now.getTime()) / MINUTE_MS);
      const time = formatIn(candidate.date, prefs.timeZone, { hour: 'numeric', minute: '2-digit' });
      return {
        title: item.title,
        body: [`Starts ${inMinutes(minutes)} · ${time}`, item.location].filter(Boolean).join(' · '),
        url: `${base}/calendar`,
      };
    }
    return {
      title: item.title,
      body: [`All day ${whenDue(candidate, prefs, now)}`, item.location]
        .filter(Boolean)
        .join(' · '),
      url: `${base}/calendar`,
    };
  }
  const due = whenDue(candidate, prefs, now);
  if (kind === 'task') {
    return {
      title: `Task due ${due}`,
      body: [item.title, item.projectTitle].filter(Boolean).join(' · '),
      url: `${base}/tasks`,
    };
  }
  return {
    title: `Project due ${due}`,
    body: item.title,
    url: `${base}/projects/${item._id}`,
  };
}

function emailFor(user, message) {
  return {
    to: user.email,
    subject: `Reminder: ${message.title}`,
    text: [
      `Hi ${user.name},`,
      '',
      `${message.title}`,
      message.body,
      '',
      `Open it in ${APP_NAME}:`,
      message.url,
      '',
      `You can change how ${APP_NAME} reminds you under Account › Notifications.`,
    ].join('\n'),
  };
}

// --------------------------------------------------------------- sending --

async function claim(key) {
  try {
    await SentReminder.create({ key });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

async function deliver(user, message, tag) {
  const prefs = user.notificationPrefs ?? {};
  const devices =
    prefs.push === false ? 0 : await pushToUser(user._id, { ...message, tag }, { urgency: 'high' });
  const email = prefs.email ?? 'fallback';
  if (email === 'always' || (email === 'fallback' && devices === 0)) {
    deliverEmailInBackground(emailFor(user, message));
  }
}

/**
 * Sends every reminder due in (now - catchUpMs, now]. dryRun: sends and
 * records nothing, and returns what would have gone out (for checking).
 * candidates: items to check instead of the database's (tests).
 */
export async function sweep({
  now = new Date(),
  catchUpMs = CATCH_UP_MS,
  dryRun = false,
  candidates: given,
} = {}) {
  const earliest = now.getTime() - catchUpMs;
  const planned = [];
  const candidates = given ?? (await loadCandidates(now));
  if (candidates.length === 0) return planned;

  const userIds = [...new Set(candidates.flatMap((c) => c.recipients.filter(Boolean).map(String)))];
  const users = new Map(
    (
      await User.find({ _id: { $in: userIds }, status: 'active' })
        .select('name email notificationPrefs')
        .lean()
    ).map((user) => [String(user._id), user]),
  );
  const memberCache = new Map();
  async function isMember(workspaceId, userId) {
    const key = `${workspaceId}:${userId}`;
    if (!memberCache.has(key)) {
      const found = await Membership.exists({ workspaceId, userId, status: 'active' });
      memberCache.set(key, Boolean(found));
    }
    return memberCache.get(key);
  }

  let sent = 0;
  for (const candidate of candidates) {
    const offsets = reminderOffsetsFor(candidate.kind, candidate.item);
    if (offsets.length === 0) continue;
    for (const userId of new Set(candidate.recipients.filter(Boolean).map(String))) {
      const user = users.get(userId);
      if (!user) continue;
      const prefs = {
        timeZone: user.notificationPrefs?.timeZone || 'Asia/Kolkata',
        dayReminderHour: user.notificationPrefs?.dayReminderHour ?? 9,
      };
      const anchor = anchorFor(candidate.date, { mode: candidate.mode, prefs });
      // Timed events that already started are not announced.
      if (candidate.mode === 'timed' && anchor.getTime() < now.getTime() - MINUTE_MS) continue;
      for (const fire of fireTimes(anchor, offsets)) {
        const at = fire.at.getTime();
        if (at > now.getTime() || at <= earliest) continue;
        if (!(await isMember(candidate.item.workspaceId, userId))) continue;
        const key = `${candidate.kind}:${candidate.item._id}:${userId}:${fire.at.toISOString()}`;
        // Real sends say how long is really left; a preview speaks as of the reminder.
        const message = messageFor(candidate, prefs, dryRun ? fire.at : now);
        if (dryRun) {
          planned.push({ key, at: fire.at, to: user.email, ...message });
          continue;
        }
        if (!(await claim(key))) continue;
        await deliver(user, message, `${candidate.kind}-${candidate.item._id}`);
        sent += 1;
      }
    }
  }
  if (sent) logger.info({ sent }, 'Reminders sent');
  return planned;
}

async function run() {
  if (running) return;
  running = true;
  try {
    await sweep();
  } catch (err) {
    logger.error({ err }, 'Reminder sweep failed');
  } finally {
    running = false;
  }
}

export function startReminderWorker() {
  // Local dev shares the live database: it must not message real people
  // (with localhost links). REMINDERS_IN_DEV=true turns it on for testing.
  if (env.NODE_ENV !== 'production' && process.env.REMINDERS_IN_DEV !== 'true') {
    logger.info('Reminder worker off (not production; set REMINDERS_IN_DEV=true to test)');
    return;
  }
  logger.info('Reminder worker started');
  firstRun = setTimeout(run, FIRST_TICK_AFTER_MS);
  firstRun.unref();
  timer = setInterval(run, TICK_MS);
  timer.unref();
}

export function stopReminderWorker() {
  clearTimeout(firstRun);
  clearInterval(timer);
}
