import { z } from 'zod';
import { objectId, optionalText, password, personName } from '../../utils/zodHelpers.js';

export const updateProfileSchema = z.object({ name: personName });

// A base64 data URL; ~280 KB of text covers the 200 KB byte limit checked later.
export const setAvatarSchema = z.object({
  image: z.string().min(1, 'Choose an image').max(280_000, 'That image is too large'),
});

export const changePasswordSchema = z
  .object({
    // Empty only when setting a first password on a Google account (checked in the service).
    currentPassword: z.string().max(128).optional().default(''),
    newPassword: password,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from your current one',
  });

export const billingProfileSchema = z.object({
  companyName: optionalText(120),
  gstin: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[0-9A-Z]{15}$/, 'A GSTIN is 15 letters and digits'),
    ])
    .nullable()
    .optional()
    .transform((value) => value || null),
  addressLine: optionalText(200),
  city: optionalText(60),
  state: optionalText(60),
  postalCode: optionalText(12),
  country: optionalText(60),
  phone: optionalText(20),
});

export const invoiceParamsSchema = z.object({ paymentId: objectId });
