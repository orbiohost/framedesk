import { AppError } from '../utils/AppError.js';

const REQUEST_PARTS = ['params', 'query', 'body'];

function toFieldErrors(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

// Usage: validate({ body: schema, params: schema, query: schema })
// Replaces each part with the parsed (trimmed, coerced, stripped) value.
export function validate(schemas) {
  return function validateRequest(req, res, next) {
    for (const part of REQUEST_PARTS) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (!result.success) {
        return next(
          AppError.badRequest(
            'Some fields are invalid',
            'VALIDATION_ERROR',
            toFieldErrors(result.error),
          ),
        );
      }
      req[part] = result.data;
    }
    next();
  };
}
