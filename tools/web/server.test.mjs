import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAuditServer, validateScanRequest } from './server.mjs';

const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(s.address().port)));
const post = (port, body, headers = {}) => fetch(`http://127.0.0.1:${port}/api/scan`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('요청 검증', () => {
  const ok = { authorized: true, target: 'https://example.com/a?b=1' };
  assert.deepEqual(validateScanRequest(ok, { allowPrivate: false }), { target: 'https://example.com', paths: ['/'] });
  const bad = [
    [{ ...ok, authorized: false }, /허가/],
    [{ ...ok, target: 'ftp://example.com' }, /http/],
    [{ ...ok, target: 'not a url' }, /주소/],
    [{ ...ok, target: 'https://user:pw@example.com' }, /계정/],
    [{ ...ok, target: 'http://127.0.0.1' }, /내부망/],
    [{ ...ok, target: 'http://[::1]/' }, /내부망/],
    [{ ...ok, target: 'http://localhost:3000' }, /내부망/],
    [{ ...ok, target: 'http://169.254.169.254' }, /내부망/],
    [{ ...ok, paths: ['//evil.example'] }, /경로/],
    [{ ...ok, paths: ['a'] }, /경로/],
    [{ ...ok, paths: ['/1', '/2', '/3', '/4', '/5', '/6'] }, /경로/],
    [{ ...ok, baseline: { nope: 1 } }, /baseline/],
  ];
  for (const [body, re] of bad) assert.match(validateScanRequest(body, { allowPrivate: false }), re);
  assert.ok(typeof validateScanRequest({ ...ok, target: 'http://127.0.0.1:8080' }, { allowPrivate: true }) === 'object');
});

test('API: 정상 점검, baseline, 보안 헤더', async () => {
  const fixture = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end('<html></html>'); });
  const fixturePort = await listen(fixture);
  const server = createAuditServer({ allowPrivate: true });
  const port = await listen(server);
  try {
    const target = `http://127.0.0.1:${fixturePort}`;
    const res = await post(port, { target, authorized: true });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    const { result, markdown } = await res.json();
    assert.ok(result.findings.some(f => f.id === 'HDR-CSP'));
    assert.match(markdown, /전체 발견 사항/);
    const res2 = await post(port, { target, authorized: true, baseline: result });
    const d = (await res2.json()).result.diff;
    assert.equal(d.new.length, 0);
    assert.equal(d.unchanged.length, result.findings.length);
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /사이트 보안 점검/);
  } finally { server.close(); fixture.close(); }
});

test('API: SSRF 차단, CSRF, 타입, 크기, 속도 제한, 동시성', async () => {
  const server = createAuditServer({ rateLimit: { max: 3, windowMs: 60000 } });
  const port = await listen(server);
  try {
    let r = await post(port, { target: 'http://127.0.0.1:1', authorized: true });
    assert.equal(r.status, 400);
    r = await post(port, { target: 'https://example.com', authorized: true }, { origin: 'https://evil.example' });
    assert.equal(r.status, 403);
    r = await fetch(`http://127.0.0.1:${port}/api/scan`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(r.status, 415);
    r = await fetch(`http://127.0.0.1:${port}/api/scan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(2 * 1024 * 1024 + 10) }).catch(e => ({ status: 'closed' }));
    assert.ok(r.status === 413 || r.status === 'closed');
    assert.equal((await fetch(`http://127.0.0.1:${port}/nope`)).status, 404);
  } finally { server.close(); }

  // 속도 제한/동시성은 실제 네트워크 없이 scan 주입으로 검증
  let release;
  const slow = createAuditServer({ rateLimit: { max: 2, windowMs: 60000 }, scan: () => new Promise(r => { release = () => r({ target: 'https://example.com', at: 't', requests: 0, records: [], findings: [] }); }) });
  const p2 = await listen(slow);
  try {
    const body = { target: 'https://example.com', authorized: true };
    const first = post(p2, body);
    await new Promise(r => setTimeout(r, 100));
    assert.equal((await post(p2, body)).status, 503);
    release();
    assert.equal((await first).status, 200);
    assert.equal((await post(p2, body)).status, 429); // 3번째 시도: max 2 초과
  } finally { slow.close(); }
});
