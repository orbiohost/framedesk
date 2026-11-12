import { z } from 'zod';
import { objectId } from '../../utils/zodHelpers.js';

export const messageParamsSchema = z.object({ messageId: objectId });

export const createMessageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message first').max(2000),
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
