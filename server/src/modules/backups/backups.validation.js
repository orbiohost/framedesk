import { z } from 'zod';
const MAX_RANGE_DAYS = 3660;
const DAY_MS = 24 * 60 * 60 * 1000;

// Either no dates (everything) or both, with "from" not after "to".
function datedRange(shape) {
  return z
    .object(shape)
    .refine((value) => Boolean(value.from) === Boolean(value.to), {
      path: ['to'],
      message: 'Choose both a start and an end date',
    })
    .refine((value) => !value.from || value.from <= value.to, {
      path: ['to'],
      message: 'The end date must be on or after the start date',
    })
    .refine((value) => !value.from || value.to - value.from <= MAX_RANGE_DAYS * DAY_MS, {
      path: ['to'],
      message: 'Choose a range of at most ten years',
    });
}

export const summaryQuerySchema = datedRange({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const createLinkSchema = datedRange({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  includeFiles: z.boolean().default(false),
});

export const downloadParamsSchema = z.object({ token: z.string().min(20).max(2000) });
