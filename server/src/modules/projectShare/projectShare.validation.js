import { z } from 'zod';
import { PRIORITIES } from '../../config/constants.js';
import { objectId, optionalDate, optionalText } from '../../utils/zodHelpers.js';
import { SHARE_AUDIENCES, SHARE_PERMISSIONS } from '../projects/project.model.js';
import { TASK_STATUSES } from '../tasks/task.model.js';

export const shareSettingsSchema = z
  .object({
    enabled: z.boolean(),
    audience: z.enum(SHARE_AUDIENCES),
    permission: z.enum(SHARE_PERMISSIONS),
  })
  .partial();

// randomToken(24) gives 32 base64url characters.
export const shareParamsSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, 'Invalid link'),
});

export const sharedTaskParamsSchema = shareParamsSchema.extend({ taskId: objectId });
export const sharedFileParamsSchema = shareParamsSchema.extend({ fileId: objectId });

const checklistItem = z.object({
  text: z.string().trim().min(1).max(300),
  done: z.boolean().default(false),
});

// What a visitor with an edit link may set on a task. Assignees and the
// project stay with the team.
const sharedTaskFields = {
  title: z.string().trim().min(1, 'Give the task a title').max(300),
  description: optionalText(10000),
  dueDate: optionalDate,
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  checklist: z.array(checklistItem).max(100).optional(),
};

export const createSharedTaskSchema = z.object(sharedTaskFields);

export const updateSharedTaskSchema = z
  .object({ ...sharedTaskFields, order: z.number().finite().optional() })
  .partial();

export const sharedFilesQuerySchema = z.object({ cursor: objectId.optional() });

export const sharedFileUrlQuerySchema = z.object({
  disposition: z.enum(['inline', 'attachment']).default('attachment'),
});

export const sharedPreviewUrlsSchema = z.object({
  fileIds: z.array(objectId).min(1).max(100),
});

const MAX_RANGE_DAYS = 400;

export const sharedCalendarQuerySchema = z
  .object({ from: z.coerce.date(), to: z.coerce.date() })
  .refine(({ from, to }) => to > from, { path: ['to'], message: 'End must be after start' })
  .refine(({ from, to }) => to - from <= MAX_RANGE_DAYS * 24 * 60 * 60 * 1000, {
    path: ['to'],
    message: `Ask for at most ${MAX_RANGE_DAYS} days at a time`,
  });
