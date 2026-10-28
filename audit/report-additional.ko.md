# lina.co.kr 추가 검증 결과

점검일: 2026-10-28 23:06~23:09 KST  
대상: `https://www.lina.co.kr` 공개 응답 및 이미 수집한 스크립트  
관련: [최초 점검 보고서](report.ko.md)

후속: [외부 침입 가능성 검토](intrusion-review.ko.md)에서 API 오류 메시지→상태→HTML 전달 경로와 토큰 갱신·Axios 동작의 추가 로컬 검증을 수행했습니다. 아래는 2차 점검 시점의 기록입니다.

이번에는 홈과 홈 HTML에 직접 참조된 JS 2개에 일반 GET 요청을 총 3회 추가했습니다. 요청은 1초 간격으로 순차 수행했고, 리다이렉트·폼 제출·인증·다른 도메인 요청은 하지 않았습니다. 인증서 검증을 끄지 않았습니다. 기존 증적은 유지하고 `additional-evidence/`에 별도로 저장했습니다.

검증 중 실제 토큰이나 계정·개인정보는 취득하거나 사용하지 않았습니다. 아래 재현의 `AUDIT_FAKE_*`, `example.invalid`는 모두 로컬 합성 값이며 사이트로 전송하지 않았습니다. 전체 앱이나 외부 태그를 실행하지 않고 검토한 작은 코드 구간만 저장소 모형과 함께 로컬 실행했습니다.

## 결과 요약

| 항목 | 추가 확인 결과 | 해석 |
|---|---|---|
| F-05 인증 토큰 저장 | 공개 번들에 idToken/refreshToken을 sessionStorage 및 JS 쿠키에 복사하는 코드 존재; 합성 값으로 동작 재현 | 보안 설계 위험. 실제 서버의 토큰 수명·회전·재사용 탐지 및 계정 탈취 가능성 미확인 |
| F-06 캠페인 URL 처리 | UTM 외 쿼리와 fragment까지 localStorage·콘솔로 들어갈 수 있음; 2개 합성 URL로 재현 | 과도한 저장·로그 처리 확인. 실제 민감 URL 사용·외부 전송은 미확인 |
| 기존 F-03 보강 | 전역 메시지를 innerHTML로 출력하는 sink 확인 | XSS 조사 우선 경로 식별. 공격자 입력 경로는 여전히 미확인 |
| 외부 스크립트 | 동적 태그 로더 및 무결성 설정 부재 관측 | 방어 강화 검토 사항. SRI 부재 자체를 침해·독립 취약점으로 판정하지 않음 |
| HTTPS | 관측 연결은 TLS 1.3, 인증서 신뢰·호스트명 일치 확인 | 해당 연결에 대한 결과. 전체 TLS 구성/약한 프로토콜 허용 여부 검사는 아님 |

## F-05 — JavaScript에서 읽을 수 있는 인증 토큰 저장 경로

잠정 분류: **조건부 중 위험의 보안 설계 검토 사항**. 저장 코드가 있다는 사실을 인증 우회나 실제 세션 탈취 성공으로 보고하지 않습니다. SPA가 JavaScript에서 토큰을 취급하는 구조 자체만으로 서버의 인증 정책 위반을 확정할 수는 없습니다.

**근거**

A03: `/_nuxt/5a2f219c4df0d3402586.js`, 200 응답. 본문의 문자열 offset 3771 부근에 다음 코드가 있습니다. offset은 증적을 UTF-8 문자열로 읽은 인덱스이며 바이트 offset과 다릅니다.

```javascript
sessionStorage.setItem("token", s.data.idToken)
sessionStorage.setItem("refreshToken", s.data.refreshToken)
document.cookie = "x-lina-at-001=".concat(s.data.idToken,
  "; path=/; expires=0; samesite=strict; secure;")
document.cookie = "x-lina-at-002=".concat(s.data.refreshToken,
  "; path=/; expires=0; samesite=strict; secure;")
```

인접 코드에는 `refreshLogin(s)` 호출의 성공 처리 문맥이 있습니다. 같은 번들에는 `document.cookie`를 읽는 `getTokenCookie` 및 쿠키 값을 sessionStorage로 복사하는 경로도 있습니다. 최초 보고서에서 공개 비인증 응답의 인프라 쿠키만 관측한 것보다 더 많은 **클라이언트 코드상 저장 방식**을 확인한 것입니다. 실제 로그인 후 발급되는 쿠키/토큰 값을 관측한 것은 아닙니다.

**영향과 한계**

이 경로가 실행되면 토큰이 같은 페이지에서 실행되는 JavaScript에 노출됩니다. XSS나 신뢰한 외부 스크립트의 침해가 있을 경우 토큰을 읽을 수 있으며, 이후 악용 범위는 서버의 만료·회전·재사용 탐지·바인딩 정책에 달려 있습니다. Secure/SameSite는 JavaScript 읽기 차단 기능을 제공하지 않습니다. [OWASP 세션 관리](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

JS는 HttpOnly 쿠키를 설정할 수 없습니다. 위 할당 문자열에도 HttpOnly가 없습니다. 다만 서버가 별도로 발급하는 쿠키와의 충돌 여부, 브라우저가 실제 할당을 수용하는지, 이 코드의 로그인 환경에서 실행 여부는 미확인입니다. `expires=0`만 보고 즉시 만료나 무기한 서버 세션이라고 해석하지 않았습니다.

**수정 방법**

1. 서비스 구조가 허용하면 BFF/서버 세션을 사용하여 refresh token은 서버에 보관하고, 브라우저에는 서버에서 발급한 불투명 세션 ID 쿠키만 전달합니다. 쿠키는 Secure·HttpOnly·업무 흐름에 맞는 SameSite와 서버의 유효기간을 적용합니다.
2. 단순히 기존 `document.cookie` 문자열에 `HttpOnly`를 추가하는 방식은 해결책이 아닙니다. 서버의 `Set-Cookie`와 인증 API/프런트 연동 변경이 필요합니다.
3. 현재 SPA 구조를 유지해야 한다면 토큰의 JavaScript 노출을 전제로 짧은 수명, 갱신 토큰 회전과 재사용 탐지, 서버 로그아웃/폐기, XSS 방어, 인증 페이지 외부 스크립트 최소화를 검토합니다. 서버 API가 idToken을 접근 권한용으로 잘못 사용하는지는 별도 검토 대상이며 지금은 미확인입니다.
4. BFF/쿠키 인증으로 전환하면 상태 변경 요청의 CSRF/Origin 검증도 함께 설계해야 합니다. 기존 JS 쿠키와 sessionStorage 복사 경로는 마이그레이션 시 정리해야 합니다.

**검증 결과**

- 실제 번들에서 검토한 저장 구문만 분리하고, 합성 idToken/refreshToken과 메모리 저장소를 넣어 두 sessionStorage 값 및 두 쿠키 할당 문자열이 생성되는 것을 재현했습니다.
- 실제 브라우저 쿠키 처리, 로그인 성공 여부, 서버 만료·회전·권한 검사는 수행하지 않았습니다.
- 소스/서버 설정 부재로 통합 수정 코드는 작성하지 않았습니다. 인증 구조를 바꾸는 변경은 실제 소스와 테스트 환경에서 구현·검증해야 합니다.
- 다음 검증: 테스트 계정으로 응답/쿠키 속성 확인, 세션 회전, 로그아웃 후 서버 거부, 갱신 토큰 재사용 탐지. 실제 운영 계정 대신 전용 테스트 환경에서 수행해야 합니다.

## F-06 — UTM 처리에서 전체 쿼리 저장과 콘솔 출력

잠정 분류: **낮음, 민감 URL 사용 여부에 따라 재평가 필요**.

**근거**

기존 R07(`/external/load.js`) 26~46행은 다음과 같이 처리합니다.

```javascript
const FULL_URL = window.location.href
const UTM = FULL_URL.split('?')[1]
// 각 UTM_ARR 항목을 console.log로 출력
// includes('utm_source')로 부분 문자열 검사
// document.referrer가 없고 FULL_URL에 utm_source가 있으면:
localStorage.setItem('X_UTM_PARAM', UTM)
```

`utm_source`만 추출하는 것이 아니라 첫 `?` 뒤 문자열을 통째로 저장합니다. query 뒤 fragment도 남을 수 있습니다. 파라미터 이름을 정확히 비교하지 않아 `not_utm_source`도 일치합니다. 콘솔 출력은 저장 조건 검사보다 앞에 있어 저장 여부와 별개로 발생할 수 있습니다.

**로컬 재현**

`document.referrer = ''`인 저장소 모형에서 아래 합성 URL을 사용했습니다. 해당 URL은 실제 사이트로 요청하지 않았습니다.

| 합성 URL의 일부 | 실제 결과 |
|---|---|
| `?utm_source=audit&token=AUDIT_FAKE_TOKEN&email=fake%40example.invalid#AUDIT_FAKE_FRAGMENT` | 비UTM 값과 fragment까지 X_UTM_PARAM에 저장되고 콘솔 로그 인자로 전달됨 |
| `?not_utm_source=audit&code=AUDIT_FAKE_CODE` | 정확한 utm_source가 없는데도 저장·로그 처리됨 |

**영향과 한계**

만약 실제 진입 URL에 인증 코드·토큰·개인정보가 함께 있다면 필요 이상으로 브라우저에 남을 수 있습니다. localStorage는 같은 origin의 스크립트가 접근할 수 있고 명시적 TTL이 없습니다. 다만 기존 코드에도 조건부 덮어쓰기/초기화 경로가 있어 모든 값이 항상 영구 보존된다고 해석하지는 않습니다. [OWASP 브라우저 저장소 지침](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#local-storage)

실제 민감 URL의 존재, 외부 분석 서비스로의 전송, 로그 수집기로의 전송은 미확인입니다. `console.log` 호출만으로 제3자 유출이라고 판정하지 않습니다.

**수정 방법 및 코드**

- `URL`/`URLSearchParams`로 파싱하고 승인한 UTM 이름만 정확히 선택합니다. raw query/fragment 및 디버그 로그를 저장·전송하지 않습니다.
- [fixes/campaign-params.mjs](fixes/campaign-params.mjs)에 허용 필드·길이·문자 제약과 탭 단위 저장 예시를 작성했습니다. 예시는 기존 X_UTM_PARAM/X_UTM_SOURCE의 영속 저장 항목만 정리합니다.
- 실제 통합 시 기존 UTM 처리 블록과 raw query `console.log`를 함께 교체해야 합니다. 업무에 따라 허용 문자·코드 사전을 조정해야 하며, UTM 필드 자체에 민감정보를 넣으면 이 예시도 이를 완전히 판별하지 못합니다.
- 인증정보·개인정보를 URL에 넣지 않는 설계와 서버/분석 로그 마스킹은 별도로 필요합니다. sessionStorage도 같은 페이지 JavaScript에는 읽힐 수 있으므로 비밀정보 저장소가 아닙니다.

**검증 결과**

- 원래 코드의 저장·로그 동작: 합성 URL 2건 재현.
- 수정 참고 코드 회귀 테스트: **8개 통과, 0 실패**. 비허용 값/fragment 제외, 정확한 파라미터명, 정상 캠페인 코드, 길이/문자 제한, 중복 이름, 기존 저장값 정리, 비HTTP URL 거부를 확인했습니다.
- 실제 소스에 통합하거나 운영 데이터를 정리하지는 않았습니다.

## 기존 F-03 추가 근거 — 전역 메시지 HTML 출력

A03 문자열 offset 28929 부근에서 다음 렌더링 구문을 확인했습니다.

```javascript
domProps: { innerHTML: t._s(t.messageState.messageInfo.message) }
```

메시지가 HTML 속성으로 전달되는 sink의 존재는 확인했습니다. 공격자 입력이 이 상태에 도달하는지, upstream에서 신뢰된 고정 메시지/정화된 HTML만 받는지는 미확인입니다. 앞서 발견한 `excapeHtmlOrReturn`과 연결되는 호출 흐름도 아직 입증하지 못했습니다. 실제 XSS로 결론내리지 않습니다.

다음 단계는 소스에서 전역 메시지 setter와 API 오류/쿼리/CMS 값의 전달을 추적하는 것입니다. 일반 메시지는 텍스트 렌더링으로 바꾸고 줄바꿈 등 필요한 서식은 컴포넌트로 처리하는 것이 우선입니다. 리치 HTML이 필요하면 출력 직전 검증된 정화가 필요합니다.

## 외부 스크립트 로딩 관찰

R07의 `addHeadScript`/`addBodyScript`는 동적 script 요소에 src를 설정하고 삽입합니다. 검토한 로더에는 integrity 할당이 없으며, R08에는 Google Tag Manager/gtag 주소가 들어 있습니다. 해당 주소나 스크립트를 다운로드·실행하거나 외부 업체를 점검하지 않았습니다. R08에는 다른 사이트 모드의 분기도 있어 모든 주소가 www 페이지에서 실행된다는 뜻은 아닙니다.

동일 페이지의 외부 스크립트도 페이지 권한으로 실행되므로 F-05의 토큰/저장소 접근 범위를 검토할 필요가 있습니다. 이것이 실제 외부 스크립트가 토큰을 수집한다는 증거는 아닙니다. [OWASP 제3자 JavaScript 관리](https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Javascript_Management_Cheat_Sheet.html)

버전이 고정된 정적 리소스에는 호환되는 공급자 CORS 설정과 SRI를 검토할 수 있습니다. 수시로 바뀌는 태그 관리 스크립트에 임의 해시를 붙이면 정상 동작이 깨질 수 있으므로, 태그 게시 권한·변경 승인·버전 이력·허용 출처·인증 화면 최소화 등 운영 통제도 함께 검토해야 합니다. 무결성 설정 부재 자체를 별도 취약점으로 단정하지 않았습니다.

## HTTPS 추가 검증 — 관측 연결에서 정상

2026-10-28 23:06:43 KST의 A01 일반 GET 연결에서 다음을 관측했습니다.

- Node 기본 신뢰 검증 성공(`authorized: true`), 인증서 호스트명 `www.lina.co.kr` 일치.
- 협상 프로토콜: `TLSv1.3`.
- 협상 암호군: `TLS_AES_128_GCM_SHA256`.
- 인증서 유효기간: 2025-12-30 00:00:00 UTC ~ **2027-01-30 23:59:59 UTC**. 수집 시점 기준 약 94일 남음.
- 인증서 SHA-256 지문과 상세 필드는 `additional-evidence/responses.json`에 저장했습니다.

이는 그 연결에서 성공한 협상과 인증서 검증 결과입니다. 다른 CDN 지점·구형 TLS/암호군 허용 여부·인증서 자동 갱신·폐기 상태(OCSP/CRL)·전체 인증서 운영 정책을 검증한 것은 아닙니다. 약한 프로토콜 강제 접속이나 TLS 스캔은 하지 않았습니다.

## 산출물 및 이어서 가능한 검증

- 추가 온라인 증적: `additional-evidence/responses.json`, A01~A03 본문과 SHA-256.
- 로컬 재현: `additional-evidence/local-verification.json` — 합성 값만 포함.
- 오프라인 재실행: `node audit/verify-additional.mjs`.
- 새 회귀 테스트: `node --test audit/tests/campaign-regression.test.mjs`.
- 이전 참고 코드 테스트 10개와 이번 8개가 각각 통과했습니다. 실제 서비스 수정은 아직 미수행입니다.

현재 자료만으로 안전하게 더 할 수 있는 것은 공개 번들의 정적 검토 확대와 합성 데이터 로컬 재현입니다. 그러나 다음 중요한 결론에는 자료가 필요합니다.

| 추가 검증 | 필요한 자료/환경 |
|---|---|
| 메시지 HTML sink에 비신뢰 입력이 도달하는지 | 프런트 원본 소스, 공통 메시지/오류 처리 및 API 응답 스키마 |
| 인증 토큰 회전·재사용 탐지·로그아웃 무효화 | 인증 서버 소스/설정 또는 테스트 환경·전용 계정 |
| 객체별 접근 권한·다른 계정 데이터 차단 | 권한 부여된 테스트 API, 합성 데이터, 전용 A/B 테스트 계정 |
| 서버 입력 검증·SQL/파일 처리·CSRF·CORS | 서버 소스/배포 설정 및 격리된 테스트 환경 |
| 실제 수정·회귀 검증·출시 판정 | 저장소, 배포 설정, 환경 구분, 테스트 범위 |

여전히 원본 소스와 환경 구분은 제공되지 않았습니다. 위험한 확인은 위 테스트 환경이 준비된 뒤 진행하고, 운영 설정 변경은 구체적인 패치와 영향을 정리해 먼저 알려야 합니다.
