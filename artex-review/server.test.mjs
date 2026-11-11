import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createApp } from './server.mjs';
test('웹 API: 토큰·출처 검사, 계획, 실행 및 결과 수집', async () => {
  let hits = 0;
  const target = http.createServer((req,res) => { hits++; res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'sid=SECRET' }); res.end('local fixture'); });
  await new Promise(r => target.listen(0, '127.0.0.1', r));
  const app = createApp(); await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let report;
  try {
    assert.equal((await fetch(base)).status, 200);
    const guide = await fetch(base + '/llm-guide.html');
    assert.equal(guide.status, 200);
    assert.match(await guide.text(), /모델 ID는 어디에서/);
    for (const asset of ['/llm-guide.js', '/guide.css', '/manual.html', '/llm-settings.html', '/llm-settings.js']) assert.equal((await fetch(base + asset)).status, 200);
    const b = await (await fetch(base + '/api/bootstrap')).json();
    const origin = `http://127.0.0.1:${target.address().port}`;
    const c = { ...b.example, allowedOrigins: [origin], targets: [origin + '/'], approval: { ...b.example.approval, approved: true, validFrom: new Date(Date.now()-60000).toISOString(), validUntil: new Date(Date.now()+60000).toISOString() } };
    const headers = { 'Content-Type': 'application/json', 'X-Review-Token': b.token, Origin: base };
    const post = (endpoint, h = headers) => fetch(base + '/api/' + endpoint, { method: 'POST', headers: h, body: JSON.stringify(c) });
    assert.equal((await post('run', { ...headers, 'X-Review-Token': 'wrong' })).status, 403);
    assert.equal((await post('run', { ...headers, Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('plan')).status, 200); assert.equal(hits, 0);
    assert.equal((await post('run')).status, 202);
    for (let i=0;i<50;i++) { report = await (await fetch(base + '/api/job', { headers: { 'X-Review-Token': b.token } })).json(); if (report.state !== 'running') break; await new Promise(r => setTimeout(r, 20)); }
    assert.equal(report.state, 'completed'); assert.equal(hits, 1); assert.equal(report.results[0].status, 200);
    assert.ok(!JSON.stringify(report).includes('SECRET'));
  } finally {
    app.stop(); await new Promise(r => app.server.close(r)); await new Promise(r => target.close(r));
    if (report?.id) fs.rmSync(new URL(`./reports/web-${report.id}.json`, import.meta.url), { force: true });
  }
});
