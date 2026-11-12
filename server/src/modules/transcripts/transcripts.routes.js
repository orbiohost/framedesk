import express, { Router } from 'express';
import { dictationLimiter } from '../../middleware/rateLimit.js';
import { canEdit, canView } from '../../middleware/requireWorkspaceRole.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './transcripts.controller.js';
import {
  dictationQuerySchema,
  exportQuerySchema,
  listTranscriptsQuerySchema,
  requestTranscriptSchema,
  transcriptParamsSchema,
} from './transcripts.validation.js';

const MAX_DICTATION_BYTES = '25mb';

const router = Router();
const withFileId = validate({ params: transcriptParamsSchema });

// Whether the server has speech-to-text at all (the UI hides it otherwise).
router.get('/config', canView, controller.config);

// History: every transcript in the workspace, newest first (no full text).
router.get('/', canView, validate({ query: listTranscriptsQuerySchema }), controller.list);

// The Drive folder the Transcribe page uploads into (created on first use).
router.post('/folder', canEdit, controller.folder);

// A short voice recording (MediaRecorder output) in, text out. Used for notes.
router.post(
  '/dictation',
  canView,
  dictationLimiter,
  express.raw({
    type: ['audio/*', 'video/webm', 'application/octet-stream'],
    limit: MAX_DICTATION_BYTES,
  }),
  validate({ query: dictationQuerySchema }),
  controller.dictation,
);

// One transcript per file, keyed by the file id.
router.get('/:fileId', canView, withFileId, controller.get);
router.post(
  '/:fileId',
  canEdit,
  validate({ params: transcriptParamsSchema, body: requestTranscriptSchema }),
  controller.request,
);
router.delete('/:fileId', canEdit, withFileId, controller.remove);
router.get(
  '/:fileId/export',
  canView,
  validate({ params: transcriptParamsSchema, query: exportQuerySchema }),
  controller.exportFile,
);

export default router;
