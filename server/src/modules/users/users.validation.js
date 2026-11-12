import { z } from 'zod';
import { password, personName } from '../../utils/zodHelpers.js';

export const updateProfileSchema = z.object({ name: personName });

// A base64 data URL; ~280 KB of text covers the 200 KB byte limit checked later.
export const setAvatarSchema = z.object({
  image: z.string().min(1, 'Choose an image').max(280_000, 'That image is too large'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: password,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from your current one',
  });
