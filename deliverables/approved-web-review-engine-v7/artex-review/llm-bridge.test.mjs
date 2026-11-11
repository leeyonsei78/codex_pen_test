import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { connection, createBridge } from './llm-bridge.mjs';
const c = { provider: 'openai', apiKey: 'test-secret-key', model: 'fixture-model', name: 'test' };
test('공급자 자동 설정과 사용자 지정 주소 검증', () => {
  assert.equal(connection(c).provider, 'openai-responses');
  assert.equal(connection({ ...c, provider: 'anthropic' }).base_url, 'https://api.anthropic.com');
  assert.throws(() => connection({ ...c, provider: 'custom' }));
  assert.throws(() => connection({ ...c, advanced: true, format: 'openai', baseUrl: 'https://user:pass@localhost/' }));
  assert.throws(() => connection({ ...c, advanced: true, format: 'openai', baseUrl: 'http://localhost:3000/v1' }));
});
test('실제 ARTEX API 계약 모의 검증: 인증·모델 조회·테스트·저장·설정 변경 차단', async () => {
  const requests = [];
  const server = http.createServer(async (req,res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); requests.push({ url: req.url, body });
    res.setHeader('Content-Type','application/json');
    if (req.url === '/api/auth/login') { res.end(JSON.stringify({ token: 'private-auth-token' })); return; }
    assert.equal(req.headers.authorization, 'Bearer private-auth-token');
    if (req.url === '/api/llm/models') res.end(JSON.stringify({ ok: true, models: ['fixture-model'] }));
    else if (req.url === '/api/llm/test') res.end(JSON.stringify({ ok: true, reply: c.apiKey, latency_ms: 12 }));
    else if (req.url === '/api/llm/profiles') res.end(JSON.stringify({ id: 7 }));
    else res.end(JSON.stringify({ ok: true }));
  });
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  try {
    const bridge = createBridge(`http://127.0.0.1:${server.address().port}`);
    await assert.rejects(bridge('models',c), /관리자 로그인/);
    assert.equal((await bridge('login',{ password: 'fixture-password' })).ok,true);
    assert.deepEqual((await bridge('models',c)).models,['fixture-model']);
    await assert.rejects(bridge('save',c), /연결 테스트/);
    const result = await bridge('test',c);
    assert.ok(!JSON.stringify(result).includes(c.apiKey));
    await assert.rejects(bridge('save',{ ...c, model:'changed' }), /연결 테스트/);
    assert.equal((await bridge('save',c)).id,7);
    await bridge('save',c);
    const saves = requests.filter(r => r.url === '/api/llm/profiles');
    assert.equal(saves.length,1);
    assert.equal(saves[0].body.format,'openai-responses');
    assert.equal(saves[0].body.pool_exclude,true);
    assert.equal(saves[0].body.api_key,c.apiKey);
    await bridge('logout',{});
    await assert.rejects(bridge('models',c), /관리자 로그인/);
  } finally { await new Promise(r => server.close(r)); }
});
