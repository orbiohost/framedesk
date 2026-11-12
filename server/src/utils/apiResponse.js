// Every response uses one of two shapes:
//   { success: true, data, meta? }
//   { success: false, error: { code, message, details? } }

export function sendSuccess(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function sendError(res, { statusCode, code, message, details }) {
  const error = { code, message };
  if (details) error.details = details;
  return res.status(statusCode).json({ success: false, error });
}
