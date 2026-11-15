import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters');

export const personName = z.string().trim().min(1, 'Name is required').max(80);

// Optional fields: undefined means "not sent" (leave as is), while "" or null clears the value.
function blankToNull(value) {
  return value === '' ? null : value;
}

export function optionalText(max) {
  return z.string().trim().max(max).nullable().optional().transform(blankToNull);
}

export const optionalEmail = z
  .union([z.literal(''), email])
  .nullable()
  .optional()
  .transform(blankToNull);

export const optionalObjectId = z
  .union([z.literal(''), objectId])
  .nullable()
  .optional()
  .transform(blankToNull);

export const optionalDate = z.coerce.date().nullable().optional();

// Reminder offsets in minutes before (up to a week); null = the default.
const WEEK_MINUTES = 7 * 24 * 60;

export const reminderOffsets = z
  .array(z.number().int().min(0).max(WEEK_MINUTES))
  .max(5, 'Use at most 5 reminders')
  .transform((list) => [...new Set(list)].sort((a, b) => b - a))
  .nullable()
  .optional();

export const tags = z
  .array(z.string().trim().min(1).max(40))
  .max(20, 'Use at most 20 tags')
  .transform((list) => [...new Set(list.map((tag) => tag.toLowerCase()))]);

export const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true');

export const searchQuery = z.string().trim().max(100).optional();
