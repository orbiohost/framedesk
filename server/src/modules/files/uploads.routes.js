import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  cancelDirectUpload,
  completeDirectUpload,
  createDirectUpload,
  getDirectUpload,
  signDirectUploadParts,
} from './directUploads.service.js';

// Uploads go from the browser straight into S3 (see directUploads.service.js).
// These endpoints only authorise, hand out part links and finish the upload.

const idParams = z.object({ uploadId: z.string().regex(/^[a-f\d]{24}$/i) });

const createBody = z.object({
  size: z.number().int().positive(),
  // Same fields the upload form always sent: names, folder, tags, transcribe options.
  metadata: z.record(z.string(), z.string().max(2000)),
});

const partUrlsBody = z.object({
  partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100),
});

const router = Router();
router.use(authenticate);

router.post(
  '/',
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const upload = await createDirectUpload(req.user, req.body.metadata, req.body.size);
    sendSuccess(res, { upload }, { status: 201 });
  }),
);

router.get(
  '/:uploadId',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { upload: await getDirectUpload(req.user, req.params.uploadId) });
  }),
);

router.post(
  '/:uploadId/part-urls',
  validate({ params: idParams, body: partUrlsBody }),
  asyncHandler(async (req, res) => {
    const result = await signDirectUploadParts(req.user, req.params.uploadId, req.body.partNumbers);
    sendSuccess(res, result);
  }),
);

router.post(
  '/:uploadId/complete',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await completeDirectUpload(req.user, req.params.uploadId));
  }),
);

router.delete(
  '/:uploadId',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await cancelDirectUpload(req.user, req.params.uploadId);
    sendSuccess(res, { cancelled: true });
  }),
);

export default router;
