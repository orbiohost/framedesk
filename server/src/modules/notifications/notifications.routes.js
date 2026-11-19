import { Router } from 'express';
import { z } from 'zod';
import { APP_NAME } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { authenticate } from '../../middleware/authenticate.js';
import { emailLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/AppError.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { User } from '../users/user.model.js';
import { PushSubscription } from './notification.models.js';
import { publicKey, pushEnabled, pushToUser } from './push.service.js';
import { isValidTimeZone } from './reminderRules.js';

// The signed-in person's reminder settings and the devices that get them.

const timeZone = z.string().trim().max(64).refine(isValidTimeZone, 'Unknown time zone');

const settingsSchema = z.object({
  push: z.boolean().optional(),
  email: z.enum(['always', 'fallback', 'off']).optional(),
  dayReminderHour: z.number().int().min(0).max(23).optional(),
  timeZone: timeZone.optional(),
});

const subscribeSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2048)
    .refine((url) => url.startsWith('https://'), 'Must be https'),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(64),
  }),
  label: z.string().trim().max(80).optional(),
  timeZone: timeZone.optional(),
});

const unsubscribeSchema = z.object({ endpoint: z.string().max(2048) });

function toSettings(user) {
  const prefs = user.notificationPrefs ?? {};
  return {
    push: prefs.push !== false,
    email: prefs.email ?? 'fallback',
    dayReminderHour: prefs.dayReminderHour ?? 9,
    timeZone: prefs.timeZone ?? 'Asia/Kolkata',
  };
}

async function devicesOf(userId) {
  const rows = await PushSubscription.find({ userId })
    .select('endpoint label createdAt lastSuccessAt')
    .sort({ createdAt: -1 })
    .lean();
  return rows.map((row) => ({
    endpoint: row.endpoint,
    label: row.label,
    addedAt: row.createdAt,
    lastSuccessAt: row.lastSuccessAt,
  }));
}

async function overview(user) {
  return {
    pushAvailable: pushEnabled,
    publicKey: publicKey(),
    settings: toSettings(user),
    devices: await devicesOf(user._id),
  };
}

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    sendSuccess(res, await overview(req.user));
  }),
);

router.patch(
  '/settings',
  validate({ body: settingsSchema }),
  asyncHandler(async (req, res) => {
    const set = Object.fromEntries(
      Object.entries(req.body)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [`notificationPrefs.${key}`, value]),
    );
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: set },
      { new: true, runValidators: true },
    ).lean();
    sendSuccess(res, await overview(user));
  }),
);

// The same device subscribing again (or for another account) takes it over.
router.post(
  '/devices',
  validate({ body: subscribeSchema }),
  asyncHandler(async (req, res) => {
    if (!pushEnabled)
      throw AppError.badRequest('Device notifications are not set up on this server');
    const { endpoint, keys, label, timeZone: zone } = req.body;
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { $set: { userId: req.user._id, keys, label: label ?? null, failures: 0 } },
      { upsert: true, new: true, runValidators: true },
    );
    const set = { 'notificationPrefs.push': true };
    if (zone) set['notificationPrefs.timeZone'] = zone;
    const user = await User.findByIdAndUpdate(req.user._id, { $set: set }, { new: true }).lean();
    sendSuccess(res, await overview(user), { status: 201 });
  }),
);

router.delete(
  '/devices',
  validate({ body: unsubscribeSchema }),
  asyncHandler(async (req, res) => {
    await PushSubscription.deleteOne({ endpoint: req.body.endpoint, userId: req.user._id });
    sendSuccess(res, await overview(req.user));
  }),
);

// "Send a test": proves the whole path (server → push service → device).
// delaySeconds gives time to close the app first, to see that alerts arrive
// while it is closed; kind "alert" sends it the way project alerts look.
const testSchema = z
  .object({
    delaySeconds: z.number().int().min(0).max(30).default(0),
    kind: z.enum(['reminder', 'alert']).default('reminder'),
  })
  // The older "Send a test" button sends no body at all.
  .default({});

router.post(
  '/test',
  emailLimiter,
  validate({ body: testSchema }),
  asyncHandler(async (req, res) => {
    const alert = req.body.kind === 'alert';
    const payload = alert
      ? {
          kind: 'project-alert',
          title: `Test alert from ${APP_NAME}`,
          body: 'Project alerts reach you like this, even when the app is closed. Tap to open.',
          url: `${env.CLIENT_URL}/app`,
          tag: 'test-alert',
          requireInteraction: true,
          vibrate: [400, 200, 400, 200, 400],
        }
      : {
          title: `${APP_NAME} reminders are on`,
          body: 'This is how deadlines and calendar events will reach you.',
          url: `${env.CLIENT_URL}/app`,
          tag: 'test',
        };
    if (req.body.delaySeconds > 0) {
      const userId = req.user._id;
      setTimeout(() => {
        pushToUser(userId, payload).catch(() => {});
      }, req.body.delaySeconds * 1000).unref();
      sendSuccess(res, { delivered: null, scheduled: true });
      return;
    }
    sendSuccess(res, { delivered: await pushToUser(req.user._id, payload) });
  }),
);

export default router;
