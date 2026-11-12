import { z } from 'zod';
import {
  booleanQuery,
  objectId,
  optionalEmail,
  optionalText,
  searchQuery,
  tags,
} from '../../utils/zodHelpers.js';

const clientFields = {
  name: z.string().trim().min(1, 'Client name is required').max(120),
  company: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  notes: optionalText(5000),
  tags: tags.optional(),
};

export const clientParamsSchema = z.object({ clientId: objectId });

export const createClientSchema = z.object(clientFields);

export const updateClientSchema = z.object(clientFields).partial();

export const listClientsQuerySchema = z.object({
  q: searchQuery,
  archived: booleanQuery,
});
