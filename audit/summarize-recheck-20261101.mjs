import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const base=new URL('./recheck-20261101/',import.meta.url);
const {records}=JSON.parse(await readFile(new URL('responses.json',base),'utf8'));
const {records:assets}=JSON.parse(await readFile(new URL('assets.json',base),'utf8'));
const helper=records[0].helperDefinitions.find(s=>s.startsWith('function escapeHtml('));
assert(helper&&helper.length<1500&&!/\b(?:fetch|require|import|process|document|window)\b/.test(helper));
const context=vm.createContext(Object.create(null),{codeGeneration:{strings:false,wasm:false}});
vm.runInContext(helper,context,{timeout:300});
const cases=[['"','&qout;'],['<','&amp;lt;']].map(([input,expected])=>{context.input=input;const actual=vm.runInContext('escapeHtml(input)',context,{timeout:300});assert.equal(actual,expected);return {input,expected,actual,reproduced:true};});
const html=records.filter(r=>r.status===200&&r.observations);
const noFrame=html.filter(r=>!r.headers['x-frame-options']&&!/frame-ancestors/i.test(r.headers['content-security-policy']||''));
const legacy=html.filter(r=>r.observations.legacyJqueryReference);
await writeFile(new URL('local-current-helper.json',base),JSON.stringify({time:new Date().toISOString(),scope:'Current reviewed escapeHtml helper only, no browser or network execution',cases},null,2));
const rows=records.map(r=>`| R${String(r.id).padStart(2,'0')} | ${r.url} | ${r.status||r.error?.code||'미확인'} | ${r.headers?.location||''} |`).join('\n');
const ids=rs=>rs.map(r=>'R'+String(r.id).padStart(2,'0')).join(', ');
const report=`# 라이나생명 출시 전 공개 영역 보안 점검 결과

점검일: 2026년 11월 1일 KST. 실제 수집 시각은 responses.json의 UTC time에 기록했다.

출시 승인 판단은 보류한다. 공개 영역에서 수정할 코드 결함과 보안 설정 미비를 확인했지만, 실제 서비스 소스와 배포 설정이 없어 인증·권한·세션·서버 입력 검증을 완료하지 못했다. 계정 탈취·정보 유출·원격 XSS 성공을 확인한 결과는 아니다.

## 범위와 방법

사용자 지정 DOCX의 대표 주소 8개와 세부 URL 23개를 읽어 기존 targets.txt의 31개 주소와 대조했다. 문서 읽기에는 ZIP 내부 XML 추출을 사용했다. 신규 서버 소스, package/lock 파일, 배포 설정은 발견되지 않았다. audit 및 lina_header_review 폴더는 이전 점검 산출물이며 실제 애플리케이션 소스로 취급하지 않았다. 기존 기록을 새 검증 결과로 옮기지 않았다.

지정 HTTPS 31개, 각 호스트의 HTTP 루트 8개, 홈페이지가 직접 참조하는 jQuery 파일 2개에 정상 GET으로 총 41회 요청했다. 쿠키·인증정보 미전송, 리디렉션 미추적, 인증서 검증 유지, 순차 요청 사이 1초 대기. 429 또는 5xx이면 중지하도록 했다. 공개 HTML은 실행하지 않았고 폼·로그인·SSO·인증·설치 프로그램을 실행하지 않았다. URL 쿼리는 원문대로 유지했다. 경로 추측, 계정 접근, 데이터 변경, 주문·결제, 부하 시험은 하지 않았다. 현재 환경이 명확하지 않아 운영 환경 수준의 제약을 적용했다.

HTTPS 31개 결과: 200은 29개, 302는 1개, TLS 오류는 1개다. HTTP 루트는 HTTPS로 301/302 전환 6개, 403 거부 2개다. HTTP 세부 경로의 전환 정책은 미검증이다. 200은 화면 기능 정상이나 인증 통과를 뜻하지 않는다. PDF는 응답 유형·크기·해시만 확인했고 내용·개인정보 포함 여부는 검토하지 않았다.

증적은 ../audit/recheck-20261101/responses.json, assets.json, local-current-helper.json에 있다. 응답 본문 전체와 쿠키 값은 저장하지 않았다. 본문 SHA-256은 해당 수집본 식별값이며 전체 본문 재구성이나 독립 검증을 보장하지 않는다. 일부 HTML 정규식 관찰은 자동 식별용이므로 값이 false여도 문제 부재를 뜻하지 않는다.

## 발견 사항과 조치

### N01 구버전 jQuery 재참조

판정: 참조 및 실제 제공 파일의 버전 배너 확인. 잠정 조치 우선순위 중간. 악용 경로 미확인.

근거: ${ids(legacy)}에서 /lib/jquery-3.7.1.js 다음 /lib/jquery/1.12.4/jquery.min.js 참조가 확인된다. 홈페이지의 실제 파일 두 개도 200이며 각각 v3.7.1, v1.12.4 배너를 반환했다(assets.json). 다른 호스트 파일 본문과 브라우저 최종 전역 객체는 미검증이다. 백포트 패치 여부도 미확인이다.

영향: 오래된 jQuery의 HTML 처리 취약점 적용 가능성이 있다. 사용자 입력이 관련 DOM API에 도달하는지는 확인하지 못했다. [jQuery 공식 보안 수정 설명](https://blog.jquery.com/2020/04/10/jquery-3-5-0-released/)은 3.4.1 이하 HTML 처리의 XSS 문제를 설명한다. 버전 배너만으로 실제 XSS를 확정하지 않는다.

수정: 실제 템플릿·head 설정의 1.12.4 참조를 제거하고 호환성이 검증된 보안 지원 버전 하나로 통일한다. 플러그인·인증·전자서명·메뉴 기능을 테스트 환경에서 검증한다. 기존 audit/fixes/nuxt.config.example.js 끝에 제거 대상이 명시되어 있다.

검증: 현재 참조 존속 확인. 원본 템플릿이 없어 패치·빌드·브라우저 회귀·서비스 재검증은 미수행이다. 완료 기준은 최종 HTML에서 구버전 참조 제거, 잠금 파일/SBOM 대조, 주요 기능 회귀 통과다.

### N02 프레임 삽입 제한 헤더 부재

판정: ${noFrame.length}개 HTTPS HTML 응답에서 설정 부재 확인. 잠정 조치 우선순위 중간. 클릭재킹 성공 미확인.

근거: ${ids(noFrame)}에 X-Frame-Options 및 강제 CSP frame-ancestors가 모두 없다. 상세 헤더는 responses.json에 있다. PDF와 HTTP 전환 응답은 이 집계에서 제외했다. 전자구매 응답 R04/R16/R27에는 SAMEORIGIN이 있으므로 전체 사이트가 누락됐다고 판단하지 않는다.

영향: 응답 헤더를 통한 외부 사이트 프레임 삽입 차단이 없다. 실제 브라우저 삽입 및 민감 기능의 클릭 유도는 재현하지 않았다.

수정: 허용할 프레임 부모를 정해 CSP frame-ancestors를 CDN/프록시의 정상·오류 응답에 적용한다. 같은 출처만 허용하는 경우 audit/fixes/security-headers.cjs 참고. 기존 CSP를 덮어쓰지 않도록 추가하며 합법적 제휴·본인확인 프레임을 확인해야 한다. [OWASP 헤더 지침](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)을 기준으로 했다.

검증: 참고 미들웨어는 200·404·기존 CSP 유지 루프백 테스트 통과. 운영 반영은 안 됐다. 완료 기준은 최종 응답의 정책 확인과 테스트 브라우저에서 허용 부모 성공·비허용 부모 차단이다.

### N03 HTML 텍스트 이스케이프 함수의 인코딩 오류

판정: 현재 함수 코드 결함과 로컬 동작 2건 확인. 위험도는 호출부 추적 후 결정. XSS 미확인.

근거: R01에서 추출한 escapeHtml 함수는 큰따옴표를 잘못된 엔티티 &qout;로 바꾸고, <를 &amp;lt;로 이중 인코딩한다. 검토한 순수 함수만 네트워크 없이 실행하여 두 결과를 재현했다(local-current-helper.json). excapeHtmlOrReturn의 자동 추출본은 일부만 수집됐으므로 이번 회차의 실행 검증에 사용하지 않았다. 과거 블랙리스트 우회 재현은 과거 기록으로만 남긴다.

영향: 표시 오류 및 따옴표 속성 문맥의 안전한 인코딩 실패 가능성이 있다. 실제 입력 출처·HTML sink·브라우저 결과를 확인하지 못했으므로 공격 성공으로 분류하지 않는다.

수정: 일반 텍스트는 textContent 또는 Vue 기본 텍스트 바인딩으로 출력한다. HTML 문자열 생성이 필수이면 audit/fixes/safe-html.mjs의 단일 치환 인코더를 검토한다. URL·JavaScript·CSS 문맥이나 리치 HTML 정화에는 이 인코더를 사용하지 않는다.

검증: 현재 결함 2/2 로컬 재현. 수정 참고 인코더의 메타문자·한글·미등록 마크업 회귀 통과. 실제 호출부 패치·빌드·서비스 검증은 미수행이다.

### N04 GA CSP의 넓은 스크립트 허용

판정: 설정 확인. 방어 강화 항목이며 XSS 취약점 확정 아님. 우선순위 중간.

근거: GA의 조회 응답에 script-src * 'self' blob: 'unsafe-inline' 'unsafe-eval'이 있다. 외부 스크립트 출처와 인라인·문자열 실행을 폭넓게 허용한다. 이 정책은 frame-ancestors도 정의하지 않는다(N02와 방어 목적이 다름).

영향: 스크립트 주입 결함이 따로 존재할 때 CSP의 완화 효과가 제한된다. 주입 경로 자체는 미확인이다.

수정: 필요한 출처와 동적 실행 의존성을 소스에서 조사하고, 테스트 환경 Report-Only로 위반을 관찰한 뒤 nonce/hash 기반 정책으로 전환한다. 기존 업무 프레임워크가 unsafe-eval 등에 의존할 수 있으므로 운영에서 즉시 일괄 차단하지 않는다.

검증: 현재 헤더만 확인. 소스·브라우저·호환성 검증은 미수행. 완료 기준은 지원 기능 회귀 통과와 최종 강제 CSP 확인이다.

## 운영 확인 항목과 미확인 사항

| 항목 | 확인 근거 | 영향 및 다음 조치 | 검증 상태 |
|---|---|---|---|
| GA 연동 테스트 화면 | R09 200, SSO 관련 정적 UI 확인 | 외부 공개 필요성과 담당자 확인. 불필요하면 화면과 서버 엔드포인트를 함께 제한. 화면만으로 인증 우회 판정 불가 | SSO 발급·업무 API 미호출 |
| GA 업무 메인·인증·자동 로그아웃 페이지 | 지정 HTML 조회 가능 | 화면 셸 공개와 실제 데이터 접근을 구분. 합성 A/B 계정으로 API의 객체·역할 권한, 로그아웃 후 서버 거부 검증 | 서버 접근통제 미확인 |
| 공식 블로그 TLS 실패 | R07 ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR | 현재 점검 위치에서 TLS 협상 실패. 서버·중간 장비·경로 원인은 미확정. 정상 브라우저와 서버 로그 대조 | 인증서 취약·폐쇄로 단정 불가 |
| SRM HSTS 헤더 없음 | R04/R16/R27, HTTP 루트 R35는 403 | 상위 도메인의 includeSubDomains 정책이 이미 적용될 가능성을 함께 검토. 호스트 정책의 일관성 개선 여부 결정 | 전송 중 민감값 노출 미확인 |
| 공개 쿠키 | AWSALB, AWSALBCORS, TS 계열 및 SRM JSESSIONID 속성 수집 | AWSALB를 인증 쿠키로 단정하지 않음. TS 용도 확인. SRM JSESSIONID는 Secure·HttpOnly·SameSite=None 관찰, None만으로 CSRF 판정 불가 | 인증 후 회전·수명·재사용 미확인 |
| 런타임 설정 키 | R01 등 PRIVATE 관련 키 이름 관찰 | 실제 값과 직렬화 경로를 소스에서 검토. 키 이름만으로 비밀정보 노출 판정하지 않음 | 과거 내부 주소 노출의 현재 재확정 보류 |
| 종료 이벤트·오래된 자료·설치 페이지 | 목록의 지정 URL 응답 확보 | 오래된 날짜·공개 자체는 취약점 아님. 운영·보존 목적, 설치본 버전·서명·지원 상태를 담당자 확인 | 설치 실행·PDF 내용 검토 안 함 |

## 수정 코드 및 회귀 테스트

실제 애플리케이션 원본은 제공되지 않아 서비스 코드를 수정하지 않았다. 기존 로컬 수정 참고 파일을 읽고 다음 테스트를 이번 회차에 실행했다.

실행 명령: node --test audit/tests/local-regression.test.mjs audit/tests/campaign-regression.test.mjs audit/tests/public-error-regression.test.mjs audit/tests/approved-api-url.test.mjs lina_header_review_20261030/release-policy.test.mjs

결과: 테스트 32건 통과, 실패 0건. HTML 텍스트 인코딩, 보안 헤더의 로컬 정상·오류 응답 및 기존 CSP 유지, 쿼리 저장 허용 목록, 오류 메시지 비노출, API 목적지 제한, 테스트 화면 제한 예제, 세션 쿠키 옵션 예제를 검증했다. 이 중 URL 저장·API 목적지·토큰 관련 과거 우려는 현재 번들을 다시 조사하지 않았으므로 새로 확인된 원격 발견 사항으로 집계하지 않았다.

이번에 추가한 recheck-20261101.mjs와 recheck-assets-20261101.mjs는 온라인 재수집용이다. 재실행하면 해당 회차 JSON을 덮어쓰므로 증적을 먼저 별도 보관해야 한다. summarize-recheck-20261101.mjs는 저장된 자료만 읽어 현재 함수 결함을 재현하고 이 보고서를 생성한다.

## 출시 전 완료 기준

1. 실제 서비스 소스 경로/저장소, package 및 lock 파일, 민감값을 제거한 환경 예시, 프록시·CDN·WAF·서버 설정을 확보한다. 비밀키나 고객 데이터는 필요 없다.
2. 인증·본인확인·복구의 서버 처리와 실패 제한, 모든 API의 역할 및 객체 소유권 검사를 합성 계정과 데이터로 테스트한다. 운영의 다른 사용자 계정에 접근하지 않는다.
3. 로그인 시 세션 회전, 로그아웃·만료 후 거부, refresh token 재사용 방지, 쿠키와 CSRF/Origin 보호, 인증 응답 캐시 분리를 확인한다.
4. 서버 입력 스키마·길이·범위, 바인딩 쿼리, 파일 업로드 유형·저장·권한을 코드 및 격리 환경에서 검증한다. 위험 입력은 공개 운영 서버에 전송하지 않는다.
5. N01~N04를 실제 구조에 맞게 패치하고 빌드·통합·브라우저 회귀를 통과시킨다. CDN을 통과한 최종 응답과 신규 증적으로 수정 완료를 확인한다.
6. GA 테스트 경로의 운영 필요성, 블로그 TLS 오류, 설치 배포본·서명·지원 상태, 종료 자료의 보존 목적을 담당자가 확인한다.

운영 반영 전 안내: jQuery 제거는 플러그인 호환성, 프레임 정책은 제휴 인증, CSP 축소는 GA 업무 동작에 영향을 줄 수 있다. 이 보고서는 적용안을 제시하며 운영 변경·배포·차단을 실행하지 않았다. 현재는 출시 보안 확인 완료로 표시할 수 없다.

## 주소별 최신 응답

| 근거 ID | 요청 URL | 응답 또는 오류 | Location |
|---|---|---|---|
${rows}
`;
await writeFile(new URL('../../deliverables/라이나생명_출시전_보안점검_20261101.md',base),report,'utf8');
console.log(JSON.stringify({records:records.length,html:html.length,noFrame:noFrame.length,legacy:legacy.length,helperCases:cases.length,assets:assets.length}));
