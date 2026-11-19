import { z } from 'zod';

// Each person's project-alert settings (Profile → Notifications → Project
// alerts), with the defaults asked for: ring 20 s, repeat every 5 min until
// the project is opened.

export const ALERT_SOUNDS = ['chime', 'bell', 'beacon', 'pulse', 'digital', 'siren'];

export const DEFAULT_ALERT_SETTINGS = {
  enabled: true,
  sound: 'chime',
  volume: 0.8,
  ringSeconds: 20,
  repeatMinutes: 5,
  maxRepeats: 0,
  vibrate: true,
  allowFrom: 'everyone',
  quietHours: { enabled: false, start: 22, end: 7 },
};

// Limits for custom values (ring up to 5 min each time, repeat up to every
// 24 h, up to 1000 times; 0 repeats = forever, until the project is opened).
export const RING_LIMITS = {
  ringSeconds: { min: 3, max: 300 },
  repeatMinutes: { min: 1, max: 1440 },
  maxRepeats: { min: 0, max: 1000 },
};
const limited = (key) => z.number().int().min(RING_LIMITS[key].min).max(RING_LIMITS[key].max);

// What a sender may set for one alert, over each person's own settings.
export const ringOverrideSchema = z.object({
  ringSeconds: limited('ringSeconds').optional(),
  repeatMinutes: limited('repeatMinutes').optional(),
  maxRepeats: limited('maxRepeats').optional(),
});

export const alertSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  sound: z.enum(ALERT_SOUNDS).optional(),
  volume: z.number().min(0).max(1).optional(),
  ringSeconds: limited('ringSeconds').optional(),
  repeatMinutes: limited('repeatMinutes').optional(),
  maxRepeats: limited('maxRepeats').optional(),
  vibrate: z.boolean().optional(),
  allowFrom: z.enum(['everyone', 'admins']).optional(),
  quietHours: z
    .object({
      enabled: z.boolean().optional(),
      start: z.number().int().min(0).max(23).optional(),
      end: z.number().int().min(0).max(23).optional(),
    })
    .optional(),
});

// Saved values over the defaults.
export function alertSettingsOf(user) {
  const saved = user?.alertPrefs ?? {};
  const pick = (key) => saved[key] ?? DEFAULT_ALERT_SETTINGS[key];
  return {
    enabled: pick('enabled'),
    sound: ALERT_SOUNDS.includes(saved.sound) ? saved.sound : DEFAULT_ALERT_SETTINGS.sound,
    volume: pick('volume'),
    ringSeconds: pick('ringSeconds'),
    repeatMinutes: pick('repeatMinutes'),
    maxRepeats: pick('maxRepeats'),
    vibrate: pick('vibrate'),
    allowFrom: pick('allowFrom'),
    quietHours: {
      enabled: saved.quietHours?.enabled ?? DEFAULT_ALERT_SETTINGS.quietHours.enabled,
      start: saved.quietHours?.start ?? DEFAULT_ALERT_SETTINGS.quietHours.start,
      end: saved.quietHours?.end ?? DEFAULT_ALERT_SETTINGS.quietHours.end,
    },
  };
}

// A person's settings with the sender's choices for this alert on top.
export function effectiveSettings(user, alert) {
  const settings = alertSettingsOf(user);
  for (const key of ['ringSeconds', 'repeatMinutes', 'maxRepeats']) {
    const value = alert?.ring?.[key];
    if (value !== undefined && value !== null) settings[key] = value;
  }
  return settings;
}

// The $set for a PATCH: only the fields sent.
export function alertSettingsUpdate(input) {
  const set = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (key === 'quietHours') {
      for (const [inner, innerValue] of Object.entries(value)) {
        if (innerValue !== undefined) set[`alertPrefs.quietHours.${inner}`] = innerValue;
      }
    } else {
      set[`alertPrefs.${key}`] = value;
    }
  }
  return set;
}

function hourIn(timeZone, date) {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(date);
    return Number(hour);
  } catch {
    return date.getUTCHours();
  }
}

// Inside the person's quiet hours right now (their own time zone)?
export function inQuietHours(settings, timeZone, date = new Date()) {
  const { enabled, start, end } = settings.quietHours;
  if (!enabled || start === end) return false;
  const hour = hourIn(timeZone, date);
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

// When quiet hours end (to the hour), for holding repeats until then.
export function quietHoursEnd(settings, timeZone, from = new Date()) {
  const next = new Date(from);
  next.setUTCMinutes(0, 0, 0);
  for (let step = 0; step < 25; step += 1) {
    next.setUTCHours(next.getUTCHours() + 1);
    if (!inQuietHours(settings, timeZone, next)) return next;
  }
  return new Date(from.getTime() + 60 * 60 * 1000);
}
