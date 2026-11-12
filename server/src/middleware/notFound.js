import { AppError } from '../utils/AppError.js';

export function notFound(req, res, next) {
  next(AppError.notFound(`No route for ${req.method} ${req.path}`, 'ROUTE_NOT_FOUND'));
}
