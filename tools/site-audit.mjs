#!/usr/bin/env node
// 공개 응답 수동(passive) 보안 점검 도구. Node.js 22+, 외부 패키지 없음.
//
// 사용 예:
//   node tools/site-audit.mjs --target https://example.com --i-am-authorized
//   node tools/site-audit.mjs --target http://127.0.0.1:8080 --paths /,/login --out report.md
//   --fail-on low|medium|none  : 해당 위험도 이상 발견 시 종료 코드 1 (기본 medium)
//
// 안전 장치: 점검 허가를 확인하는 --i-am-authorized 필수, GET만 사용, 쿠키/인증정보 미전송,
// 리다이렉트 미추적, 같은 origin만 접근, 요청 간 1초 이상 간격, 요청 20초/응답 3MiB/총 요청 수 제한,
// 429/5xx 시 중지. 크롤링·경로 대입·공격 문자열 전송·폼 제출은 하지 않습니다.
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const MAX_BODY = 3 * 1024 * 1024;
const MAX_REQUESTS = 30;

// ---------- 순수 분석 함수 (네트워크 없음, 테스트 가능) ----------

export function checkHeaders(headers) {
  const f = [];
  const csp = headers['content-security-policy'] ?? '';
  const hasFrameAncestors = /frame-ancestors/i.test(csp);
  if (!headers['x-frame-options'] && !hasFrameAncestors) {
    f.push({ id: 'HDR-FRAME', severity: 'medium', title: '프레임 삽입 제한 헤더 없음 (X-Frame-Options / CSP frame-ancestors)' });
  }
  if (!csp) f.push({ id: 'HDR-CSP', severity: 'medium', title: 'Content-Security-Policy 헤더 없음' });
  if (!headers['strict-transport-security']) f.push({ id: 'HDR-HSTS', severity: 'low', title: 'Strict-Transport-Security 헤더 없음 (HTTPS 응답 기준)' });
  if ((headers['x-content-type-options'] ?? '').toLowerCase() !== 'nosniff') f.push({ id: 'HDR-NOSNIFF', severity: 'low', title: 'X-Content-Type-Options: nosniff 없음' });
  if (!headers['referrer-policy']) f.push({ id: 'HDR-REFERRER', severity: 'low', title: 'Referrer-Policy 헤더 없음' });
  return f;
}

export function checkHeaderQuality(headers) {
  const f = [];
  const csp = headers['content-security-policy'] ?? '';
  if (csp) {
    if (/'unsafe-inline'/.test(csp) && !/'nonce-|'sha(?:256|384|512)-/.test(csp)) f.push({ id: 'CSP-UNSAFE-INLINE', severity: 'medium', title: "CSP에 'unsafe-inline' 허용 (nonce/hash 없음) — XSS 완화 효과 약함" });
    if (/'unsafe-eval'/.test(csp)) f.push({ id: 'CSP-UNSAFE-EVAL', severity: 'low', title: "CSP에 'unsafe-eval' 허용" });
    if (/(?:script-src|default-src)[^;]*(?:^|\s)\*(?:\s|;|$)/.test(csp)) f.push({ id: 'CSP-WILDCARD', severity: 'medium', title: 'CSP script-src/default-src에 와일드카드(*) 허용' });
    if (!/(?:script-src|default-src)/.test(csp)) f.push({ id: 'CSP-NO-SCRIPT', severity: 'low', title: 'CSP에 script-src/default-src 지시문 없음' });
  }
  const hsts = headers['strict-transport-security'];
  if (hsts) {
    const age = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
    if (age < 15552000) f.push({ id: 'HSTS-SHORT', severity: 'low', title: `HSTS max-age가 ${age}초 (권장 15552000초 이상)` });
  }
  for (const h of ['server', 'x-powered-by', 'x-aspnet-version']) {
    const v = headers[h];
    if (v && /\d+\.\d+/.test(v)) f.push({ id: 'INFO-VERSION', severity: 'low', title: `${h} 헤더에 버전 정보 노출: ${v}` });
  }
  if (headers['access-control-allow-origin'] === '*' && /true/i.test(headers['access-control-allow-credentials'] ?? '')) {
    f.push({ id: 'CORS-WILDCARD-CRED', severity: 'medium', title: 'CORS: Allow-Origin * 와 Allow-Credentials true 동시 설정' });
  } else if (headers['access-control-allow-origin'] === '*') {
    f.push({ id: 'CORS-WILDCARD', severity: 'info', title: 'CORS: Allow-Origin * (공개 리소스가 아니면 제한 필요)' });
  }
  return f;
}

export function checkCaching(headers, pathname) {
  if (!/login|signin|account|mypage|admin|auth/i.test(pathname)) return [];
  const cc = (headers['cache-control'] ?? '').toLowerCase();
  return /no-store/.test(cc) ? [] : [{ id: 'CACHE-SENSITIVE', severity: 'low', title: `인증 관련 경로(${pathname})에 Cache-Control: no-store 없음 (현재: ${cc || '없음'})` }];
}

export function checkExternalResources(html, baseOrigin) {
  const f = [];
  const noSri = [];
  for (const m of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag = m[0];
    const url = /(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!url || !/^(?:https?:)?\/\//i.test(url)) continue;
    if (m[1].toLowerCase() === 'link' && !/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
    let origin;
    try { origin = new URL(url, baseOrigin).origin; } catch { continue; }
    if (origin !== baseOrigin && !/\bintegrity\s*=/i.test(tag)) noSri.push(url);
  }
  if (noSri.length) f.push({ id: 'SRI-MISSING', severity: 'low', title: `외부 도메인 리소스 ${noSri.length}건에 integrity(SRI) 없음: ${[...new Set(noSri)].slice(0, 4).join(', ')}` });
  return f;
}

export function checkMixedContent(html, isHttps) {
  if (!isHttps) return [];
  const hits = [...new Set([...html.matchAll(/(?:src|href|action)\s*=\s*["'](http:\/\/[^"']+)["']/gi)].map(m => m[1]))];
  return hits.length ? [{ id: 'MIXED-CONTENT', severity: 'medium', title: `HTTPS 페이지에서 HTTP 리소스 참조 ${hits.length}건: ${hits.slice(0, 3).join(', ')}` }] : [];
}

export function checkCookies(setCookies, isHttps) {
  const f = [];
  for (const raw of setCookies) {
    const [pair, ...attrs] = raw.split(';').map(s => s.trim());
    const name = pair.split('=')[0];
    const lower = attrs.map(a => a.toLowerCase());
    const miss = [];
    if (isHttps && !lower.includes('secure')) miss.push('Secure');
    if (!lower.includes('httponly')) miss.push('HttpOnly');
    if (!lower.some(a => a.startsWith('samesite='))) miss.push('SameSite');
    if (lower.includes('samesite=none') && !lower.includes('secure')) f.push({ id: 'COOKIE-NONE-INSECURE', severity: 'medium', title: `쿠키 ${name}: SameSite=None인데 Secure 없음` });
    if (miss.length) f.push({ id: 'COOKIE', severity: 'low', title: `쿠키 ${name}: ${miss.join(', ')} 속성 없음 (세션 쿠키가 아니면 HttpOnly는 무방할 수 있음)` });
  }
  return f;
}

// 알려진 취약 범위(jQuery CVE-2020-11022/11023: <3.5.0)와 라이브러리 버전 배너 검사
export function detectLibraryVersion(source) {
  const head = source.slice(0, 600);
  const m = head.match(/jQuery(?: JavaScript Library)? v(\d+)\.(\d+)\.(\d+)/i);
  return m ? { name: 'jquery', version: m.slice(1, 4).map(Number) } : null;
}

export function jqueryVulnerable([a, b]) {
  return a < 3 || (a === 3 && b < 5);
}

export function extractScriptSrcs(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
}

export function checkDuplicateJquery(srcs) {
  const j = srcs.filter(s => /jquery/i.test(s));
  return j.length > 1
    ? [{ id: 'LIB-JQ-DUP', severity: 'medium', title: `jQuery 계열 스크립트 ${j.length}개 중복 참조: ${j.join(', ')}` }]
    : [];
}

const PRIVATE_HOST = /\b(?:localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.(?:internal|local|intra|corp))\b(?::\d+)?/gi;

export function checkInternalAddresses(html) {
  const hits = [...new Set(html.match(PRIVATE_HOST) ?? [])];
  return hits.length
    ? [{ id: 'CFG-INTERNAL', severity: 'low', title: `공개 응답에 내부망/로컬로 보이는 주소 포함: ${hits.slice(0, 5).join(', ')}` }]
    : [];
}

// 인라인/외부 스크립트의 위험 패턴 휴리스틱 (오탐 가능, 검토 단서용)
export function checkRiskyPatterns(source, label) {
  const f = [];
  if (/&qout;/.test(source)) f.push({ id: 'JS-ENTITY-TYPO', severity: 'info', title: `${label}: 잘못된 엔티티 '&qout;' (이스케이프 함수 오류 가능)` });
  if (/function\s+\w*(?:escape|sanitize)\w*\s*\([^)]*\)\s*\{[^}]*(?:javascript:|onerror|<script)/i.test(source)) {
    f.push({ id: 'JS-BLACKLIST', severity: 'info', title: `${label}: 블랙리스트 방식으로 보이는 이스케이프/정화 함수 (허용 목록·프레임워크 이스케이프 권장)` });
  }
  const sinks = (source.match(/\.innerHTML\s*=|v-html|\.html\(|insertAdjacentHTML|document\.write\(/g) ?? []).length;
  if (sinks) f.push({ id: 'JS-HTML-SINK', severity: 'info', title: `${label}: HTML 삽입 구문 ${sinks}건 — 신뢰할 수 없는 입력이 도달하는지 추적 필요` });
  if (/localStorage\.setItem\([^)]*(?:token|jwt|auth)/i.test(source)) {
    f.push({ id: 'JS-TOKEN-STORAGE', severity: 'info', title: `${label}: 토큰으로 보이는 값을 localStorage에 저장 (XSS 시 탈취 위험)` });
  }
  return f;
}

// ---------- 수집 ----------

async function get(url, state) {
  if (state.count >= MAX_REQUESTS) throw new Error('요청 수 상한 도달');
  if (state.count) await delay(1000);
  state.count++;
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'site-audit/1.0 (authorized passive review)' } });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BODY) throw new Error(`응답이 ${MAX_BODY} 바이트 초과: ${url}`);
  if (res.status === 429 || res.status >= 500) state.stop = `${url} → ${res.status}`;
  return {
    url, status: res.status,
    headers: Object.fromEntries([...res.headers].filter(([k]) => k !== 'set-cookie')),
    setCookies: res.headers.getSetCookie(),
    body: buf.toString('utf8'),
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
}

export async function audit({ target, paths }) {
  const base = new URL(target);
  const state = { count: 0, stop: null };
  const findings = [];
  const records = [];
  const add = (page, list) => list.forEach(x => findings.push({ ...x, where: page }));

  // HTTPS → HTTP 전환 확인 (https 대상이면 http 홈 1회)
  if (base.protocol === 'https:') {
    const plain = new URL('/', base); plain.protocol = 'http:';
    try {
      const r = await get(plain.href, state);
      const loc = r.headers.location ?? '';
      if (!(r.status >= 300 && r.status < 400 && loc.startsWith('https://'))) {
        add(plain.href, [{ id: 'TLS-REDIRECT', severity: 'medium', title: `HTTP 요청이 HTTPS로 리다이렉트되지 않음 (status ${r.status})` }]);
      }
      records.push({ url: r.url, status: r.status, sha256: r.sha256 });
    } catch (e) { findings.push({ id: 'ERR', severity: 'info', where: plain.href, title: `HTTP 확인 실패: ${e.message}` }); }
  }

  const scripts = new Set();
  for (const p of paths) {
    if (state.stop) break;
    const url = new URL(p, base);
    if (url.origin !== base.origin) continue;
    let r;
    try { r = await get(url.href, state); } catch (e) { findings.push({ id: 'ERR', severity: 'info', where: url.href, title: e.message }); continue; }
    records.push({ url: r.url, status: r.status, sha256: r.sha256 });
    const isHtml = (r.headers['content-type'] ?? '').includes('html');
    add(r.url, checkHeaders(r.headers));
    add(r.url, checkHeaderQuality(r.headers));
    add(r.url, checkCaching(r.headers, url.pathname));
    if (base.protocol !== 'https:') findings.push({ id: 'HDR-HSTS-NA', severity: 'info', where: r.url, title: 'HTTP 대상이므로 HSTS는 평가하지 않음' });
    add(r.url, checkCookies(r.setCookies, base.protocol === 'https:'));
    if (isHtml) {
      const srcs = extractScriptSrcs(r.body);
      add(r.url, checkDuplicateJquery(srcs));
      add(r.url, checkInternalAddresses(r.body));
      add(r.url, checkExternalResources(r.body, base.origin));
      add(r.url, checkMixedContent(r.body, base.protocol === 'https:'));
      add(r.url, checkRiskyPatterns(r.body, 'inline'));
      for (const s of srcs) {
        const u = new URL(s, url);
        if (u.origin === base.origin) scripts.add(u.href); // 외부 도메인 스크립트는 가져가지 않음
      }
    }
  }
  for (const s of scripts) {
    if (state.stop) break;
    try {
      const r = await get(s, state);
      records.push({ url: r.url, status: r.status, sha256: r.sha256 });
      const lib = detectLibraryVersion(r.body);
      if (lib?.name === 'jquery' && jqueryVulnerable(lib.version)) {
        findings.push({ id: 'LIB-JQ-OLD', severity: 'medium', where: s, title: `jQuery ${lib.version.join('.')} — CVE-2020-11022/11023 영향 범위(<3.5.0). 신뢰할 수 없는 HTML이 .html()/.append()에 전달될 때만 악용 가능` });
      }
      add(s, checkRiskyPatterns(r.body, new URL(s).pathname));
    } catch (e) { findings.push({ id: 'ERR', severity: 'info', where: s, title: e.message }); }
  }
  const seen = new Set();
  for (let i = findings.length - 1; i >= 0; i--) {
    const k = `${findings[i].id}|${findings[i].where}|${findings[i].title}`;
    if (seen.has(k)) findings.splice(i, 1); else seen.add(k);
  }
  if (state.stop) findings.push({ id: 'STOPPED', severity: 'info', where: '-', title: `서버 오류/제한 응답으로 점검 중지: ${state.stop}` });
  return { target: base.origin, at: new Date().toISOString(), requests: state.count, records, findings };
}

export function toMarkdown(result) {
  const order = { medium: 0, low: 1, info: 2 };
  const rows = [...result.findings].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
    .map(x => `| ${x.id} | ${x.severity} | ${x.title} | ${x.where} |`).join('\n');
  return `# 공개 응답 보안 점검 결과

- 대상: ${result.target}
- 수집 시각: ${result.at}
- 요청 수: ${result.requests}

> 수동 점검 결과입니다. 취약점 악용을 시도하지 않았으며, 심각도는 수정 우선순위를 위한 잠정 값입니다.
> 발견이 없다고 안전하다는 뜻이 아닙니다. 로그인·접근제어·서버 입력 검증은 점검 범위 밖입니다.

| ID | 잠정 위험도 | 내용 | 위치 |
|---|---|---|---|
${rows || '| - | - | 발견 사항 없음 | - |'}

## 응답 증적

| URL | 상태 | SHA-256 |
|---|---|---|
${result.records.map(r => `| ${r.url} | ${r.status} | ${r.sha256} |`).join('\n')}
`;
}

// ---------- CLI ----------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      target: { type: 'string' },
      paths: { type: 'string', default: '/' },
      out: { type: 'string' },
      json: { type: 'string' },
      'fail-on': { type: 'string', default: 'medium' },
      'i-am-authorized': { type: 'boolean', default: false },
    },
  });
  if (!values.target) { console.error('--target <URL> 필요'); process.exit(2); }
  if (!values['i-am-authorized']) {
    console.error('점검 허가를 받은 대상에만 사용하세요. 확인했다면 --i-am-authorized 를 추가하세요.');
    process.exit(2);
  }
  const result = await audit({ target: values.target, paths: values.paths.split(',').map(s => s.trim()).filter(Boolean) });
  const md = toMarkdown(result);
  if (values.out) await writeFile(values.out, md); else console.log(md);
  if (values.json) await writeFile(values.json, JSON.stringify(result, null, 2));
  const rank = { info: 0, low: 1, medium: 2, none: 99 };
  const threshold = rank[values['fail-on']] ?? 2;
  process.exit(result.findings.some(f => (rank[f.severity] ?? 0) >= threshold) ? 1 : 0);
}
