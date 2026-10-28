# lina.co.kr 공개 영역 보안 점검

- 점검 보고서: [report.ko.md](report.ko.md)
- 추가 검증 보고서: [report-additional.ko.md](report-additional.ko.md) — 토큰 저장·URL 쿼리 저장·HTML 출력·HTTPS 검증
- 외부 침입 가능성 검토: [intrusion-review.ko.md](intrusion-review.ko.md) — API 오류→HTML 경로, 토큰 갱신, Axios XSRF 동작 및 미확인 조건
- 최근 금융권 사고 비교: [financial-incidents-comparison.ko.md](financial-incidents-comparison.ko.md) — 당국 발표 대조·서버/운영 확인 공백·인증 헤더 목적지 검사(F-10)
- 권한 탈취·API 남용 방어 검증 방법: [defense-validation.ko.md](defense-validation.ko.md) — 실제 서버 부정 시나리오·침해 가정·소량 호출 제한 시험과 합격 기준. 현재 실제 서버 검증은 모두 NOT_RUN.
- 응답 상태, 헤더, 마스킹한 쿠키 속성, 수집 시각, 본문 SHA-256: [evidence/responses.json](evidence/responses.json)
- 로컬 재현 결과: [evidence/local-reproduction.json](evidence/local-reproduction.json)
- 수집 응답 검사 결과: [evidence/snapshot-checks.json](evidence/snapshot-checks.json)
- 수정 참고 코드: `fixes/` — 실제 애플리케이션에 통합하거나 배포한 코드가 아닙니다.

Node.js v22 이상에서 별도 패키지 설치 없이 실행합니다.

```powershell
# 모두 오프라인/루프백 검사. 운영 사이트에는 접속하지 않습니다.
node audit/reproduce.mjs
node --test audit/tests/local-regression.test.mjs
node audit/check-snapshot.mjs

# 추가 검증도 저장된 증적과 합성 값만 사용합니다.
node audit/verify-additional.mjs
node --test audit/tests/campaign-regression.test.mjs

# 침입 경로 검토: 합성 API 응답/토큰/XSRF 값을 사용하는 로컬 검사
node audit/verify-intrusion-paths.mjs
node --test audit/tests/public-error-regression.test.mjs

# 최근 금융권 사고 비교 중 추가 확인한 목적지 검증
node audit/verify-api-destination.mjs
node --test audit/tests/approved-api-url.test.mjs
```

`reproduce.mjs`의 성공은 **원래 함수의 결함 재현 성공**을 뜻합니다. `local-regression.test.mjs`의 성공은 **수정 참고 코드의 로컬 테스트 성공**입니다. 실제 서비스가 수정됐다는 뜻이 아닙니다.

`check-snapshot.mjs`는 수집된 HTML의 제한된 조건만 검사합니다. 최초 증적에서는 7개 통과, 6개 실패(exit 1)가 정상적인 관측 결과입니다. 이 실패를 허용 목록으로 감추지 않았습니다. 이미 저장한 응답은 수정 예시를 작성해도 달라지지 않습니다. 검사 통과도 전체 보안이나 출시 승인을 의미하지 않습니다.

`collect-public.mjs`는 온라인 재수집용입니다. 실행하면 같은 도메인의 명시된 URL 9개에 순차 GET 요청을 보내고 기존 증적을 덮어씁니다. 처음 수집한 증적은 보관한 뒤 별도 점검 회차로 실행하세요. 쿠키·인증정보를 보내지 않고 리다이렉트를 따라가지 않습니다. 요청 사이 최소 1초 간격, 각 20초 제한, 단일 3 MiB/전체 10 MiB 제한이며 오류·429·5xx 응답 시 중지합니다. HTTP 홈페이지 요청은 HTTPS 리다이렉트 확인용 1회입니다.

소스코드, 배포 설정, 테스트 계정이 제공되지 않아 실제 수정·인증·접근제어·세션·서버 입력 검증은 완료하지 못했습니다. 자세한 추가 자료와 테스트 조건은 보고서에 적었습니다.

`collect-additional.mjs`는 홈과 홈에서 직접 참조된 번들 2개를 순차 GET하며, 별도의 `additional-evidence/`가 이미 있으면 중지합니다. 이번 추가 증적은 최초 보고서의 저장된 응답과 구분됩니다. 이 파일은 온라인 수집용이며, 위 오프라인 재실행에는 필요하지 않습니다.
