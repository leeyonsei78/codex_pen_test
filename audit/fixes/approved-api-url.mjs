// Reference outbound destination guard for the shared authenticated client.
// Server-side authentication/authorization and redirect policy are still needed.
export function resolveApprovedApiUrl(input, configuredOrigin) {
  if (typeof input !== 'string' || input.length === 0) throw new TypeError('API URL must be a non-empty string');
  const base = new URL(configuredOrigin);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new TypeError('Configure a dedicated HTTPS API origin');
  }
  const target = new URL(input, base);
  if (target.protocol !== 'https:' || target.origin !== base.origin || target.username || target.password) {
    throw new TypeError('API destination is outside the approved origin');
  }
  return target.href;
}
