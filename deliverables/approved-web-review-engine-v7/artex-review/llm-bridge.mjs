import crypto from 'node:crypto';
export const presets = {
  openai: { format: 'openai-responses', base_url: 'https://api.openai.com/v1' },
  anthropic: { format: 'anthropic', base_url: 'https://api.anthropic.com' },
  custom: { format: 'openai', base_url: '' }
};
export function connection(c, requireModel = true) {
  const preset = presets[c.provider];
  if (!preset) throw Error('공급자를 선택하세요.');
  const format = c.advanced === true ? c.format : preset.format;
  const base_url = (c.advanced === true ? c.baseUrl : preset.base_url)?.trim().replace(/\/+$/, '');
  if (!['openai', 'openai-responses', 'anthropic'].includes(format)) throw Error('고급 설정의 API 형식을 확인하세요.');
  let u; try { u = new URL(base_url); } catch { throw Error('사내 API는 고급 설정에 실제 API 주소를 입력하세요.'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw Error('API 주소 형식을 확인하세요.');
  if (u.protocol !== 'https:' && c.allowHttp !== true) throw Error('HTTP는 키가 평문 전송됩니다. 고급 설정에서 명시적으로 허용해야 합니다.');
  const api_key = typeof c.apiKey === 'string' ? c.apiKey.trim() : '';
  if (!api_key || api_key.length > 8192) throw Error('실제 API 키를 입력하세요.');
  const model = typeof c.model === 'string' ? c.model.trim() : '';
  if (requireModel && (!model || model.length > 256)) throw Error('모델 ID를 입력하거나 조회한 목록에서 선택하세요.');
  return { provider: format, base_url, api_key, model, streaming: true };
}
export function createBridge(engineBase = 'http://127.0.0.1:8790') {
  let auth = '', expires = 0, tested = '', saved = null, busy = false;
  const fingerprint = c => crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');
  async function call(route, body, authenticated = true) {
    if (authenticated && (!auth || Date.now() >= expires)) throw Error('간편 설정 화면에서 ARTEX 관리자 로그인을 먼저 하세요. 연결은 15분 후 만료됩니다.');
    let r;
    try { r = await fetch(engineBase + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer ' + auth } : {}) }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(90000) }); }
    catch { throw Error('ARTEX 연결 실패 또는 제한시간 초과. 8790 포트의 엔진 상태를 확인하세요.'); }
    if (!r.ok) { if (r.status === 401) { auth = ''; tested = ''; } throw Error(`ARTEX 요청 실패 (HTTP ${r.status}). 인증·키 권한·API 설정을 확인하세요.`); }
    let data; try { data = await r.json(); } catch { throw Error('ARTEX 응답 형식을 확인할 수 없습니다.'); }
    return data;
  }
  return async (action, c) => {
    if (busy) throw Error('다른 연결 작업이 진행 중입니다. 완료 후 다시 시도하세요.');
    busy = true;
    try {
      if (action === 'login') {
        auth = ''; tested = ''; saved = null;
        if (typeof c.password !== 'string' || !c.password) throw Error('ARTEX 관리자 비밀번호를 입력하세요.');
        const r = await call('/api/auth/login', { username: 'ARTEX', password: c.password }, false);
        if (typeof r.token !== 'string' || !r.token) throw Error('ARTEX 로그인에 실패했습니다.');
        auth = r.token; expires = Date.now() + 15 * 60000;
        return { ok: true, expiresAt: new Date(expires).toISOString() };
      }
      if (action === 'logout') { auth = ''; tested = ''; saved = null; return { ok: true }; }
      if (!['models', 'test', 'save'].includes(action)) throw Error('지원하지 않는 연결 작업입니다.');
      const cfg = connection(c, action !== 'models');
      if (action === 'models') {
        const r = await call('/api/llm/models', cfg);
        if (r.ok !== true) throw Error('모델 조회 실패. API 키·주소·권한을 확인하거나 모델 ID를 직접 입력하세요.');
        return { ok: true, models: Array.isArray(r.models) ? r.models.filter(m => typeof m === 'string' && m.length <= 256 && !m.includes(cfg.api_key)).slice(0, 2000) : [] };
      }
      const hash = fingerprint(cfg);
      if (action === 'test') {
        tested = ''; saved = null;
        const r = await call('/api/llm/test', cfg);
        if (r.ok !== true) throw Error('연결 테스트 실패. 모델 ID·키 권한·API 형식과 ARTEX 호환 여부를 확인하세요.');
        tested = hash;
        return { ok: true, model: cfg.model, latencyMs: Number.isFinite(r.latency_ms) ? r.latency_ms : null };
      }
      if (hash !== tested) throw Error('현재 설정으로 연결 테스트를 통과한 후 저장하세요.');
      const name = typeof c.name === 'string' ? c.name.trim() : '';
      if (!name || name.length > 100) throw Error('프로필 이름은 1~100자로 입력하세요.');
      const saveHash = fingerprint({ hash, name, activate: c.activate === true });
      if (saved?.hash === saveHash) return saved.result;
      const r = await call('/api/llm/profiles', { name, format: cfg.provider, model: cfg.model, base_url: cfg.base_url, api_key: cfg.api_key, streaming: true, pool_exclude: c.activate !== true });
      if (!Number.isSafeInteger(r.id) || r.id <= 0) throw Error('저장 응답을 확인하지 못했습니다. ARTEX 프로필 목록을 확인한 후 다시 시도하세요.');
      const result = { ok: true, id: r.id, activated: false };
      if (c.activate === true) {
        try { await call('/api/llm/profiles/active', { id: r.id }); result.activated = true; }
        catch { result.warning = '프로필은 저장됐지만 기본 활성화에 실패했습니다. ARTEX LLM 화면에서 확인하세요.'; }
      }
      saved = { hash: saveHash, result };
      return result;
    } finally { busy = false; }
  };
}
