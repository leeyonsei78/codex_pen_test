import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { validate, probe } from './scan.mjs';
import { createBridge } from './llm-bridge.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
export function createApp(options = {}) {
  const engine = createBridge(options.engineBase);
  const token = crypto.randomBytes(32).toString('hex');
  let job = null, controller = null;
  async function run(c, plan, current, signal) {
    try {
      for (const url of plan.targets) {
        if (signal.aborted) { current.stopped = '사용자 중단'; break; }
        const left = Date.parse(c.approval.validUntil) - Date.now();
        if (left <= 0) { current.stopped = '승인 시간 종료'; break; }
        current.currentUrl = url;
        try {
          const r = await probe(url, Math.min(plan.timeoutMs, left), signal);
          current.results.push(r);
          if (r.status === 429 || r.status >= 500) { current.stopped = `HTTP ${r.status}`; break; }
        } catch (e) {
          if (!signal.aborted) current.results.push({ url, errorCode: e.code || 'REQUEST_FAILED' });
          current.stopped = signal.aborted ? '사용자 중단' : '네트워크 또는 TLS 오류'; break;
        }
        if (current.results.length < plan.targets.length) await delay(plan.intervalMs, undefined, { signal });
      }
    } catch (e) { current.stopped = signal.aborted ? '사용자 중단' : '실행 오류'; }
    current.state = current.stopped ? 'stopped' : 'completed';
    current.finishedAt = new Date().toISOString();
    delete current.currentUrl;
    try {
      fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
      fs.writeFileSync(path.join(root, 'reports', `web-${current.id}.json`), JSON.stringify(current, null, 2), { flag: 'wx' });
      current.saved = true;
    } catch { current.saveError = '디스크 저장 실패. 화면에서 JSON을 다운로드하세요.'; }
  }
  const server = http.createServer(async (req, res) => {
    const send = (status, data, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'" });
      res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
    };
    const expected = `127.0.0.1:${server.address().port}`;
    if (req.headers.host !== expected) return send(403, { error: '허용되지 않은 Host' });
    if (req.method === 'GET' && req.url === '/') return send(200, fs.readFileSync(path.join(root, 'web/index.html')), 'text/html; charset=utf-8');
    if (req.method === 'GET' && ['/app.js', '/style.css', '/guide.css', '/manual.html', '/llm-guide.html', '/llm-guide.js', '/llm-settings.html', '/llm-settings.js'].includes(req.url)) return send(200, fs.readFileSync(path.join(root, 'web', req.url.slice(1))), req.url.endsWith('.js') ? 'text/javascript; charset=utf-8' : req.url.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/css; charset=utf-8');
    if (req.method === 'GET' && req.url === '/api/bootstrap') return send(200, { token, example: JSON.parse(fs.readFileSync(path.join(root, 'example.json'), 'utf8')) });
    if (req.headers['x-review-token'] !== token) return send(403, { error: '실행 토큰이 올바르지 않습니다. 화면을 새로고침하세요.' });
    if (req.method === 'GET' && req.url === '/api/job') return send(200, job);
    if (req.method !== 'POST') return send(404, { error: '경로 없음' });
    if (req.headers.origin !== `http://${expected}` || req.headers['content-type'] !== 'application/json') return send(403, { error: '동일 출처 JSON 요청만 허용합니다.' });
    try {
      let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 32768) { send(413, { error: '입력은 32KB 이하로 제한됩니다.' }); return; } }
      const c = JSON.parse(body);
      if (req.url.startsWith('/api/engine/')) return send(200, await engine(req.url.slice('/api/engine/'.length), c));
      if (req.url === '/api/stop') { controller?.abort(); return send(200, { ok: true }); }
      if (!['/api/plan', '/api/run'].includes(req.url)) return send(404, { error: '경로 없음' });
      const plan = validate(c, req.url === '/api/run');
      if (req.url === '/api/plan') return send(200, { mode: 'PLAN_ONLY_NO_NETWORK', project: c.project, approval: c.approval, ...plan });
      if (job?.state === 'running') return send(409, { error: '이미 점검 중입니다.' });
      job = { id: crypto.randomUUID(), state: 'running', project: c.project, approval: c.approval, total: plan.targets.length, startedAt: new Date().toISOString(), results: [], limitations: '단일 비인증 GET의 보안 설정 관찰. 항목은 검토 후보이며 악용 가능성·전체 보안성을 검증하지 않습니다.' };
      controller = new AbortController();
      void run(c, plan, job, controller.signal);
      return send(202, job);
    } catch (e) { return send(400, { error: e.message }); }
  });
  server.requestTimeout = 15000;
  return { server, stop: () => controller?.abort() };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createApp();
  app.server.on('error', e => { console.error(`서버 시작 실패: ${e.message}`); process.exitCode = 1; });
  app.server.listen(8787, '127.0.0.1', () => console.log('웹 점검기: http://127.0.0.1:8787\n종료: Ctrl+C 또는 이 창 닫기'));
  process.on('SIGINT', () => { app.stop(); app.server.close(); });
}
