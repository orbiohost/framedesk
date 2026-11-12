import { Router } from 'express';
import { canEdit, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './calendar.controller.js';
import {
  createEventSchema,
  eventParamsSchema,
  feedQuerySchema,
  updateEventSchema,
} from './calendar.validation.js';

const router = Router();

router.get('/', canView, validate({ query: feedQuerySchema }), controller.feed);
router.post('/events', canEdit, validate({ body: createEventSchema }), controller.createEvent);
router.patch(
  '/events/:eventId',
  canEdit,
  validate({ params: eventParamsSchema, body: updateEventSchema }),
  controller.updateEvent,
);
router.delete(
  '/events/:eventId',
  canEdit,
  validate({ params: eventParamsSchema }),
  controller.deleteEvent,
);

export default router;
