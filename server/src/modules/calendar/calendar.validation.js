import { z } from 'zod';
import { objectId, optionalObjectId, optionalText } from '../../utils/zodHelpers.js';
import { EVENT_TYPES } from './event.model.js';

const MAX_RANGE_DAYS = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

const eventFields = {
  title: z.string().trim().min(1, 'Give the event a title').max(200),
  type: z.enum(EVENT_TYPES).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  allDay: z.boolean().optional(),
  projectId: optionalObjectId,
  clientId: optionalObjectId,
  assigneeIds: z.array(objectId).max(50).optional(),
  location: optionalText(200),
  notes: optionalText(5000),
};

function endsAfterStart(event) {
  return !event.startsAt || !event.endsAt || event.endsAt >= event.startsAt;
}

const endRule = { path: ['endsAt'], message: 'The event must end after it starts' };

export const eventParamsSchema = z.object({ eventId: objectId });

export const createEventSchema = z.object(eventFields).refine(endsAfterStart, endRule);

export const updateEventSchema = z.object(eventFields).partial().refine(endsAfterStart, endRule);

export const feedQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    projectId: objectId.optional(),
  })
  .refine((range) => range.to > range.from, { path: ['to'], message: '"to" must be after "from"' })
  .refine((range) => range.to - range.from <= MAX_RANGE_DAYS * DAY_MS, {
    path: ['to'],
    message: `Ask for at most ${MAX_RANGE_DAYS} days at a time`,
  });
