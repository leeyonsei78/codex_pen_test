import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';

export function validate(c, execute = false, now = Date.now()) {
  if (!c.project || !c.approval?.id || !c.approval.operator) throw Error('project, approval.id, approval.operator가 필요합니다.');
  const start = Date.parse(c.approval.validFrom), end = Date.parse(c.approval.validUntil);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw Error('승인 기간이 올바르지 않습니다.');
  if (execute && (c.approval.approved !== true || now < start || now >= end)) throw Error('승인 상태 또는 실행 기간을 확인하세요.');
  if (!Array.isArray(c.allowedOrigins) || !c.allowedOrigins.length) throw Error('allowedOrigins가 필요합니다.');
  const origins = c.allowedOrigins.map(s => {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.href !== u.origin + '/') throw Error('허용 대상은 경로 없는 HTTP(S) origin이어야 합니다.');
    return u.origin;
  });
  if (!Array.isArray(c.targets) || !c.targets.length || c.targets.length > 20) throw Error('targets는 1~20개여야 합니다.');
  const targets = c.targets.map(s => {
    const u = new URL(s);
    if (!origins.includes(u.origin) || u.username || u.password || u.search || u.hash) throw Error('범위 외 대상 또는 인증정보·쿼리·fragment가 포함된 URL입니다.');
    return u.href;
  });
  const intervalMs = c.intervalMs ?? 1500, timeoutMs = c.timeoutMs ?? 10000;
  if (!Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 60000) throw Error('intervalMs: 1000~60000');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw Error('timeoutMs: 1000~30000');
  return { targets, intervalMs, timeoutMs };
}

export function inspect(url, status, headers, tls) {
  const findings = [];
  const add = (id, severity, detail, remedy) => findings.push({ id, severity, detail, remedy, confidence: 'configuration-observation' });
  if (new URL(url).protocol === 'http:') add('HTTP', 'review', '평문 HTTP 응답을 관찰했습니다. HTTPS 전환 여부는 별도 확인해야 합니다.', 'HTTPS 강제 전환을 검토하세요.');
  if (url.startsWith('https:') && !headers['strict-transport-security']) add('HSTS', 'review', 'HSTS 헤더가 없습니다.', 'HTTPS 전용 운영 범위를 확인한 뒤 HSTS를 설정하세요.');
  const html = /\btext\/html\b/i.test(headers['content-type'] || '');
  if (html && !headers['content-security-policy']) add('CSP', 'review', 'HTML 응답에 강제 CSP가 없습니다.', '허용할 스크립트 출처를 정의하고 CSP를 적용하세요.');
  if (html && !headers['x-frame-options'] && !/\bframe-ancestors\b/i.test(headers['content-security-policy'] || '')) add('FRAMING', 'review', '프레임 삽입 제한 헤더가 없습니다.', 'CSP frame-ancestors 또는 X-Frame-Options를 설정하세요.');
  if ((headers['x-content-type-options'] || '').toLowerCase() !== 'nosniff') add('NOSNIFF', 'review', 'nosniff 설정이 없습니다.', 'X-Content-Type-Options: nosniff를 설정하세요.');
  for (const [index, cookie] of (headers['set-cookie'] || []).entries()) {
    const attrs = cookie.split(';').slice(1).map(x => x.trim().toLowerCase());
    const missing = ['secure', 'httponly'].filter(a => !attrs.includes(a));
    if (!attrs.some(a => a.startsWith('samesite='))) missing.push('samesite');
    if (missing.length) add('COOKIE', 'review', `응답 쿠키 #${index + 1}: ${missing.join(', ')} 속성 미관찰. 쿠키 용도에 따른 판단이 필요합니다.`, '세션 쿠키 여부와 프런트엔드 접근 필요성을 확인하여 속성을 설정하세요.');
  }
  return { url, status, tls, findings };
}

export function probe(url, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https:') ? https : http;
    const req = transport.request(url, { method: 'GET', agent: false, signal, headers: { 'User-Agent': 'ApprovedWebReview/1.0', Accept: 'text/html,*/*;q=0.1' } }, res => {
      const socket = res.socket;
      const tls = socket.encrypted ? { authorized: socket.authorized, protocol: socket.getProtocol(), cipher: socket.getCipher()?.standardName } : null;
      const result = inspect(url, res.statusCode, res.headers, tls);
      result.redirectObserved = res.statusCode >= 300 && res.statusCode < 400;
      // 본문·쿠키 값·리다이렉트 목적지는 저장하지 않습니다.
      res.destroy();
      resolve(result);
    });
    const deadline = setTimeout(() => req.destroy(Error('요청 제한시간 초과')), timeoutMs);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--config');
  if (ci < 0 || !args[ci + 1]) throw Error('사용법: node scan.mjs --config example.json [--execute]');
  if (args.some((a, i) => i !== ci + 1 && !['--config', '--execute'].includes(a))) throw Error('알 수 없는 인자');
  const c = JSON.parse(fs.readFileSync(args[ci + 1], 'utf8').replace(/^\uFEFF/, ''));
  const execute = args.includes('--execute');
  const plan = validate(c, execute);
  if (!execute) { console.log(JSON.stringify({ mode: 'PLAN_ONLY_NO_NETWORK', project: c.project, approval: c.approval, ...plan }, null, 2)); return; }
  const report = { project: c.project, approval: c.approval, startedAt: new Date().toISOString(), results: [], limitations: '비인증 단일 GET 응답의 설정 관찰입니다. 취약점 악용 또는 전체 보안성을 검증하지 않습니다.' };
  for (const url of plan.targets) {
    if (Date.now() >= Date.parse(c.approval.validUntil)) { report.stopped = '승인 시간 종료'; break; }
    try {
      const remaining = Date.parse(c.approval.validUntil) - Date.now();
      const r = await probe(url, Math.min(plan.timeoutMs, remaining));
      report.results.push(r);
      if (r.status === 429 || r.status >= 500) { report.stopped = `HTTP ${r.status}`; break; }
    } catch (e) { report.results.push({ url, errorCode: e.code || 'REQUEST_FAILED' }); report.stopped = '네트워크 또는 TLS 오류'; break; }
    await new Promise(r => setTimeout(r, plan.intervalMs));
  }
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync('reports', { recursive: true });
  const file = `reports/review-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(`보고서: ${file}\n관찰 항목: ${report.results.reduce((n, r) => n + (r.findings?.length || 0), 0)}\n종료: ${report.stopped || '완료'}`);
  if (report.stopped) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
