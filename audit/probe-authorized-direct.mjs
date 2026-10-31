import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

// Exactly two public GETs at most, no credentials, no redirects or JS execution.
const target = 'https://direct.e-lina.co.kr/emall/P00303.htm?t=S1_2106_A_01';
const marker = 'AUDIT_SAFE_20261030_Q7';
const probe = new URL(target);
probe.searchParams.set('audit_probe', marker);
const folder = new URL(`direct-probe-evidence/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url);
await mkdir(folder, { recursive: true });
const records = [];
for (const [name, url] of [['baseline', target], ['marker', probe.href]]) {
  if (records.length) await setTimeout(1200);
  const record = { name, url, requestedAt: new Date().toISOString() };
  records.push(record);
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'manual',
      credentials: 'omit', signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Authorized-Security-Review/1.0', Accept: 'text/html' } });
    record.status = response.status;
    record.headers = Object.fromEntries(['content-type', 'content-security-policy',
      'content-security-policy-report-only', 'x-frame-options', 'strict-transport-security',
      'x-content-type-options', 'referrer-policy', 'cache-control', 'location']
      .filter(key => response.headers.has(key)).map(key => [key, response.headers.get(key)]));
    if (response.status >= 300 && response.status < 400 || response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      record.stopped = 'Redirect, rate limit or server error: stop without further requests';
      break;
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) throw new Error('Response exceeds 1 MiB: stop');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const text = body.toString('utf8');
    record.bytes = body.length;
    record.sha256 = createHash('sha256').update(body).digest('hex');
    record.markerReflected = text.includes(marker);
    record.bodyFile = `${name}.html`;
    await writeFile(new URL(record.bodyFile, folder), body);
    if (response.status >= 400) { record.stopped = 'Client error: stop'; break; }
  } catch (error) {
    record.error = { message: error.message, code: error.cause?.code, cause: error.cause?.message };
    break;
  }
}
const result = { target, marker, mode: 'PUBLIC_GET_ONLY_NO_REDIRECT_NO_CREDENTIALS', records,
  limits: ['No exploit payload, browser execution, authenticated API or AI endpoint testing.',
    'Marker absence does not establish lack of XSS or other vulnerabilities.'] };
await writeFile(new URL('results.json', folder), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ folder: folder.pathname, ...result }, null, 2));
