import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { validate, probe, inspect } from './scan.mjs';
const config = { project: 'test', approval: { id: 'test', operator: 'tester', approved: true, validFrom: '2026-01-01', validUntil: '2027-01-01' }, allowedOrigins: ['https://example.com'], targets: ['https://example.com/'] };
test('범위 외 URL과 쿼리, 승인 없는 실행 차단', () => {
  for (const target of ['https://example.com.evil.test/', 'https://example.com/?token=secret', 'http://example.com/', 'https://user:pass@example.com/']) assert.throws(() => validate({ ...config, targets: [target] }));
  assert.throws(() => validate({ ...config, approval: { ...config.approval, approved: false } }, true));
  assert.throws(() => validate(config, true, Date.parse('2028-01-01')));
  assert.equal(validate(config).targets.length, 1);
});
test('쿠키 값을 결과에 남기지 않음', () => {
  const result = inspect('https://example.com/', 200, { 'content-type': 'text/html', 'set-cookie': ['sid=SECRET; Path=/'] }, null);
  assert.ok(result.findings.some(f => f.id === 'COOKIE'));
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('리다이렉트 따라가지 않음; 로컬 서버에서만 검증', async () => {
  let hits = 0;
  const server = http.createServer((req, res) => { hits++; res.writeHead(302, { Location: 'http://127.0.0.1:1/private' }); res.end(); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const result = await probe(`http://127.0.0.1:${server.address().port}/`, 1000);
    assert.equal(result.status, 302); assert.equal(hits, 1); assert.equal(result.redirectObserved, true);
  } finally { await new Promise(r => server.close(r)); }
});
