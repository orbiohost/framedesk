import { z } from 'zod';
import { PRIORITIES } from '../../config/constants.js';
import { objectId, optionalDate, optionalObjectId, optionalText } from '../../utils/zodHelpers.js';
import { TASK_STATUSES } from './task.model.js';

const checklistItem = z.object({
  text: z.string().trim().min(1).max(300),
  done: z.boolean().default(false),
});

const taskFields = {
  title: z.string().trim().min(1, 'Give the task a title').max(300),
  projectId: optionalObjectId,
  description: optionalText(10000),
  assigneeId: optionalObjectId,
  dueDate: optionalDate,
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  checklist: z.array(checklistItem).max(100).optional(),
};

export const taskParamsSchema = z.object({ taskId: objectId });

export const createTaskSchema = z.object(taskFields);

export const updateTaskSchema = z
  .object({ ...taskFields, order: z.number().finite().optional() })
  .partial();

export const listTasksQuerySchema = z.object({
  projectId: objectId.optional(),
  // "me" is resolved to the signed-in user by the controller.
  assignee: z.union([z.literal('me'), objectId]).optional(),
  status: z.enum(TASK_STATUSES).optional(),
});
