import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const url = 'https://www.lina.co.kr/mall/PSAMAIN.htm?t=S1_2309_A_01';
const folder = new URL(`psamain-review-evidence/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url);
await mkdir(folder, { recursive: true });
const result = { url, requestedAt: new Date().toISOString(), mode: 'ONE_NORMAL_GET_NO_REDIRECT_NO_PAYLOAD' };
try {
  const response = await fetch(url, { redirect: 'manual', credentials: 'omit',
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Authorized-Security-Review/1.0', Accept: 'text/html' } });
  result.status = response.status;
  result.headers = Object.fromEntries(['content-type', 'content-security-policy',
    'content-security-policy-report-only', 'x-frame-options', 'strict-transport-security',
    'x-content-type-options', 'referrer-policy', 'cache-control', 'location']
    .filter(key => response.headers.has(key)).map(key => [key, response.headers.get(key)]));
  if (response.status === 200) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 1048576) throw new Error('Body limit exceeded');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const html = body.toString('utf8');
    result.bytes = body.length;
    result.sha256 = createHash('sha256').update(body).digest('hex');
    result.htmlReview = {
      cspMetaObserved: /<meta\b[^>]*http-equiv\s*=\s*['"]Content-Security-Policy['"]/i.test(html),
      scriptTagCount: (html.match(/<script\b/gi) ?? []).length,
      iframeTagCount: (html.match(/<iframe\b/gi) ?? []).length,
      limits: 'Static UTF-8 text scan only; no browser execution or referenced resource requests'
    };
    await writeFile(new URL('public-response.html', folder), body);
  } else {
    await response.body?.cancel();
    result.stopped = 'No redirect following or further requests';
  }
} catch (error) {
  result.error = error.message;
}
await writeFile(new URL('result.json', folder), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ folder: folder.pathname, ...result }, null, 2));
