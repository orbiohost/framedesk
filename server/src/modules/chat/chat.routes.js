import { Router } from 'express';
import { canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './chat.controller.js';
import {
  createMessageSchema,
  listMessagesQuerySchema,
  messageParamsSchema,
} from './chat.validation.js';

const router = Router();

// Everyone on the team, viewers included, can talk. Client-role members stay out.
router.get('/', canView, validate({ query: listMessagesQuerySchema }), controller.list);
router.post('/', canView, validate({ body: createMessageSchema }), controller.create);
router.delete('/:messageId', canView, validate({ params: messageParamsSchema }), controller.remove);

export default router;
