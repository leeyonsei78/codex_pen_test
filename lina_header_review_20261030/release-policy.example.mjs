// Integration reference only. Not installed in the actual application.
// Requires an HTTPS-only application behind a correctly configured TLS proxy.
export function sessionCookieOptions(sameSite = 'Lax') {
  if (!['Lax', 'Strict', 'None'].includes(sameSite)) throw new TypeError('Invalid SameSite');
  return { secure: true, httpOnly: true, sameSite, path: '/' };
}
export function releasePolicy(req, res, next) {
  // Apply at the trusted ingress as well, before application routing.
  const path = new URL(req.url, 'https://local.invalid').pathname;
  if (/^\/html\/gap\/GM\/GPN999M0\.html\/?$/i.test(path)) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    res.end('Not found');
    return;
  }
  // Append to preserve any existing enforced script policy.
  // Confirm legitimate cross-origin embedding needs before enabling.
  res.appendHeader('Content-Security-Policy', "frame-ancestors 'self'");
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}
