const $ = s => document.querySelector(s), form = $('#config');
let token, report, timer, running = false, reviewed = '';
const message = (s, error = false) => { $('#message').textContent = s; $('#message').className = error ? 'error' : ''; };
const field = name => form.elements.namedItem(name);
function config() {
  if (!form.reportValidity()) throw Error('필수 입력값을 확인하세요.');
  return { project: field('project').value, approval: { id: field('approvalId').value, operator: field('operator').value, approved: field('approved').checked, validFrom: new Date(field('from').value).toISOString(), validUntil: new Date(field('until').value).toISOString() }, allowedOrigins: field('origins').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean), targets: field('targets').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean), intervalMs: Number(field('interval').value), timeoutMs: Number(field('timeout').value) };
}
const localDate = s => { const d = new Date(s); if (!Number.isFinite(d.getTime())) throw Error('날짜가 올바르지 않습니다.'); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); };
function fill(c) {
  field('project').value = c.project || ''; field('approvalId').value = c.approval.id || ''; field('operator').value = c.approval.operator || '';
  field('from').value = localDate(c.approval.validFrom); field('until').value = localDate(c.approval.validUntil);
  field('origins').value = c.allowedOrigins.join('\n'); field('targets').value = c.targets.join('\n'); field('interval').value = c.intervalMs ?? 1500; field('timeout').value = c.timeoutMs ?? 10000; field('approved').checked = false;
  reviewed = ''; $('#run').disabled = true;
}
async function api(route, body) {
  const r = await fetch('/api/' + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Review-Token': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await r.json(); if (!r.ok) throw Error(data.error || '요청 실패'); return data;
}
function download(data, name) { const u = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
function render(j) {
  report = j; running = j?.state === 'running'; $('#stop').disabled = !running; $('#run').disabled = running || !reviewed; $('#download').disabled = !j;
  if (!j) return;
  $('#progress').textContent = `${j.results.length} / ${j.total}`; $('#count').textContent = j.results.reduce((n, r) => n + (r.findings?.length || 0), 0); $('#bar').max = j.total; $('#bar').value = j.results.length;
  message(running ? `진행 중: ${j.currentUrl || '준비 중'}` : `${j.state === 'completed' ? '점검 완료' : '점검 중단: ' + j.stopped}${j.saveError ? ' · ' + j.saveError : ''}`);
  $('#findings').replaceChildren();
  for (const r of j.results) {
    const a = document.createElement('article'), h = document.createElement('h3'), p = document.createElement('p'); h.textContent = r.url; p.textContent = r.errorCode ? `수집 오류: ${r.errorCode}` : `HTTP ${r.status}${r.redirectObserved ? ' · 리다이렉트 미추적' : ''}${r.tls ? ' · TLS ' + r.tls.protocol : ''}`; a.append(h,p);
    const ul = document.createElement('ul');
    for (const f of r.findings || []) { const li = document.createElement('li'); li.textContent = `[검토 필요 / ${f.id}] ${f.detail} 개선: ${f.remedy}`; ul.append(li); }
    if (!r.errorCode && !r.findings.length) { const li = document.createElement('li'); li.textContent = '현재 검사 항목에서 검토 후보 없음. 전체 보안성 통과 판정은 아닙니다.'; ul.append(li); }
    a.append(ul); $('#findings').append(a);
  }
}
async function poll() { try { render(await api('job')); if (running) timer = setTimeout(poll, 1000); } catch(e) { message(e.message + ' · 새로고침하여 상태를 다시 확인하세요.', true); } }
form.addEventListener('input', () => { reviewed = ''; $('#run').disabled = true; $('#plan').hidden = true; });
form.addEventListener('submit', async e => { e.preventDefault(); try { const c = config(), p = await api('plan', c); reviewed = JSON.stringify(c); $('#plan').hidden = false; $('#plan').textContent = JSON.stringify(p, null, 2); $('#run').disabled = running; message('계획 검토 완료. 대상·기간·승인 상태를 확인한 뒤 실행하세요.'); } catch(e) { message(e.message, true); } });
$('#run').onclick = async () => { try { const c = config(); if (JSON.stringify(c) !== reviewed) throw Error('변경된 설정으로 계획을 다시 검토하세요.'); $('#run').disabled = true; render(await api('run', c)); clearTimeout(timer); await poll(); } catch(e) { message(e.message, true); $('#run').disabled = running || !reviewed; } };
$('#stop').onclick = async () => { try { await api('stop', {}); message('중단 요청을 보냈습니다.'); } catch(e) { message(e.message,true); } };
$('#export').onclick = () => { try { download(config(), 'company-review-config.json'); } catch(e) { message(e.message,true); } };
$('#download').onclick = () => report && download(report, `web-review-${report.id}.json`);
$('#import').onchange = async e => { try { const file = e.target.files[0]; if (!file) return; if (file.size > 32768) throw Error('32KB 이하 JSON 파일만 허용합니다.'); fill(JSON.parse((await file.text()).replace(/^\uFEFF/, ''))); message('설정을 불러왔습니다. 승인 체크는 직접 확인해야 합니다.'); } catch(e) { message('불러오기 오류: ' + e.message,true); } };
(async () => { try { const b = await (await fetch('/api/bootstrap')).json(); token = b.token; fill(b.example); await poll(); } catch(e) { message('서버 연결 실패: ' + e.message,true); } })();
