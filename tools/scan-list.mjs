#!/usr/bin/env node
// 주소 목록(여러 사이트)을 사이트(origin)별로 묶어 읽기 전용으로 점검한다. site-audit.mjs의 점검 로직을 그대로 사용한다.
//
//   node tools/scan-list.mjs --urls urls.txt --i-am-authorized --json result.json --out result.md
//
// urls.txt: 한 줄에 URL 하나. 빈 줄과 # 으로 시작하는 줄은 무시. 같은 규칙(GET만, 쿠키·리다이렉트 없음, 1초 간격,
// 요청 20초/응답 3MiB 제한, 사이트당 30요청, 429·5xx 시 해당 사이트 중지, 내부망 차단)이 적용된다.
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { audit, toMarkdown } from './site-audit.mjs';

export function parseUrlList(text) {
  const urls = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let u;
    try { u = new URL(line); } catch { throw new Error(`올바른 URL이 아닙니다: ${line}`); }
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`http/https만 가능합니다: ${line}`);
    if (u.username || u.password) throw new Error(`계정 정보가 포함된 URL은 허용하지 않습니다: ${line}`);
    urls.push(u);
  }
  return urls;
}

// origin별로 묶고 경로(쿼리 포함)는 중복 제거. 입력 순서를 유지한다.
export function groupByOrigin(urls) {
  const map = new Map();
  for (const u of urls) {
    if (!map.has(u.origin)) map.set(u.origin, []);
    const p = u.pathname + u.search;
    const list = map.get(u.origin);
    if (!list.includes(p)) list.push(p);
  }
  return [...map].map(([origin, paths]) => ({ origin, paths }));
}

export async function scanList(urls, { allowPrivate = false, run = audit } = {}) {
  const groups = groupByOrigin(urls);
  const results = [];
  for (const [i, g] of groups.entries()) {
    if (i) await delay(1000);
    results.push(await run({ target: g.origin, paths: g.paths, allowPrivate }));
  }
  return { at: new Date().toISOString(), sites: results.length, results };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    urls: { type: 'string' }, out: { type: 'string' }, json: { type: 'string' },
    'i-am-authorized': { type: 'boolean', default: false }, 'allow-private': { type: 'boolean', default: false },
  } });
  if (!values.urls) { console.error('--urls <파일> 필요'); process.exit(2); }
  if (!values['i-am-authorized']) {
    console.error('점검 허가를 받은 대상에만 사용하세요. 확인했다면 --i-am-authorized 를 추가하세요.');
    process.exit(2);
  }
  const urls = parseUrlList(await readFile(values.urls, 'utf8'));
  const data = await scanList(urls, { allowPrivate: values['allow-private'] });
  const md = data.results.map(r => toMarkdown(r)).join('\n\n---\n\n');
  if (values.out) await writeFile(values.out, md); else console.log(md);
  if (values.json) await writeFile(values.json, JSON.stringify(data, null, 2));
  const medium = data.results.flatMap(r => r.findings).filter(f => f.severity === 'medium').length;
  console.error(`사이트 ${data.sites}개 점검 완료, 중간 이상 발견 ${medium}건`);
}
