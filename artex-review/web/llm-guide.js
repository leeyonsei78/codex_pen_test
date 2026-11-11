const profiles = {
  responses: {
    format: 'OpenAI (Responses API)', model: 'gpt-4.1', base: 'https://api.openai.com/v1', key: '발급받은 실제 API 키 (예시 키는 제공하지 않음)',
    summary: '공식 OpenAI의 Responses API 형식입니다. 호출 경로는 /responses이며 ARTEX의 Base URL에는 /v1까지만 입력합니다.',
    modelNote: '공식 문서에 기재된 ID 예시. 해당 계정의 사용 권한과 도구 호출 호환성은 별도 확인.',
    steps: ['공식 모델 문서에서 모델의 API ID와 지원 API 형식을 확인합니다.', '회사 담당자에게 해당 프로젝트 API 키로 GET https://api.openai.com/v1/models를 조회해 달라고 요청합니다. 인증이 필요합니다.', '응답의 data[].id 중 회사에서 승인하고 해당 API 형식에 맞는 모델 ID를 복사합니다. 모델 목록은 여러 페이지일 수 있습니다.'],
    links: [['OpenAI 모델 ID 예시 문서', 'https://developers.openai.com/api/docs/models/gpt-4.1'], ['OpenAI 모델 목록 조회 방법', 'https://developers.openai.com/api/reference/resources/models/methods/list']]
  },
  chat: {
    format: 'OpenAI (Chat Completions)', model: 'gpt-4.1', base: 'https://api.openai.com/v1', key: '발급받은 실제 API 키',
    summary: 'Chat Completions 형식입니다. 호출 경로는 /chat/completions이며 Base URL에 이 경로를 덧붙이지 않습니다.',
    modelNote: '문서상의 ID 예시. 모델이 Chat Completions와 필요한 도구 호출을 지원하는지 확인.',
    steps: ['공식 모델 문서에서 Chat Completions 지원 여부를 확인합니다.', '회사 담당자에게 해당 프로젝트 키로 GET https://api.openai.com/v1/models 조회를 요청합니다.', '응답의 data[].id 값을 복사하고 ARTEX에서 연결 테스트합니다. 목록에 있다는 것만으로 모든 기능 지원을 보장하지 않습니다.'],
    links: [['OpenAI 모델 ID 및 지원 API', 'https://developers.openai.com/api/docs/models/gpt-4.1'], ['OpenAI 모델 목록 조회 방법', 'https://developers.openai.com/api/reference/resources/models/methods/list']]
  },
  anthropic: {
    format: 'Anthropic', model: 'claude-sonnet-5-5', base: 'https://api.anthropic.com', key: 'Anthropic에서 발급받은 실제 API 키',
    summary: 'Anthropic Messages 형식입니다. 공식 API 기준 호출 경로는 /v1/messages입니다. OpenAI 형식과 혼용하지 마세요.',
    modelNote: '공식 문서의 Claude API ID 예시. Bedrock용 ID와 구분하고 구버전 ARTEX의 호환성을 확인.',
    steps: ['공식 모델 안내의 Claude API ID 열을 확인합니다. 제품 표시명이나 Bedrock용 ID를 대신 넣지 않습니다.', '회사 담당자에게 해당 키로 GET https://api.anthropic.com/v1/models 조회를 요청합니다. 인증과 API 버전 설정은 공식 문서를 따릅니다.', '응답의 data[].id 값을 사용합니다. 선택한 모델의 도구 호출·추론 설정과 ARTEX 호환 여부를 연결 테스트로 확인합니다.'],
    links: [['Anthropic 모델 ID 표', 'https://platform.claude.com/docs/en/models/overview'], ['Anthropic 모델 목록 조회 방법', 'https://platform.claude.com/docs/en/api/models/list']]
  },
  internal: {
    format: 'OpenAI (Chat Completions) — 담당자 확인 후 선택', model: 'company-approved-model (가상 예시)', base: 'https://llm.example.com/v1 (가상 주소)', key: '사내 게이트웨이에서 발급한 키',
    summary: 'OpenAI 호환이라는 이름만으로 지원 API가 같지는 않습니다. 담당자에게 Chat Completions 또는 Responses 지원 여부를 먼저 확인하세요.',
    modelNote: '사내에 배포된 ID 또는 별칭. 공개 모델명과 다를 수 있으므로 임의로 추정하지 않음.',
    steps: ['회사 AI 플랫폼의 모델 카탈로그 또는 배포 목록에서 “API 모델 ID / 배포 이름”을 확인합니다.', '담당자에게 Base URL, 지원 API 형식, 인증 방식과 모델 목록 조회 주소를 요청합니다. /v1/models를 지원하지 않는 서비스도 있습니다.', '모델이 도구 호출(function/tool calling)을 지원하는지 확인합니다. 별도 인증 헤더나 API 버전 파라미터가 필요하면 ARTEX 호환 여부를 담당자가 검토해야 합니다.'],
    links: []
  }
};
function renderGuide() {
  const p = profiles[document.querySelector('#provider').value];
  document.querySelector('#summary').textContent = p.summary;
  const rows = [['프로필 이름', '회사 승인 점검용', 'ARTEX에서 구분할 이름. 모델 ID와는 다릅니다.'], ['API 형식', p.format, 'ARTEX 선택 목록에서 정확히 선택'], ['모델 / Model', p.model, p.modelNote], ['Base URL', p.base, '최종 호출 경로를 덧붙이지 않습니다. 사내 프록시는 담당자 안내 우선.'], ['API Key', p.key, '비밀번호·setup token과 다른 값입니다. 이 페이지에는 입력하지 않습니다.'], ['Proxy', '회사에서 요구한 경우만 입력', '일반적으로 비워 두고 사내 네트워크 정책을 확인합니다.']];
  const body = document.querySelector('#examples'); body.replaceChildren();
  rows.forEach(row => { const tr = document.createElement('tr'); row.forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); }); body.append(tr); });
  const steps = document.querySelector('#steps'); steps.replaceChildren(); p.steps.forEach(s => { const li = document.createElement('li'); li.textContent = s; steps.append(li); });
  const links = document.querySelector('#links'); links.replaceChildren(); p.links.forEach(([name, url]) => { const a = document.createElement('a'); a.textContent = name + ' ↗'; a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'guide-link'; links.append(a); });
}
document.querySelector('#provider').addEventListener('change', renderGuide);
renderGuide();
