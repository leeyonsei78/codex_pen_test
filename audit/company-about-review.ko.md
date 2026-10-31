# /company/about 공개 응답 점검

점검일: 2026-10-30 KST

대상: https://www.lina.co.kr/company/about

일반 GET 1회, 인증정보 없음, 리다이렉트 추적 없음. HTTP 200, 본문 34,534바이트. 공격 구문·브라우저 실행·참조 스크립트 추가 요청은 수행하지 않았다.

## 확인 사항

| 항목 | 관측 | 권고 및 한계 |
|---|---|---|
| 스크립트 CSP | CSP 및 Report-Only 응답 헤더 미관측; 정적 HTML 검사에서도 CSP meta 미검출 | 정상 스크립트/외부 서비스 목록을 바탕으로 Report-Only 검토 후 강제 적용. 부재만으로 XSS 확정 불가 |
| 프레임 제한 | X-Frame-Options 및 CSP frame-ancestors 응답 헤더 미관측 | 프레임 사용 요구가 없으면 frame-ancestors 'none' 및 DENY 검토. 실제 클릭재킹과 민감 기능 수행은 미검증 |
| jQuery 중복 참조 | HTML에서 /lib/jquery-3.7.1.js 뒤에 /lib/jquery/1.12.4/jquery.min.js 참조 | 구버전으로 보이는 참조 제거 및 단일 지원 버전 검토. 이번에는 파일 본문을 요청하지 않아 실제 버전·패치·최종 전역 버전·악용 경로 미확인 |
| HTTPS 강제 | HSTS max-age=31536000; includeSubDomains; preload | 헤더 존재 확인. 실제 preload 목록 등록 여부나 전체 TLS 안전성은 미검증 |
| MIME 스니핑 제한 | X-Content-Type-Options: nosniff | 해당 응답에서 확인 |
| 캐시 | no-cache, no-store, must-revalidate | 해당 응답의 캐시 지시 확인. 다른 URL/API에 일반화하지 않음 |

## 판단

보완 검토 항목은 확인했으나 악용 가능한 XSS·클릭재킹·인증 우회는 입증하지 않았다. 기존 www 공개 영역의 CSP/프레임 제한 부재와 jQuery 중복 참조가 이 URL에서도 관측된다. 다른 mall/nmall URL의 DENY 헤더가 이 페이지에도 적용된다고 가정할 수 없다.

우선 조치: 구버전으로 보이는 스크립트 참조의 실제 파일/호출부 검토, 프레임 정책 결정, CSP 단계 도입. 실제 코드 변경 후 테스트 환경의 브라우저 회귀 검증 및 최종 응답 헤더 재확인이 필요하다. 서버 설정 접근권한이나 원본 소스가 없어 이번에는 설정을 변경하지 않았다.

증적: [result.json](company-about-review-evidence/2026-10-30T10-37-32-783Z/result.json), 같은 폴더의 public-response.html. 실행 코드 review-company-about-public.mjs는 재실행 시 실제 일반 GET 1회를 발생시킨다.
