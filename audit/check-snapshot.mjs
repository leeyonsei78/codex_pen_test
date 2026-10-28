import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Offline checks of captured responses. No requests are made by this command.
const evidence = new URL('./evidence/', import.meta.url);
const records = JSON.parse(await readFile(new URL('responses.json', evidence), 'utf8'));
const byId = Object.fromEntries(records.map(record => [record.id, record]));
for (const record of records) {
  if (!record.bodyFile) throw new Error(`Incomplete evidence: ${record.id}`);
  const body = await readFile(new URL(record.bodyFile, evidence));
  if (createHash('sha256').update(body).digest('hex') !== record.sha256) throw new Error(`Evidence changed: ${record.id}`);
}
const checks = [];
const add = (id, passed, message) => checks.push({ id, passed: Boolean(passed), message });
for (const id of ['R01', 'R03']) {
  const record = byId[id];
  if (!record || record.status !== 200) throw new Error(`Expected HTML 200: ${id}`);
  const headers = record.headers;
  add(`${id}-HSTS`, /max-age=31536000/i.test(headers['strict-transport-security'] || ''), 'Observed HSTS max-age is one year');
  add(`${id}-NOSNIFF`, headers['x-content-type-options'] === 'nosniff', 'MIME sniffing disabled');
  add(`${id}-NO-STORE`, /\bno-store\b/i.test(headers['cache-control'] || ''), 'HTML response forbids storage by conforming caches');
  const csp = headers['content-security-policy'] || '';
  const xfo = headers['x-frame-options'] || '';
  const frameDirective = csp.split(';').map(part => part.trim()).find(part => /^frame-ancestors\b/i.test(part));
  // Enforced CSP frame-ancestors takes precedence over X-Frame-Options.
  const strictFramePolicy = frameDirective
    ? /^frame-ancestors\s+(?:'none'|'self')\s*$/i.test(frameDirective)
    : /^(DENY|SAMEORIGIN)$/i.test(xfo);
  add(`${id}-FRAME-POLICY`, strictFramePolicy, 'Strict frame policy present in HTTP response');
}
add('HTTP-TO-HTTPS', byId.R02?.status === 301 && byId.R02.headers.location === 'https://www.lina.co.kr/', 'HTTP home redirects to canonical HTTPS home');
for (const id of ['R01', 'R03']) {
  const html = await readFile(new URL(byId[id].bodyFile, evidence), 'utf8');
  add(`${id}-NO-LEGACY-JQUERY`, !/<script\b[^>]*src=["'][^"']*\/jquery\/1\.12\.4\/jquery\.min\.js["']/i.test(html), 'HTML no longer references captured legacy jQuery path');
  add(`${id}-NO-INTERNAL-CONFIG`, !/VUE_APP_PRIVATE_COMMON_API_DOMAIN|PRIVATE_DOMAINS|service-ldc\.svc/.test(html), 'Captured private config markers absent from HTML');
}
const result = {
  at: new Date().toISOString(),
  scope: 'Captured public HTML only; not a release approval, browser test, dependency audit or authorization test.',
  checks,
  passed: checks.filter(check => check.passed).length,
  failed: checks.filter(check => !check.passed).length,
};
await writeFile(new URL('snapshot-checks.json', evidence), JSON.stringify(result, null, 2) + '\n');
for (const check of checks) console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.id}: ${check.message}`);
console.log(`Captured snapshot: ${result.passed} passed, ${result.failed} failed`);
if (result.failed) process.exitCode = 1;
