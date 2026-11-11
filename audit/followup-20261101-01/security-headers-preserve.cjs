'use strict';
// Local integration reference only; not deployed. Confirm legitimate embedding.
module.exports = function securityHeaders(req, res, next) {
  const previous = String(res.getHeader('X-Frame-Options') || '').trim().toUpperCase();
  const deny = previous === 'DENY';
  res.appendHeader('Content-Security-Policy', deny ? "frame-ancestors 'none'" : "frame-ancestors 'self'");
  res.setHeader('X-Frame-Options', deny ? 'DENY' : 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};
