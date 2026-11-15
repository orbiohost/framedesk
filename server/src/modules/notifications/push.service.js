import webpush from 'web-push';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { PushSubscription } from './notification.models.js';

// Web push: the same code reaches Chrome/Edge/Firefox on desktop, Android
// (browser and the installed app) and iPhone/iPad home-screen apps (iOS 16.4+).

const MAX_FAILURES = 5;
const TTL_SECONDS = 6 * 60 * 60;

export const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

// Push services want an https: or mailto: contact. Local dev runs on http://,
// so it falls back to the address mail is sent from.
function vapidSubject() {
  if (env.VAPID_SUBJECT) return env.VAPID_SUBJECT;
  if (env.CLIENT_URL.startsWith('https://')) return env.CLIENT_URL;
  const address = env.MAIL_FROM.match(/[^<\s]+@[^>\s]+/)?.[0] ?? env.SMTP_USER;
  return address ? `mailto:${address}` : 'mailto:noreply@example.com';
}

if (pushEnabled) {
  webpush.setVapidDetails(vapidSubject(), env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

export function publicKey() {
  return pushEnabled ? env.VAPID_PUBLIC_KEY : null;
}

async function sendOne(subscription, body, urgency) {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      body,
      { TTL: TTL_SECONDS, urgency },
    );
    await PushSubscription.updateOne(
      { _id: subscription._id },
      { $set: { lastSuccessAt: new Date(), failures: 0 } },
    );
    return true;
  } catch (err) {
    // 404/410: the person turned notifications off or the app was removed.
    if (err.statusCode === 404 || err.statusCode === 410) {
      await PushSubscription.deleteOne({ _id: subscription._id });
    } else {
      const updated = await PushSubscription.findOneAndUpdate(
        { _id: subscription._id },
        { $inc: { failures: 1 } },
        { new: true },
      ).lean();
      if (updated && updated.failures >= MAX_FAILURES) {
        await PushSubscription.deleteOne({ _id: subscription._id });
      }
      logger.warn({ err: err.message, status: err.statusCode }, 'Push delivery failed');
    }
    return false;
  }
}

/**
 * payload: { title, body, url, tag }. Returns how many devices accepted it.
 */
export async function pushToUser(userId, payload, { urgency = 'high' } = {}) {
  if (!pushEnabled) return 0;
  const subscriptions = await PushSubscription.find({ userId }).lean();
  if (subscriptions.length === 0) return 0;
  const body = JSON.stringify(payload);
  const results = await Promise.all(subscriptions.map((sub) => sendOne(sub, body, urgency)));
  return results.filter(Boolean).length;
}
