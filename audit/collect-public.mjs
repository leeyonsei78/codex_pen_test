import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

// Explicit read-only allowlist. No crawling, cookies, redirects, forms or API calls.
const urls = [
  'https://www.lina.co.kr/',
  'http://www.lina.co.kr/',
  'https://www.lina.co.kr/login',
  'https://www.lina.co.kr/company',
  'https://www.lina.co.kr/lib/jquery-3.7.1.js',
  'https://www.lina.co.kr/lib/jquery/1.12.4/jquery.min.js',
  'https://www.lina.co.kr/external/load.js',
  'https://www.lina.co.kr/external/script/head_prd.js',
  'https://www.lina.co.kr/external/script/body_prd.js',
];
const out = fileURLToPath(new URL('./evidence/', import.meta.url));
await mkdir(out, { recursive: true });
const records = [];
let totalBytes = 0;
for (const [index, url] of urls.entries()) {
  if (index) await delay(1000);
  const record = { id: `R${String(index + 1).padStart(2, '0')}`, url, method: 'GET', at: new Date().toISOString() };
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    record.status = response.status;
    record.headers = Object.fromEntries([...response.headers].filter(([name]) => name !== 'set-cookie'));
    record.cookies = response.headers.getSetCookie().map(value => {
      const parts = value.split(';');
      const name = parts.shift().split('=', 1)[0].trim();
      return { name, value: '[REDACTED]', attributes: parts.map(part => part.trim()) };
    });
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      totalBytes += chunk.length;
      if (bytes > 3 * 1024 * 1024 || totalBytes > 10 * 1024 * 1024) throw new Error('Safety byte limit reached');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    record.bytes = bytes;
    record.sha256 = createHash('sha256').update(body).digest('hex');
    const extension = response.headers.get('content-type')?.includes('html') ? 'html' : 'txt';
    record.bodyFile = `${record.id}.${extension}`;
    await writeFile(`${out}/${record.bodyFile}`, body);
  } catch (error) {
    record.error = `${error.name}: ${error.message}${error.cause?.code ? ` (${error.cause.code})` : ''}`;
  }
  records.push(record);
  await writeFile(`${out}/responses.json`, JSON.stringify(records, null, 2) + '\n');
  console.log(JSON.stringify(record));
  if (record.status === 429 || record.status >= 500 || record.error) break;
}
