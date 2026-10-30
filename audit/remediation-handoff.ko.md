# lina.co.kr 보안 개선 요청서 (IT·보안팀 전달용)

작성일: 2026-10-30 · 근거: 2026-10-28 수집 증적(`evidence/`, `additional-evidence/`, `path-evidence/`) 및 `tools/site-audit.mjs` 오프라인 분석

## 먼저 읽어 주세요

- **실시간 재점검은 하지 못했습니다.** 이번 작업 환경의 네트워크 정책이 `www.lina.co.kr`를 차단해 새 도구를 운영 사이트에 실행하지 못했습니다. 아래 내용은 10-28 증적을 같은 도구로 오프라인 분석한 결과입니다. 그 사이 이미 고쳐진 항목이 있을 수 있으므로, 담당자는 먼저 현재 상태를 `curl -sI https://www.lina.co.kr/`와 아래 [재검증](#재검증) 명령으로 확인해 주세요.
- 이 저장소에는 서비스 소스·배포 설정이 없습니다. 따라서 **실제 사이트는 수정되지 않았고**, 수정 참고 코드(`fixes/`)와 설정 예시만 있습니다. 실제 반영은 서비스 담당 팀의 작업입니다.
- 아래는 성공한 공격이 아니라 **방어 공백**입니다. 인증·접근제어·세션·서버 입력 검증은 점검하지 못했으므로 "안전하다"는 판정이 아닙니다.

## 우선순위 요약

| 순위 | ID | 내용 | 담당 | 난이도 | 참고 |
|---|---|---|---|---|---|
| P1 | F-02 | 프레임 제한·CSP 헤더 없음 | 인프라/CDN | 낮음 (설정만) | `fixes/cloudfront-response-headers-policy.json` |
| P1 | F-01 | 취약 범위 jQuery 1.12.4 중복 로드 | 프런트엔드 | 낮음~중간 | 아래 |
| P1 | F-07/F-03 | API 오류 메시지가 `innerHTML`로 출력되는 경로, 자체 이스케이프 함수 결함 | 프런트엔드 | 중간 | `fixes/PlainMessage.example.vue`, `fixes/public-error-message.mjs`, `fixes/safe-html.mjs` |
| P1 | F-10 | Authorization 헤더 부착 전 목적지 origin 검사 없음 | 프런트엔드 | 낮음 | `fixes/approved-api-url.mjs` |
| P2 | F-09 | Axios 0.21.4 (교차 출처 XSRF 헤더 복사) | 프런트엔드 | 중간 | Axios ≥ 0.28.0 이상으로 |
| P2 | F-04 | 공개 HTML에 내부 서비스 주소 직렬화 | 프런트엔드/백엔드 | 중간 | `fixes/nuxt.config.example.js` |
| P2 | F-05/F-08 | JS에서 읽는 토큰 저장, refresh token 덮어쓰기 | 인증 담당/백엔드 | 높음 (설계) | 아래 |
| P3 | F-06 | UTM 처리에서 쿼리 전체 저장·콘솔 출력 | 프런트엔드 | 낮음 | `fixes/campaign-params.mjs` |
| P3 | - | Referrer-Policy·Permissions-Policy 없음, 로드밸런서 쿠키 속성 | 인프라 | 낮음 | 아래 |

우선순위 근거: P1은 설정 변경만으로 되거나(F-02), 한 곳의 코드 수정으로 XSS·토큰 노출 경로를 줄이는 것들입니다. F-07·F-03은 신뢰할 수 없는 문자열이 HTML로 출력될 수 있는 경로이고, F-01은 그 출력 경로를 악용하기 쉽게 만드는 구버전 라이브러리입니다. 이 셋을 CSP와 함께 막는 것이 외부 공격 대응에 가장 효과적입니다.

## 항목별 조치

### F-02 · 응답 헤더 (P1, 인프라)
- **현황:** 홈·`/login`·오류 페이지 모두 `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` 없음. HSTS(`max-age=31536000; includeSubDomains; preload`)와 nosniff는 이미 있음. 응답에 CloudFront 헤더가 보여 CloudFront에서 한 번에 적용할 수 있을 것으로 보입니다(실제 구성은 확인 필요).
- **조치:** `fixes/cloudfront-response-headers-policy.json`을 기준으로 응답 헤더 정책을 만들어 스테이징에 먼저 적용합니다. 이 파일은 AWS에 적용해 검증하지 않은 예시입니다.
  1. 즉시 enforce: `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`.
  2. 전체 CSP는 **Report-Only로 먼저** 배포해 위반을 수집한 뒤(보고 수신 엔드포인트 지정 필요), 인라인 스크립트를 nonce/hash로 바꾸고 enforce로 전환합니다.
  3. Permissions-Policy의 camera·microphone은 본인인증·비대면 가입 기능에서 쓰는지 확인한 뒤 결정합니다.
  4. 제휴사 iframe이 있으면 정확한 HTTPS origin만 `frame-ancestors`에 추가합니다. `*`는 쓰지 않습니다.
- **완료 기준:** `curl -sI`로 위 헤더 확인, 로그인·전자서명·결제 등 핵심 흐름 회귀 테스트 통과, 허용되지 않은 origin의 iframe이 차단됨.

### F-01 · jQuery (P1, 프런트엔드)
- **현황:** 모든 페이지가 `/lib/jquery-3.7.1.js` 뒤에 `/lib/jquery/1.12.4/jquery.min.js`를 동기 로드합니다. 1.12.4는 CVE-2020-11022/11023 영향 범위(<3.5.0)입니다. 뒤에 로드되므로 전역 `$`를 덮어쓸 수 있습니다.
- **조치:** HTML 템플릿·Nuxt head 설정·CMS 삽입 코드에서 1.12.4 참조를 제거하고 한 버전만 로드합니다. 이 참조에 의존하는 레거시 플러그인을 먼저 찾아 호환 버전으로 교체합니다.
- **완료 기준:** 네트워크 탭에서 jQuery가 한 번만 로드됨, 브라우저에서 `jQuery.fn.jquery`가 3.5.0 이상, 관련 화면 회귀 테스트 통과.

### F-07 / F-03 · HTML 출력 경로 (P1, 프런트엔드)
- **현황:** 번들의 Axios 오류 인터셉터가 서버 응답의 `message`를 그대로 전역 메시지 상태에 넣고, 렌더링이 `innerHTML`을 사용합니다. 자체 `escapeHtml`은 `"`를 `&qout;`로 잘못 치환하고 `&` 치환 순서 때문에 이중 인코딩이 일어납니다. 방어용 함수는 블랙리스트 방식입니다. 서버가 항상 고정 문구만 반환한다면 악용되지 않을 수 있으나, 확인되지 않았습니다.
- **조치:**
  1. 전역 메시지를 텍스트로 렌더링합니다(`fixes/PlainMessage.example.vue`).
  2. 승인된 errorCode만 고정 문구로 매핑하고 원본 `message`는 UI에 전달하지 않습니다(`fixes/public-error-message.mjs`).
  3. 자체 이스케이프 함수는 `fixes/safe-html.mjs` 또는 프레임워크 기본 이스케이프로 교체합니다.
  4. 서버가 사용자 입력을 오류 메시지에 섞어 반환하는지 백엔드에서도 확인합니다.
- **완료 기준:** `<b>`·`<img onerror>` 같은 합성 입력이 화면에서 텍스트로 보임, `audit/tests`의 회귀 테스트를 실제 코드에 맞게 이식해 통과.

### F-10 · 인증 헤더 목적지 검사 (P1, 프런트엔드)
- **현황:** 요청 URL에 `/api/`·`/public/`가 들어 있으면 목적지와 무관하게 idToken을 Authorization 헤더에 붙입니다. 외부 절대 URL이 그 경로를 포함하면 토큰이 붙을 수 있습니다. 공격자가 URL을 제어하는 진입점은 확인하지 못했습니다.
- **조치:** 헤더를 붙이기 전에 `new URL()`로 최종 목적지의 origin(scheme·host·port)이 승인된 API origin과 정확히 같은지 검사합니다(`fixes/approved-api-url.mjs`). 승인 origin은 환경별 설정으로 관리합니다.
- **완료 기준:** 외부 origin·scheme-relative URL(`//...`)·`user@host` URL에서 Authorization이 붙지 않는 단위 테스트.

### F-09 · Axios (P2, 프런트엔드)
- **조치:** Axios를 0.28.0 이상(가능하면 현재 지원되는 1.x)으로 올립니다. 1.x는 호환성 변경이 있으므로 인터셉터·오류 처리 동작을 테스트로 확인합니다. 업그레이드 전까지 `withCredentials`를 쓰는 호출이 승인 origin으로만 가는지 확인합니다.

### F-04 · 내부 주소 노출 (P2, 프런트엔드/백엔드)
- **현황:** 공개 HTML의 `window.__NUXT__`에 `http://ldc-api-common.service-ldc.svc:8080` 등 내부 서비스 주소가 포함됩니다. 내부망 접근 가능성은 확인하지 않았습니다.
- **조치:** 브라우저에 필요한 값만 허용 목록으로 공개하고, 서버 전용 값은 `privateRuntimeConfig` 등으로 분리해 HTML·SSR 상태에 직렬화하지 않습니다(`fixes/nuxt.config.example.js`). 공개 설정에 있는 client ID·JavaScript key가 비밀키가 아닌지 공급자별 허용 도메인 설정과 함께 확인합니다.
- **완료 기준:** 페이지 소스에 `.svc`·사설 주소가 없음(본 도구의 `CFG-INTERNAL` 항목 해소).

### F-05 / F-08 · 토큰 저장과 갱신 (P2, 인증 담당)
- **현황:** 로그인 성공 처리에서 idToken·refreshToken을 `sessionStorage`와 JS가 쓰는 쿠키(`x-lina-at-001/002`)에 저장합니다(HttpOnly 불가). 특정 401 갱신 경로에서는 새 refresh token을 이전 값으로 덮어씁니다. 서버가 토큰을 회전하는지는 확인하지 못했습니다.
- **조치:**
  1. 장기적으로는 BFF/서버 세션으로 옮겨 refresh token을 서버에만 두고 브라우저에는 Secure·HttpOnly·SameSite 쿠키만 줍니다(이때 CSRF/Origin 검증도 함께 설계).
  2. 단기적으로는 토큰 수명 단축, refresh token 회전과 재사용 탐지, 로그아웃 시 서버 폐기, F-02·F-07의 XSS 방어를 우선합니다.
  3. F-08은 먼저 인증 서버의 회전 정책을 확인한 뒤, 회전 방식이면 새 토큰을 보존하도록 수정합니다.
- **완료 기준:** 테스트 환경에서 새 토큰 채택, 이전 토큰 거부, 동시 갱신, 로그아웃 후 폐기가 확인됨. 실제 운영 계정으로 시험하지 않습니다.

### P3 항목
- **F-06:** `utm_source` 등 허용된 파라미터만 정확히 비교해 저장하고 콘솔 출력을 제거합니다(`fixes/campaign-params.mjs`).
- **Referrer-Policy / Permissions-Policy:** F-02의 응답 헤더 정책에 포함됩니다.
- **쿠키:** `AWSALB`·`AWSALBCORS`·`TS011388cf`는 로드밸런서/WAF 계열로 보이는 쿠키입니다. 장비 설정에서 Secure·HttpOnly·SameSite를 조정할 수 있는지 확인하고, 불가하면 위험 평가 후 예외로 기록합니다. 세션·인증 쿠키는 별도로 Secure·HttpOnly·SameSite 적용 여부를 확인합니다.

## 배포 순서와 롤백

1. 스테이징에서 F-02 헤더(enforce는 frame-ancestors만, 전체 CSP는 Report-Only) → 핵심 흐름 회귀 → 운영 적용.
2. F-01·F-07·F-03·F-10을 하나의 프런트엔드 릴리스로 묶어 스테이징 검증 후 배포.
3. Report-Only CSP 위반이 정리되면 CSP enforce.
4. F-09, F-04, F-05/F-08은 별도 일정으로 진행.
5. 롤백: 헤더 정책은 이전 정책 버전으로 되돌릴 수 있게 변경 전 정책을 보관합니다.

## 재검증

수정 후 아래를 실행하고 결과 JSON을 보관해 다음 회차와 비교하세요. 사이트 소유자가 점검을 허가한 환경에서만 실행합니다.

```bash
# 오프라인: 저장 증적 분석 (네트워크 없음)
node tools/site-audit.mjs --snapshot audit/evidence/responses.json --target https://www.lina.co.kr \
  --paths /,/login,/company --json before.json

# 온라인: 수정 후 재점검, before.json 대비 신규/해결 표시 (읽기 전용 GET 약 10건, 1초 간격)
node tools/site-audit.mjs --target https://www.lina.co.kr --paths /,/login,/company \
  --i-am-authorized --baseline before.json --json after.json --out after.md
```

`after.md`의 "해결" 목록에 위 항목들이 나타나고 "신규"가 없으면 해당 공개 응답 수준의 개선이 확인된 것입니다. 이 도구는 응답 내용만 보므로 F-05·F-08·F-10 같은 인증·클라이언트 로직은 코드 리뷰와 테스트 환경 검증이 따로 필요합니다.

## 추가 권고 (이번 증적으로 검증하지 않음)

- 로그인·인증·API에 대한 WAF 관리형 규칙, 속도 제한, 계정 잠금·이상 징후 알림이 실제로 동작하는지 점검: `defense-validation.ko.md`의 시나리오와 합격 기준을 사용하며, 현재 실제 서버 검증은 모두 NOT_RUN입니다.
- CSP 위반 보고, 인증 실패·토큰 재사용 로그의 모니터링과 경보.
- 의존성 목록(SBOM) 관리와 정기 취약점 점검(jQuery·Axios 같은 구버전 재유입 방지).
