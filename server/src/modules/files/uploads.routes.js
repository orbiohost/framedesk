import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { verifiedUploadMetadata } from './uploadContext.js';
import { parseUploadMetadata } from './uploadMetadata.js';
import { uploadServer, uploadStore } from './uploadServer.js';
import { prepareUpload } from './uploads.service.js';

// Resumable uploads (tus protocol). Express decides who may upload what; tus moves the bytes.

// Upload ids become file names in the staging folder, so only plain ids are accepted.
const uploadParamsSchema = z.object({ uploadId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) });

const router = Router();

function handOverToTus(req, res) {
  // Inside a mounted router req.url loses the "/api/uploads" prefix tus expects.
  req.url = req.originalUrl;
  return uploadServer.handle(req, res);
}

const createUpload = asyncHandler(async (req, res) => {
  const clientMetadata = parseUploadMetadata(req.get('upload-metadata'));
  const size = Number(req.get('upload-length'));
  const metadata = await prepareUpload(req.user, clientMetadata, size);
  await verifiedUploadMetadata.run(metadata, () => handOverToTus(req, res));
});

// Unknown ids pass through so tus can answer with its usual 404.
const checkOwnUpload = asyncHandler(async (req, res, next) => {
  const upload = await uploadStore.getUpload(req.params.uploadId).catch(() => null);
  if (upload && upload.metadata?.userId !== String(req.user._id)) {
    throw AppError.forbidden('This upload belongs to someone else');
  }
  next();
});

router.post('/', authenticate, createUpload);
router.all(
  '/:uploadId',
  authenticate,
  validate({ params: uploadParamsSchema }),
  checkOwnUpload,
  handOverToTus,
);

export default router;
