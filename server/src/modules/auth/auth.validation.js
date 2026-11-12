import { z } from 'zod';
import { email, password, personName } from '../../utils/zodHelpers.js';

const token = z.string().trim().min(20).max(200);

export const signupSchema = z.object({
  name: personName,
  email,
  password,
  workspaceName: z.string().trim().max(80).optional(),
});

export const loginSchema = z.object({
  email,
  // No length rules here: login must accept whatever the user set.
  password: z.string().min(1, 'Enter your password').max(128),
});

export const verifyEmailSchema = z.object({ token });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ token, password });
