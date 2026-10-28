'use strict';

// Integration example for Node/Nuxt server middleware. Review legitimate iframe
// embedding requirements before enabling SAMEORIGIN on the real service.
// Keep the existing HSTS configuration at the HTTPS termination layer.
module.exports = function securityHeaders(req, res, next) {
  // Multiple enforced policies are intersected by browsers. Retain any existing
  // script policy rather than replacing it with this limited frame policy.
  res.appendHeader('Content-Security-Policy', "frame-ancestors 'self'");
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};
