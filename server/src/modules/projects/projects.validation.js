import { z } from 'zod';
import { PRIORITIES } from '../../config/constants.js';
import {
  objectId,
  optionalDate,
  optionalObjectId,
  optionalText,
  searchQuery,
  tags,
} from '../../utils/zodHelpers.js';
import { PROJECT_STATUSES, PROJECT_TYPES } from './project.model.js';

const projectFields = {
  title: z.string().trim().min(1, 'Give the project a title').max(160),
  clientId: optionalObjectId,
  type: z.enum(PROJECT_TYPES).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  startDate: optionalDate,
  dueDate: optionalDate,
  budget: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  description: optionalText(10000),
  tags: tags.optional(),
};

function dueAfterStart(project) {
  return !project.startDate || !project.dueDate || project.dueDate >= project.startDate;
}

const dueDateRule = { path: ['dueDate'], message: 'Due date must be on or after the start date' };

export const projectParamsSchema = z.object({ projectId: objectId });

export const createProjectSchema = z.object(projectFields).refine(dueAfterStart, dueDateRule);

export const updateProjectSchema = z
  .object(projectFields)
  .partial()
  .refine(dueAfterStart, dueDateRule);

export const listProjectsQuerySchema = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  clientId: objectId.optional(),
  q: searchQuery,
});
