import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { audit, checkHeaderQuality, checkCaching, checkExternalResources, checkMixedContent, checkHeaders, checkCookies, detectLibraryVersion, jqueryVulnerable, checkInternalAddresses, checkRiskyPatterns } from './site-audit.mjs';

test('헤더 누락 탐지', () => {
  const ids = checkHeaders({}).map(f => f.id);
  assert.ok(ids.includes('HDR-FRAME') && ids.includes('HDR-CSP'));
  assert.ok(!checkHeaders({ 'content-security-policy': "frame-ancestors 'none'" }).some(f => f.id === 'HDR-FRAME'));
});

test('쿠키 속성', () => {
  assert.equal(checkCookies(['sid=1; Path=/'], true).length, 1);
  assert.equal(checkCookies(['sid=1; Secure; HttpOnly; SameSite=Lax'], true).length, 0);
});

test('jQuery 버전', () => {
  const v = detectLibraryVersion('/*! jQuery v1.12.4 | (c) */');
  assert.deepEqual(v.version, [1, 12, 4]);
  assert.ok(jqueryVulnerable([1, 12, 4]));
  assert.ok(!jqueryVulnerable([3, 7, 1]));
});

test('내부 주소·패턴', () => {
  assert.equal(checkInternalAddresses('api: http://10.0.0.5:8080/x').length, 1);
  assert.equal(checkInternalAddresses('https://example.com').length, 0);
  assert.ok(checkRiskyPatterns('s.replace(/"/g,"&qout;")', 'x').some(f => f.id === 'JS-ENTITY-TYPO'));
});

test('로컬 서버 통합 점검 (같은 origin만 접근)', async () => {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    if (req.url === '/') {
      res.setHeader('content-type', 'text/html');
      res.setHeader('set-cookie', 'sid=abc; Path=/');
      res.end('<script src="/jquery-3.7.1.js"></script><script src="/jquery-1.12.4.js"></script><script src="https://evil.invalid/x.js"></script>');
    } else if (req.url === '/jquery-3.7.1.js') res.end('/*! jQuery v3.7.1 */');
    else if (req.url === '/jquery-1.12.4.js') res.end('/*! jQuery v1.12.4 */');
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const result = await audit({ target: `http://127.0.0.1:${server.address().port}`, paths: ['/'] });
    const ids = result.findings.map(f => f.id);
    for (const id of ['HDR-FRAME', 'LIB-JQ-DUP', 'LIB-JQ-OLD', 'COOKIE']) assert.ok(ids.includes(id), id);
    assert.ok(!hits.some(h => h.includes('evil')));
  } finally { server.close(); }
});

test('헤더 품질: CSP/HSTS/버전/CORS', () => {
  const ids = checkHeaderQuality({
    'content-security-policy': "default-src *; script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    'strict-transport-security': 'max-age=100',
    server: 'nginx/1.18.0',
    'access-control-allow-origin': '*',
    'access-control-allow-credentials': 'true',
  }).map(f => f.id);
  for (const id of ['CSP-UNSAFE-INLINE', 'CSP-UNSAFE-EVAL', 'CSP-WILDCARD', 'HSTS-SHORT', 'INFO-VERSION', 'CORS-WILDCARD-CRED']) assert.ok(ids.includes(id), id);
  assert.equal(checkHeaderQuality({ 'strict-transport-security': 'max-age=31536000', server: 'nginx' }).length, 0);
});

test('캐시/SRI/혼합 콘텐츠', () => {
  assert.equal(checkCaching({}, '/login').length, 1);
  assert.equal(checkCaching({ 'cache-control': 'no-store' }, '/login').length, 0);
  assert.equal(checkCaching({}, '/company').length, 0);
  const html = '<script src="https://cdn.example/a.js"></script><script src="https://cdn.example/b.js" integrity="sha384-x"></script><img src="http://x.example/i.png">';
  assert.equal(checkExternalResources(html, 'https://site.example').length, 1);
  assert.equal(checkMixedContent(html, true).length, 1);
  assert.equal(checkMixedContent(html, false).length, 0);
});
