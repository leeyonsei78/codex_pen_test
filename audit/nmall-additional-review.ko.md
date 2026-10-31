# nmall 상품 페이지 추가 점검

점검일: 2026-10-30 KST

대상: https://www.lina.co.kr/nmall/P00172_02.htm?t=S1_2508_A_02

일반 GET 1회로 응답과 공개 HTML을 확인했다. 인증정보·공격 구문·브라우저 실행·참조 자원 추가 요청은 없다.

## 결과

| 항목 | 관측 | 판단 / 권고 |
|---|---|---|
| 상태 및 이전 비교 | HTTP 200, 121,622바이트. SHA-256이 이전 nmall 증적과 동일 | 저장 본문 변화 없음. 서버 전체 설정/백엔드 동일성을 뜻하지 않음 |
| CSP | CSP/Report-Only 응답 헤더 미관측; 정적 HTML에서도 CSP meta 미검출 | 허용 스크립트/외부 서비스 목록을 파악하고 Report-Only에서 검토 후 강제 적용 |
| jQuery 참조 | /cms/upload/MALL/web/com/js/88/jquery-3.4.1.min.js | 구버전으로 보이는 경로. 실제 파일 버전·패치·실행 버전·취약 호출 경로는 미확인. 파일 및 호출부 검토 후 지원 버전으로 갱신 검토 |
| 프레임 제한 | X-Frame-Options: DENY | 이 응답에 프레임 삽입 제한 있음. company/about의 제한 부재 결과를 이 URL에 적용하지 않음 |
| HTTPS 및 MIME | HSTS max-age=31536000; includeSubDomains, nosniff | 해당 응답에서 확인. 전체 TLS/서브도메인 점검은 아님 |
| 캐시 | max-age=0, s-maxage=86400 | 공유 캐시에 최대 1일 freshness를 지정. 공개 고정 페이지라면 합리적일 수 있음. 사용자별 개인정보를 포함하는 응답인지 별도 확인 필요; 캐시 유출 증거 없음 |

## 한계 및 조치 순서

이번 결과는 구성 검토이며 실제 XSS·인증 우회·정보 유출을 입증하지 않았다. jQuery는 파일명만으로 실제 버전을 확정하지 않는다. AI 입력 엔드포인트도 검증하지 않았다.

1. 참조된 jQuery 파일과 플러그인 호환성을 확인하고 실제 코드의 HTML 삽입 경로를 검토한다.
2. CSP를 단계적으로 적용하고 테스트 환경에서 상품 화면·신청·인증 기능의 정상 동작을 확인한다.
3. 페이지가 사용자별 데이터를 출력한다면 CDN 캐시 키·캐시 제외 정책을 검증한다. 현재 공개 응답만으로 개인정보 포함 여부를 확정하지 않는다.

증적: [result.json](nmall-additional-review-evidence/2026-10-30T10-38-18-718Z/result.json), 같은 폴더의 public-response.html. 이전 증적은 nmall-review-evidence/result.json에 보존했다. review-nmall-additional-public.mjs를 재실행하면 일반 GET 1회가 발생한다.
