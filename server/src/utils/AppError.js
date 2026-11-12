export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', details) {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Please sign in to continue', code = 'UNAUTHENTICATED') {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'You do not have access to this', code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }

  static conflict(message = 'This already exists', code = 'CONFLICT') {
    return new AppError(409, code, message);
  }

  static locked(message, code = 'LOCKED') {
    return new AppError(423, code, message);
  }

  static unavailable(message = 'This is not available right now', code = 'UNAVAILABLE') {
    return new AppError(503, code, message);
  }

  static tooManyRequests(message = 'Too many requests. Please wait a moment and try again.') {
    return new AppError(429, 'RATE_LIMITED', message);
  }
}
