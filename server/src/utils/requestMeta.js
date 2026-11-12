export function requestMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 300),
  };
}
