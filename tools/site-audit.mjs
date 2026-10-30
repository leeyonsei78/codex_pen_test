#!/usr/bin/env node
// 공개 응답 수동(passive) 보안 점검 도구. Node.js 22+, 외부 패키지 없음.
//
// 사용 예:
//   node tools/site-audit.mjs --target https://example.com --i-am-authorized
//   node tools/site-audit.mjs --target http://127.0.0.1:8080 --paths /,/login --out report.md
//   --baseline prev.json       : 이전 --json 결과와 비교해 신규/해결/유지 표시 (종료 코드는 신규 발견만 기준)
//   --snapshot responses.json  : 저장된 증적(audit/evidence/responses.json)을 오프라인 분석 (네트워크 요청 없음, 허가 플래그 불필요)
//   --allow-private            : localhost/사설망 대상 허용 (기본은 차단, 본인 개발 환경 점검용)
//   --fail-on low|medium|none  : 해당 위험도 이상 발견 시 종료 코드 1 (기본 medium)
//
// 안전 장치: 점검 허가를 확인하는 --i-am-authorized 필수, GET만 사용, 쿠키/인증정보 미전송,
// 리다이렉트 미추적, 같은 origin만 접근, 요청 간 1초 이상 간격, 요청 20초/응답 3MiB/총 요청 수 제한,
// 429/5xx 시 중지. 크롤링·경로 대입·공격 문자열 전송·폼 제출은 하지 않습니다.
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import dns from 'node:dns';
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
  if (!headers['permissions-policy']) f.push({ id: 'HDR-PERMISSIONS', severity: 'low', title: 'Permissions-Policy 헤더 없음 (카메라·마이크·위치 등 불필요한 브라우저 기능 제한)' });
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

// URL 형태(scheme://host)만 검사해 `host.includes('localhost')` 같은 코드 비교 오탐을 피한다. \u002F 이스케이프도 해석한다.
const INTERNAL_URL = /https?:\/\/(?:[^\s"'<>\/@]*@)?(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|[\w.-]+\.(?:internal|local|intra|corp|svc(?:\.cluster\.local)?))(?::\d+)?/gi;

export function checkInternalAddresses(html) {
  const text = html.replace(/\\u002F/gi, '/');
  const hits = [...new Set([...text.matchAll(INTERNAL_URL)].map(m => m[0]))];
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

export function isPrivateAddress(ip) {
  const addr = ip.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19));
  }
  if (net.isIPv6(addr)) {
    if (addr === '::' || addr === '::1') return true;
    const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
    if (dotted) return isPrivateAddress(dotted[1]);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(addr);
    if (hex) {
      const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return /^f[cd]/.test(addr) || /^fe[89ab]/.test(addr) || addr.startsWith('64:ff9b:') || addr.startsWith('ff');
  }
  return true; // 알 수 없는 형식은 차단
}

export function isBlockedHostname(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  return net.isIP(host) !== 0 && isPrivateAddress(host);
}

// DNS 리바인딩 방지: 실제 연결에 쓰이는 주소를 연결 시점에 검사한다.
function guardedLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return cb(err);
    const list = Array.isArray(address) ? address : [{ address, family }];
    const bad = list.find(x => isPrivateAddress(x.address));
    if (bad) return cb(Object.assign(new Error(`내부망/예약 주소(${bad.address}) 접근 차단`), { code: 'EBLOCKED' }));
    cb(null, address, family);
  });
}

function get(url, state) {
  const u = new URL(url);
  if (!state.allowPrivate && isBlockedHostname(u.hostname)) {
    return Promise.reject(new Error(`내부망/로컬 주소 접근 차단: ${u.hostname}`));
  }
  if (state.count >= MAX_REQUESTS) return Promise.reject(new Error('요청 수 상한 도달'));
  const first = state.count === 0;
  state.count++;
  return (first ? Promise.resolve() : delay(1000)).then(() => new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, {
      method: 'GET',
      headers: { 'user-agent': 'site-audit/1.0 (authorized passive review)' },
      lookup: state.allowPrivate ? undefined : guardedLookup,
    }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', c => {
        size += c.length;
        if (size > MAX_BODY) { req.destroy(new Error(`응답이 ${MAX_BODY} 바이트 초과: ${url}`)); return; }
        chunks.push(c);
      });
      res.on('error', reject);
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const { 'set-cookie': setCookies = [], ...headers } = res.headers;
        if (res.statusCode === 429 || res.statusCode >= 500) state.stop = `${url} → ${res.statusCode}`;
        resolve({
          url, status: res.statusCode, headers, setCookies,
          body: buf.toString('utf8'),
          sha256: createHash('sha256').update(buf).digest('hex'),
        });
      });
    });
    const timer = setTimeout(() => req.destroy(new Error(`시간 초과(20초): ${url}`)), 20000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end();
  }));
}

export async function audit({ target, paths, allowPrivate = false }) {
  const state = { count: 0, stop: null, allowPrivate };
  return analyze({ target, paths, fetchRecord: url => get(url, state), state });
}

// 수집 방식과 분석을 분리: fetchRecord(url) → {url,status,headers,setCookies,body,sha256}
export async function analyze({ target, paths, fetchRecord, state = { count: 0, stop: null }, observedAt }) {
  const base = new URL(target);
  const get = (url) => fetchRecord(url);
  const findings = [];
  const records = [];
  const add = (page, list) => list.forEach(x => findings.push({ ...x, where: page }));

  // HTTPS → HTTP 전환 확인 (https 대상이면 http 홈 1회)
  if (base.protocol === 'https:') {
    const plain = new URL('/', base); plain.protocol = 'http:';
    try {
      const r = await get(plain.href);
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
    try { r = await get(url.href); } catch (e) { findings.push({ id: 'ERR', severity: 'info', where: url.href, title: e.message }); continue; }
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
      const r = await get(s);
      records.push({ url: r.url, status: r.status, sha256: r.sha256 });
      const lib = detectLibraryVersion(r.body);
      if (lib?.name === 'jquery' && jqueryVulnerable(lib.version)) {
        findings.push({ id: 'LIB-JQ-OLD', severity: 'medium', where: s, title: `jQuery ${lib.version.join('.')} — CVE-2020-11022/11023 영향 범위(<3.5.0). 신뢰할 수 없는 HTML이 .html()/.append()에 전달될 때만 악용 가능` });
      }
      if (!lib) add(s, checkRiskyPatterns(r.body, new URL(s).pathname)); // 알려진 라이브러리 자체 코드는 제외
    } catch (e) { findings.push({ id: 'ERR', severity: 'info', where: s, title: e.message }); }
  }
  const seen = new Set();
  for (let i = findings.length - 1; i >= 0; i--) {
    const k = `${findings[i].id}|${findings[i].where}|${findings[i].title}`;
    if (seen.has(k)) findings.splice(i, 1); else seen.add(k);
  }
  if (state.stop) findings.push({ id: 'STOPPED', severity: 'info', where: '-', title: `서버 오류/제한 응답으로 점검 중지: ${state.stop}` });
  return { target: base.origin, at: observedAt ?? new Date().toISOString(), requests: state.count, records, findings };
}

// 이전 결과(JSON)와 비교. 키는 id + 위치. ERR/STOPPED는 일시적 오류라 비교 대상에서 제외한다.
export function diffFindings(previous, current) {
  if (!previous || !Array.isArray(previous.findings)) throw new Error('baseline에 findings 배열이 없습니다');
  const key = f => `${f.id}|${f.where}`;
  const comparable = list => list.filter(f => f.id !== 'ERR' && f.id !== 'STOPPED');
  const prevMap = new Map(comparable(previous.findings).map(f => [key(f), f]));
  const currMap = new Map(comparable(current.findings).map(f => [key(f), f]));
  return {
    new: [...currMap].filter(([k]) => !prevMap.has(k)).map(([, f]) => f),
    resolved: [...prevMap].filter(([k]) => !currMap.has(k)).map(([, f]) => f),
    unchanged: [...currMap].filter(([k]) => prevMap.has(k)).map(([, f]) => f),
    incomplete: current.findings.some(f => f.id === 'ERR' || f.id === 'STOPPED'),
    targetChanged: Boolean(previous.target) && previous.target !== current.target,
    previousAt: previous.at ?? null,
  };
}

// 저장된 증적(audit/evidence/responses.json 형식)을 오프라인으로 분석한다. 네트워크 요청 없음.
export async function auditSnapshot(responsesFile, { target, paths }) {
  const records = JSON.parse(await readFile(responsesFile, 'utf8'));
  const dir = dirname(resolve(responsesFile));
  const byUrl = new Map(records.map(r => [r.url, r]));
  const fetchRecord = async url => {
    const r = byUrl.get(url);
    if (!r) throw new Error('저장된 증적에 없음');
    return {
      url: r.url, status: r.status, headers: r.headers ?? {},
      setCookies: (r.cookies ?? []).map(c => [`${c.name}=x`, ...(c.attributes ?? [])].join('; ')),
      body: r.bodyFile ? await readFile(join(dir, basename(r.bodyFile)), 'utf8') : '',
      sha256: r.sha256,
    };
  };
  const times = records.map(r => r.at).filter(Boolean).sort();
  const result = await analyze({ target, paths, fetchRecord, state: { count: 0, stop: null }, observedAt: times[0] });
  result.requests = 0;
  result.source = `snapshot:${responsesFile}`;
  result.findings = result.findings.filter(f => !(f.id === 'ERR' && /저장된 증적에 없음/.test(f.title)));
  return result;
}

// 발견 ID별 조치 가이드: 담당 / 조치 / 검증. IT·보안팀 전달용.
export const REMEDIATION = {
  'HDR-FRAME': { owner: '인프라/CDN/웹서버', fix: "최종 응답 계층(CDN·WAF·웹서버 중 한 곳)에서 `Content-Security-Policy: frame-ancestors 'self'`와 `X-Frame-Options: SAMEORIGIN` 적용(프레임 불필요 시 'none'/DENY). 제휴 iframe이 필요하면 정확한 HTTPS origin만 허용.", verify: '`curl -sI <URL>`로 두 헤더 확인, 허용 안 된 origin의 iframe이 브라우저에서 차단되는지 확인' },
  'HDR-CSP': { owner: '프론트엔드 + 보안팀', fix: '먼저 `Content-Security-Policy-Report-Only`로 배포해 위반 보고를 수집하고, 인라인 스크립트는 nonce/hash로 전환한 뒤 enforce. 외부 분석/인증 연동 도메인을 허용 목록에 반영.', verify: '위반 보고가 정상 기능에서 0건이 된 뒤 enforce 전환, 본 도구로 CSP-* 항목 재점검' },
  'HDR-HSTS': { owner: '인프라/CDN', fix: '`Strict-Transport-Security: max-age=31536000; includeSubDomains` 적용(preload는 모든 하위 도메인 HTTPS 확인 후).', verify: '`curl -sI https://<host>`' },
  'HDR-NOSNIFF': { owner: '인프라/웹서버', fix: '`X-Content-Type-Options: nosniff` 추가.', verify: '`curl -sI`' },
  'HDR-REFERRER': { owner: '인프라/웹서버', fix: '`Referrer-Policy: strict-origin-when-cross-origin`(또는 더 엄격) 적용. URL에 민감값이 있으면 코드에서도 제거.', verify: '`curl -sI`' },
  'HDR-PERMISSIONS': { owner: '인프라/웹서버', fix: '`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` 등 사용하지 않는 기능을 비활성화(본인인증·전자서명 등 필요한 기능은 제외).', verify: '`curl -sI`, 해당 기능 회귀 테스트' },
  'CSP-UNSAFE-INLINE': { owner: '프론트엔드', fix: "인라인 스크립트를 외부 파일로 옮기거나 nonce/hash를 사용하고 'unsafe-inline' 제거.", verify: 'Report-Only 위반 0건 확인 후 enforce' },
  'CSP-UNSAFE-EVAL': { owner: '프론트엔드', fix: "eval/new Function 사용 라이브러리를 교체하거나 빌드 설정을 변경해 'unsafe-eval' 제거.", verify: 'CSP 적용 후 콘솔 오류 확인' },
  'CSP-WILDCARD': { owner: '보안팀', fix: 'script-src/default-src의 `*` 제거, 필요한 도메인만 명시.', verify: '본 도구 재점검' },
  'CSP-NO-SCRIPT': { owner: '보안팀', fix: 'default-src 또는 script-src 지시문 추가.', verify: '본 도구 재점검' },
  'HSTS-SHORT': { owner: '인프라/CDN', fix: 'max-age를 15552000(180일) 이상, 권장 31536000으로 상향.', verify: '`curl -sI`' },
  'INFO-VERSION': { owner: '인프라', fix: 'Server/X-Powered-By 등의 버전 표기 제거 또는 일반화.', verify: '`curl -sI`' },
  'CORS-WILDCARD-CRED': { owner: '백엔드', fix: 'Allow-Origin을 신뢰하는 origin 허용 목록으로 제한하고 `*`와 credentials 동시 사용 금지.', verify: '허용되지 않은 Origin 헤더로 요청 시 거부되는지 확인' },
  'CORS-WILDCARD': { owner: '백엔드', fix: '공개 리소스가 아니면 허용 origin을 제한.', verify: '`curl -sI -H "Origin: https://example.org"`' },
  'CACHE-SENSITIVE': { owner: '인프라/백엔드', fix: '인증·개인정보 페이지에 `Cache-Control: no-store` 적용(CDN 캐시 규칙 포함).', verify: '`curl -sI` 후 CDN 캐시 상태 헤더 확인' },
  'SRI-MISSING': { owner: '프론트엔드', fix: '외부 도메인 스크립트/스타일에 integrity+crossorigin 추가하거나 자체 호스팅. 동적으로 바뀌는 서드파티 태그는 SRI가 불가하므로 CSP와 공급자 관리를 병행.', verify: '페이지 로드 시 SRI 오류 없음' },
  'MIXED-CONTENT': { owner: '프론트엔드', fix: 'http:// 리소스를 https:// 로 변경하고 `upgrade-insecure-requests` 고려.', verify: '브라우저 콘솔 혼합 콘텐츠 경고 0건' },
  'COOKIE': { owner: '백엔드/인프라', fix: '세션·인증 쿠키는 Secure; HttpOnly; SameSite=Lax(또는 Strict) 설정. 로드밸런서(AWSALB 등) 쿠키는 장비 설정에서 속성을 조정하거나 위험 평가 후 예외로 문서화.', verify: '`curl -sI`의 Set-Cookie 속성' },
  'COOKIE-NONE-INSECURE': { owner: '백엔드/인프라', fix: 'SameSite=None 쿠키에는 반드시 Secure를 함께 설정.', verify: '`curl -sI`' },
  'TLS-REDIRECT': { owner: '인프라/CDN', fix: 'HTTP→HTTPS 301 리다이렉트 적용.', verify: '`curl -sI http://<host>`' },
  'CFG-INTERNAL': { owner: '프론트엔드/백엔드', fix: '내부 서비스 주소를 서버 전용 설정으로 분리하고 HTML·SSR 상태·클라이언트 번들에 직렬화하지 않음(Nuxt: privateRuntimeConfig). 이미 노출된 값이 외부에서 접근 가능한지 네트워크 정책 확인.', verify: '페이지 소스에 내부 주소가 없는지 본 도구로 재점검' },
  'LIB-JQ-DUP': { owner: '프론트엔드', fix: 'HTML 템플릿/Nuxt head/CMS 삽입 코드에서 중복 jQuery 참조를 제거하고 한 버전만 로드.', verify: '네트워크 탭에서 jQuery 1회 로드, 관련 플러그인 회귀 테스트' },
  'LIB-JQ-OLD': { owner: '프론트엔드', fix: 'jQuery 3.5.0 이상(현재 3.7.1)으로 통일하고 1.x 제거. 레거시 플러그인은 호환 버전으로 교체.', verify: '본 도구 재점검, 브라우저 `jQuery.fn.jquery` 확인' },
  'JS-ENTITY-TYPO': { owner: '프론트엔드', fix: "`&qout;`을 `&quot;`로 수정하고, 자체 이스케이프 함수 대신 프레임워크 기본 이스케이프 사용. 치환 순서는 `&`를 먼저 처리.", verify: '단위 테스트(audit/fixes/safe-html.mjs 참고)' },
  'JS-BLACKLIST': { owner: '프론트엔드', fix: '블랙리스트 방식 정화를 제거하고 텍스트는 textContent/프레임워크 이스케이프, 필요한 HTML만 검증된 sanitizer 허용 목록으로 처리.', verify: 'XSS 회귀 테스트' },
  'JS-HTML-SINK': { owner: '프론트엔드', fix: 'v-html/innerHTML에 들어가는 값의 출처를 추적하고, 서버 오류 메시지·쿼리 값·CMS 값은 텍스트로 출력.', verify: '코드 리뷰 + XSS 회귀 테스트' },
  'JS-TOKEN-STORAGE': { owner: '프론트엔드/백엔드', fix: '가능하면 인증 토큰을 HttpOnly+Secure+SameSite 쿠키로 이전하고, 불가하면 CSP 강화와 토큰 수명 단축으로 XSS 시 피해를 줄임.', verify: '로그인 흐름 회귀 테스트' },
};

export function toMarkdown(result) {
  const order = { medium: 0, low: 1, info: 2 };
  const rows = [...result.findings].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
    .map(x => `| ${x.id} | ${x.severity} | ${x.title} | ${x.where} |`).join('\n');
  const ids = [...new Set(result.findings.map(f => f.id))].filter(id => REMEDIATION[id]);
  const guideSection = ids.length ? `## 조치 가이드 (IT·보안팀 전달용)\n\n| ID | 담당 | 조치 | 검증 |\n|---|---|---|---|\n${ids.map(id => `| ${id} | ${REMEDIATION[id].owner} | ${REMEDIATION[id].fix} | ${REMEDIATION[id].verify} |`).join('\n')}\n\n` : '';
  const d = result.diff;
  const diffSection = d ? `## 이전 점검 대비 변화 (기준: ${d.previousAt ?? '시각 미상'})

- 신규 ${d.new.length}건 / 해결 ${d.resolved.length}건 / 유지 ${d.unchanged.length}건
${d.targetChanged ? '- 경고: 기준 결과와 대상이 다릅니다.\n' : ''}${d.incomplete ? '- 경고: 이번 점검에서 일부 요청이 실패하거나 중지되어 "해결" 판정이 부정확할 수 있습니다.\n' : ''}
| 구분 | ID | 위험도 | 내용 | 위치 |
|---|---|---|---|---|
${[...d.new.map(x => ['신규', x]), ...d.resolved.map(x => ['해결', x])].map(([t, x]) => `| ${t} | ${x.id} | ${x.severity} | ${x.title} | ${x.where} |`).join('\n') || '| - | - | - | 변화 없음 | - |'}

` : '';
  return `# 공개 응답 보안 점검 결과

- 대상: ${result.target}
- 수집 시각: ${result.at}
- 요청 수: ${result.requests}

> 수동 점검 결과입니다. 취약점 악용을 시도하지 않았으며, 심각도는 수정 우선순위를 위한 잠정 값입니다.
> 발견이 없다고 안전하다는 뜻이 아닙니다. 로그인·접근제어·서버 입력 검증은 점검 범위 밖입니다.

${diffSection}## 전체 발견 사항

| ID | 잠정 위험도 | 내용 | 위치 |
|---|---|---|---|
${rows || '| - | - | 발견 사항 없음 | - |'}

${guideSection}## 응답 증적

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
      baseline: { type: 'string' },
      snapshot: { type: 'string' },
      'allow-private': { type: 'boolean', default: false },
      'i-am-authorized': { type: 'boolean', default: false },
    },
  });
  if (!values.target) { console.error('--target <URL> 필요'); process.exit(2); }
  if (!values['i-am-authorized'] && !values.snapshot) {
    console.error('점검 허가를 받은 대상에만 사용하세요. 확인했다면 --i-am-authorized 를 추가하세요.');
    process.exit(2);
  }
  const paths = values.paths.split(',').map(s => s.trim()).filter(Boolean);
  const result = values.snapshot
    ? await auditSnapshot(values.snapshot, { target: values.target, paths })
    : await audit({ target: values.target, paths, allowPrivate: values['allow-private'] });
  if (values.baseline) result.diff = diffFindings(JSON.parse(await readFile(values.baseline, 'utf8')), result);
  const md = toMarkdown(result);
  if (values.out) await writeFile(values.out, md); else console.log(md);
  if (values.json) await writeFile(values.json, JSON.stringify(result, null, 2));
  const rank = { info: 0, low: 1, medium: 2, none: 99 };
  const threshold = rank[values['fail-on']] ?? 2;
  // --baseline 사용 시에는 이전에 없던 신규 발견만 종료 코드에 반영한다.
  const judged = result.diff ? result.diff.new : result.findings;
  process.exit(judged.some(f => (rank[f.severity] ?? 0) >= threshold) ? 1 : 0);
}
