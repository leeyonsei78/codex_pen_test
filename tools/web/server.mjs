#!/usr/bin/env node
// 사이트 주소를 입력받아 site-audit 점검을 실행하는 웹 UI/API.
//
//   node tools/web/server.mjs                  # http://127.0.0.1:8787
//   node tools/web/server.mjs --port 9000
//   node tools/web/server.mjs --allow-private  # 본인 개발 환경(localhost 등) 점검 허용
//
// 안전 장치: 기본 127.0.0.1 바인딩, 허가 확인 체크박스 필수, SSRF 차단(내부망/예약 주소, DNS 리바인딩 포함),
// 동일 출처 요청만 허용(CSRF), 동시 1건, IP당 10분 5회, baseline 업로드 크기 제한, 엄격한 CSP.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { audit, diffFindings, toMarkdown, isBlockedHostname } from '../site-audit.mjs';

const PUBLIC = new URL('./public/', import.meta.url);
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};
const MAX_BODY = 2 * 1024 * 1024;
const MAX_PATHS = 5;

const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'cross-origin-resource-policy': 'same-origin',
};

export function validateScanRequest(body, { allowPrivate }) {
  if (body?.authorized !== true) return '점검 허가 확인이 필요합니다';
  let url;
  try { url = new URL(String(body.target ?? '')); } catch { return '올바른 주소가 아닙니다'; }
  if (String(body.target).length > 2048) return '주소가 너무 깁니다';
  if (!['http:', 'https:'].includes(url.protocol)) return 'http/https 주소만 가능합니다';
  if (url.username || url.password) return '주소에 계정 정보를 넣을 수 없습니다';
  if (!allowPrivate && isBlockedHostname(url.hostname)) return '내부망/로컬 주소는 점검할 수 없습니다';
  let paths = body.paths ?? ['/'];
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_PATHS) return `경로는 1~${MAX_PATHS}개여야 합니다`;
  paths = paths.map(p => String(p).trim());
  if (paths.some(p => !/^\/(?!\/)[^\s]{0,199}$/.test(p))) return "경로는 '/'로 시작하는 200자 이하 값이어야 합니다";
  if (body.baseline != null && (typeof body.baseline !== 'object' || !Array.isArray(body.baseline.findings))) return 'baseline 형식이 올바르지 않습니다';
  return { target: url.origin, paths };
}

export function createAuditServer({ allowPrivate = false, rateLimit = { max: 5, windowMs: 10 * 60 * 1000 }, scan = audit } = {}) {
  const hits = new Map();
  let busy = false;

  const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': type });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  const limited = ip => {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter(t => now - t < rateLimit.windowMs);
    if (recent.length >= rateLimit.max) { hits.set(ip, recent); return true; }
    recent.push(now); hits.set(ip, recent);
    return false;
  };

  const readJson = req => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('요청이 너무 큽니다'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('JSON 형식이 올바르지 않습니다'), { status: 400 })); } });
    req.on('error', reject);
  });

  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (req.method === 'GET' && STATIC[path]) {
        const [file, type] = STATIC[path];
        return send(res, 200, await readFile(new URL(file, PUBLIC)), type);
      }
      if (req.method === 'POST' && path === '/api/scan') {
        // CSRF/DNS 리바인딩 방어: 브라우저가 보낸 Origin이 Host와 같아야 한다. Origin 없는 요청은 JSON 전용으로만 허용.
        const origin = req.headers.origin;
        if (origin) {
          let ok = false;
          try { ok = new URL(origin).host === req.headers.host; } catch {}
          if (!ok) return send(res, 403, { error: '허용되지 않은 출처입니다' });
        }
        if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { error: 'application/json 필요' });
        const body = await readJson(req);
        const v = validateScanRequest(body, { allowPrivate });
        if (typeof v === 'string') return send(res, 400, { error: v });
        if (limited(req.socket.remoteAddress)) return send(res, 429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요' });
        if (busy) return send(res, 503, { error: '다른 점검이 진행 중입니다. 잠시 후 다시 시도하세요' });
        busy = true;
        try {
          const result = await scan({ target: v.target, paths: v.paths, allowPrivate });
          if (body.baseline) result.diff = diffFindings(body.baseline, result);
          return send(res, 200, { result, markdown: toMarkdown(result) });
        } finally { busy = false; }
      }
      send(res, 404, { error: 'Not found' });
    } catch (e) {
      send(res, e.status ?? 500, { error: e.status ? e.message : '서버 오류' });
    }
  });
  server.requestTimeout = 120000;
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '8787' },
    'allow-private': { type: 'boolean', default: false },
  } });
  const server = createAuditServer({ allowPrivate: values['allow-private'] });
  server.listen(Number(values.port), values.host, () => {
    console.log(`site-audit 웹 UI: http://${values.host}:${values.port}`);
    if (values.host !== '127.0.0.1' && values.host !== 'localhost') {
      console.warn('경고: 외부에 노출하면 누구나 이 서버를 통해 요청을 보낼 수 있습니다. 인증/프록시 뒤에서만 사용하세요.');
    }
  });
}
