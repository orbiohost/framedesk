import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
import { sendError } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

function fromMongooseValidation(err) {
  const details = Object.values(err.errors).map((fieldError) => ({
    field: fieldError.path,
    message: fieldError.message,
  }));
  return AppError.badRequest('Some fields are invalid', 'VALIDATION_ERROR', details);
}

function toAppError(err) {
  if (err instanceof AppError) return err;
  // TokenExpiredError extends JsonWebTokenError, so it must be checked first.
  if (err instanceof jwt.TokenExpiredError) {
    return AppError.unauthorized('Your session has expired', 'TOKEN_EXPIRED');
  }
  if (err instanceof jwt.JsonWebTokenError) {
    return AppError.unauthorized('Your session is invalid', 'TOKEN_INVALID');
  }
  if (err instanceof mongoose.Error.ValidationError) return fromMongooseValidation(err);
  if (err instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Invalid value for ${err.path}`, 'INVALID_VALUE');
  }
  if (err?.code === 11000) return AppError.conflict('This record already exists', 'DUPLICATE');
  if (err?.type === 'entity.parse.failed') {
    return AppError.badRequest('Request body is not valid JSON', 'MALFORMED_JSON');
  }
  if (err?.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
}

// Express needs all four params to treat this as an error handler.
export function errorHandler(err, req, res, _next) {
  const appError = toAppError(err);
  if (appError.statusCode >= 500) {
    (req.log ?? logger).error({ err }, 'Unhandled error');
  }
  if (res.headersSent) {
    res.end();
    return;
  }
  sendError(res, appError);
}
