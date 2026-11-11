const $ = s => document.querySelector(s);
let token = '', connected = false, busy = false, tested = '';
const defaults = { openai: ['openai-responses', 'https://api.openai.com/v1'], anthropic: ['anthropic', 'https://api.anthropic.com'], custom: ['openai', ''] };
const msg = (s, error = false) => { $('#status').textContent = s; $('#status').className = error ? 'error' : ''; };
function value() { return { provider: $('#provider').value, apiKey: $('#key').value, model: $('#model').value, advanced: $('#override').checked, format: $('#format').value, baseUrl: $('#base').value, allowHttp: $('#http').checked, name: $('#name').value, activate: $('#activate').checked }; }
function sync() { $('#save').disabled = busy || !connected || !tested; $('#test').disabled = busy || !connected; $('#load').disabled = busy || !connected; $('#login button').disabled = busy; $('#logout').disabled = busy || !connected; }
async function api(action, c) {
  const r = await fetch('/api/engine/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Review-Token': token }, body: JSON.stringify(c) });
  const d = await r.json(); if (!r.ok) throw Error(d.error || '요청 실패'); return d;
}
async function perform(fn) { if (busy) return; busy = true; sync(); try { await fn(); } catch(e) { msg(e.message, true); } finally { busy = false; sync(); } }
function preset() { const [format, base] = defaults[$('#provider').value]; $('#format').value = format; $('#base').value = base; const custom = $('#provider').value === 'custom'; $('#override').checked = custom; $('#advanced').open = custom; $('#key').value = ''; $('#model').value = ''; $('#models').replaceChildren(); tested = ''; sync(); }
$('#provider').onchange = preset;
$('#settings').addEventListener('input', () => { tested = ''; sync(); });
$('#settings').addEventListener('change', () => { tested = ''; sync(); });
$('#login').onsubmit = e => { e.preventDefault(); perform(async () => { const password = $('#password').value; $('#password').value = ''; await api('login', { password }); connected = true; tested = ''; $('#login-state').textContent = '관리자 연결 완료 · 최대 15분 유지'; msg('공급자와 키를 입력한 후 모델을 조회하세요.'); }); };
$('#logout').onclick = () => perform(async () => { await api('logout', {}); connected = false; tested = ''; $('#key').value = ''; $('#login-state').textContent = '연결을 해제했습니다.'; msg('관리자 연결 해제 완료'); });
$('#load').onclick = () => perform(async () => { msg('사용 가능한 모델을 조회하고 있습니다…'); const d = await api('models', value()); $('#models').replaceChildren(); d.models.forEach(id => { const o = document.createElement('option'); o.value = id; $('#models').append(o); }); msg(d.models.length ? `${d.models.length}개 모델을 조회했습니다. 모델 칸에서 선택하거나 ID를 직접 입력하세요.` : '모델 목록이 비었습니다. 담당자에게 확인한 ID를 직접 입력하세요.'); });
$('#test').onclick = () => perform(async () => { const c = value(); if (!c.apiKey || !c.model) throw Error('API 키와 모델 ID를 입력하세요.'); tested = ''; msg('연결 테스트 중… 공급자에게 요청이 전송됩니다.'); const d = await api('test', c); if (JSON.stringify(value()) !== JSON.stringify(c)) throw Error('테스트 중 설정이 변경됐습니다. 다시 테스트하세요.'); tested = JSON.stringify(c); msg(`연결 테스트 성공 · ${d.model}${d.latencyMs !== null ? ' · ' + d.latencyMs + 'ms' : ''}`); });
$('#settings').onsubmit = e => { e.preventDefault(); perform(async () => { const c = value(); if (JSON.stringify(c) !== tested) throw Error('변경된 설정으로 연결 테스트를 다시 하세요.'); const d = await api('save', c); msg(d.warning || `ARTEX 프로필 저장 완료 · ID ${d.id}${d.activated ? ' · 기본 프로필 활성화' : ' · 활성화는 ARTEX에서 확인하세요.'}`); tested = ''; $('#key').value = ''; }); };
(async () => { try { const b = await (await fetch('/api/bootstrap')).json(); token = b.token; preset(); } catch { msg('로컬 서버에 연결하지 못했습니다. run.bat 메뉴 9로 열어 주세요.', true); } })();
