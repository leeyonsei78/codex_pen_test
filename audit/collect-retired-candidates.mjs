import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

// Fixed public URLs discovered in search. No crawling, guessed paths, forms,
// credentials, redirects, referenced resources or attack payloads.
const targets = [
  ['C01', 'https://nhrsite.com/lina25/'],
  ['C02', 'https://linakorea-career2025.com/'],
  ['C03', 'https://linakorea.careerlink.kr/'],
  ['C04', 'https://direct.lina.co.kr/event/detail?evtSeq=1266'],
  ['C05', 'https://m.lina.co.kr/telanding/ob/Quiz_DT_reward.htm?adtype=LMS_C3&event=C3_T23_SSGPAY&media=20240807_30_BASKIN&source=DENTAL']
];
const folder = new URL(`retired-site-review-evidence/${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url);
await mkdir(folder, { recursive: true });
const records = [];
for (const [id, url] of targets) {
  if (records.length) await setTimeout(1500);
  const record = { id, url, requestedAt: new Date().toISOString() };
  records.push(record);
  try {
    const response = await fetch(url, { redirect: 'manual', credentials: 'omit',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Public-Website-Security-Review/1.0', Accept: 'text/html' } });
    record.status = response.status;
    record.headers = Object.fromEntries(['content-type', 'content-security-policy',
      'content-security-policy-report-only', 'x-frame-options', 'strict-transport-security',
      'x-content-type-options', 'referrer-policy', 'cache-control', 'location', 'x-robots-tag']
      .filter(key => response.headers.has(key)).map(key => [key, response.headers.get(key)]));
    if (response.status !== 200) {
      await response.body?.cancel();
      record.note = 'No retry or redirect following; status is not proof of retirement';
      continue;
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 1048576) throw new Error('Body exceeds 1 MiB limit');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const text = body.toString('utf8');
    record.bytes = body.length;
    record.sha256 = createHash('sha256').update(body).digest('hex');
    record.bodyFile = `${id}.html`;
    record.staticReview = {
      cspMetaObserved: /<meta\b[^>]*http-equiv\s*=\s*['"]Content-Security-Policy['"]/i.test(text),
      robotsMeta: [...text.matchAll(/<meta\b[^>]*name\s*=\s*['"]robots['"][^>]*>/gi)].map(m => m[0]),
      scriptSources: [...text.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)].map(m => m[2]),
      formCount: (text.match(/<form\b/gi) ?? []).length,
      inputCount: (text.match(/<input\b/gi) ?? []).length,
      title: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1]?.trim(),
      limits: 'Static text only; no browser, submissions or linked resource checks'
    };
    await writeFile(new URL(record.bodyFile, folder), body);
  } catch (error) {
    record.error = { message: error.message, cause: error.cause?.code };
  }
  await writeFile(new URL('results.json', folder), JSON.stringify({ mode: 'FIXED_PUBLIC_GET_ONLY', records }, null, 2));
}
await writeFile(new URL('results.json', folder), JSON.stringify({ mode: 'FIXED_PUBLIC_GET_ONLY', records }, null, 2));
console.log(JSON.stringify({ folder: folder.pathname, records }, null, 2));
