import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Explicit homepage script references only. No API requests, payloads, accounts,
// recursive crawling, redirects, credentials, source-map guesses or port scans.
const phase = process.argv[2];
if (phase && phase !== '--common') throw new Error('Only the fixed --common phase is accepted');
const assets = phase === '--common' ? [
  '/_nuxt/b9ec9b2b8f8f5eb59c2c.js',
  '/_nuxt/31a5b58f7dc688907b07.js',
  '/_nuxt/a902d4b35b772a17a087.js',
  '/_nuxt/86be6db17213b34dbbaa.js',
] : [
  '/_nuxt/2a8103eec42a841f25c6.js',
  '/_nuxt/2ab0b35cc936bafd2929.js',
  '/_nuxt/42548c4181c780646c31.js',
  '/_nuxt/d56af464ab60e1d39fa3.js',
  '/_nuxt/17622a099759b640b893.js',
  '/_nuxt/ed3a30606bb6cb2037cf.js',
];
const baseline = await readFile(new URL('./additional-evidence/A01.html', import.meta.url), 'utf8');
for (const asset of assets) {
  if (!baseline.includes(`src="${asset}"`)) throw new Error('Only directly referenced assets are allowed');
}
const out = new URL(phase === '--common' ? './path-evidence/common/' : './path-evidence/', import.meta.url);
await mkdir(out, { recursive: true });
try {
  await readFile(new URL('responses.json', out));
  throw new Error('Path-review evidence already exists; do not overwrite');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const records = [];
let totalBytes = 0;
for (const [index, path] of assets.entries()) {
  if (index) await delay(1000);
  const record = { id: `P${String(index + 1).padStart(2, '0')}`, method: 'GET', url: `https://www.lina.co.kr${path}`, at: new Date().toISOString() };
  try {
    const response = await fetch(record.url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    record.status = response.status;
    record.headers = Object.fromEntries([...response.headers].filter(([key]) => key !== 'set-cookie'));
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      totalBytes += chunk.length;
      if (bytes > 3 * 1024 * 1024 || totalBytes > 10 * 1024 * 1024) throw new Error('Safety byte limit reached');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    record.bytes = body.length;
    record.bodyFile = `${record.id}.js`;
    record.sha256 = createHash('sha256').update(body).digest('hex');
    await writeFile(new URL(record.bodyFile, out), body);
  } catch (error) {
    record.error = `${error.name}: ${error.message}`;
  }
  records.push(record);
  await writeFile(new URL('responses.json', out), JSON.stringify(records, null, 2) + '\n');
  console.log(JSON.stringify({id:record.id, status:record.status, bytes:record.bytes, error:record.error || null}));
  if (record.error || record.status === 429 || record.status >= 500) break;
}
