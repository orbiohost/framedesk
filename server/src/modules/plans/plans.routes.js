import { Router } from 'express';
import * as controller from './plans.controller.js';

const router = Router();

router.get('/', controller.pricing);

export default router;
