import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { auditSnapshot, REMEDIATION, audit, diffFindings, toMarkdown, isPrivateAddress, isBlockedHostname, checkHeaderQuality, checkCaching, checkExternalResources, checkMixedContent, checkHeaders, checkCookies, detectLibraryVersion, jqueryVulnerable, checkInternalAddresses, checkRiskyPatterns } from './site-audit.mjs';

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
  assert.equal(checkInternalAddresses("if (!host.includes('localhost')) {}").length, 0, '코드 비교는 오탐');
  assert.equal(checkInternalAddresses('"http:\\u002F\\u002Fldc-api-common.service-ldc.svc:8080"').length, 1, '이스케이프된 내부 서비스 주소');
  assert.equal(checkInternalAddresses('http://localhost:3000/api').length, 1);
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
    const result = await audit({ target: `http://127.0.0.1:${server.address().port}`, paths: ['/'], allowPrivate: true });
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

test('사설/예약 주소 판정', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:7f00:1', '::ffff:10.0.0.1', '[::1]']) {
    assert.ok(isPrivateAddress(ip), ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
  assert.ok(isBlockedHostname('localhost') && isBlockedHostname('a.localhost') && isBlockedHostname('[::1]'));
  assert.ok(!isBlockedHostname('example.com'));
});

test('기본값은 로컬 대상 차단', async () => {
  const r = await audit({ target: 'http://127.0.0.1:9', paths: ['/'] });
  assert.ok(r.findings.some(f => f.id === 'ERR' && /차단/.test(f.title)));
  assert.equal(r.requests, 0);
});

test('baseline 비교', () => {
  const f = (id, where) => ({ id, where, severity: 'low', title: id });
  const prev = { target: 'https://a', at: 'T0', findings: [f('A', '/'), f('B', '/'), f('ERR', '/x')] };
  const curr = { target: 'https://a', findings: [f('B', '/'), f('C', '/')] };
  const d = diffFindings(prev, curr);
  assert.deepEqual(d.new.map(x => x.id), ['C']);
  assert.deepEqual(d.resolved.map(x => x.id), ['A']);
  assert.deepEqual(d.unchanged.map(x => x.id), ['B']);
  assert.equal(d.incomplete, false);
  assert.equal(diffFindings(prev, { target: 'https://b', findings: [f('ERR', '/')] }).incomplete, true);
  assert.throws(() => diffFindings({}, curr));
  const md = toMarkdown({ target: 'https://a', at: 'T1', requests: 1, records: [], findings: curr.findings, diff: d });
  assert.match(md, /신규 1건 \/ 해결 1건 \/ 유지 1건/);
});

test('스냅샷 오프라인 분석과 조치 가이드', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'snap-'));
  try {
    await writeFile(join(dir, 'R01.html'), '<script src="/lib/jquery-3.7.1.js"></script><script src="/lib/jquery/1.12.4/jquery.min.js"></script>');
    await writeFile(join(dir, 'R02.txt'), '/*! jQuery v1.12.4 */');
    await writeFile(join(dir, 'responses.json'), JSON.stringify([
      { id: 'R01', url: 'https://x.example/', status: 200, headers: { 'content-type': 'text/html' }, cookies: [{ name: 'sid', attributes: ['Path=/'] }], bodyFile: 'R01.html', sha256: 'a', at: '2026-01-01T00:00:00Z' },
      { id: 'R02', url: 'https://x.example/lib/jquery/1.12.4/jquery.min.js', status: 200, headers: {}, bodyFile: 'R02.txt', sha256: 'b', at: '2026-01-01T00:00:01Z' },
    ]));
    const r = await auditSnapshot(join(dir, 'responses.json'), { target: 'https://x.example', paths: ['/'] });
    const ids = r.findings.map(f => f.id);
    for (const id of ['HDR-FRAME', 'LIB-JQ-DUP', 'LIB-JQ-OLD', 'COOKIE']) assert.ok(ids.includes(id), id);
    assert.equal(r.requests, 0);
    const rel = await auditSnapshot(relative(process.cwd(), join(dir, 'responses.json')), { target: 'https://x.example', paths: ['/'] });
    assert.ok(!rel.findings.some(f => f.id === 'ERR'), '상대 경로에서도 증적을 읽어야 함');
    assert.equal(r.at, '2026-01-01T00:00:00Z');
    assert.ok(!ids.includes('ERR'));
    const md = toMarkdown(r);
    assert.match(md, /조치 가이드/);
    assert.match(md, /frame-ancestors/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('모든 점검 ID에는 조치 가이드가 있다', () => {
  const src = readFileSync(new URL('./site-audit.mjs', import.meta.url), 'utf8');
  const ids = [...new Set([...src.matchAll(/id: '([A-Z][A-Z0-9-]+)'/g)].map(m => m[1]))].filter(id => !['ERR', 'STOPPED', 'HDR-HSTS-NA'].includes(id));
  for (const id of ids) assert.ok(REMEDIATION[id], `${id} 조치 가이드 누락`);
});
