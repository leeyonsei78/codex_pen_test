# site-audit

허가받은 사이트의 공개 응답을 읽기 전용 GET으로 점검하는 도구. Node.js 22+, 패키지 설치 불필요.

## CLI

```bash
node tools/site-audit.mjs --target https://example.com --paths /,/login --i-am-authorized \
  --out report.md --json result.json

# 이전 결과와 비교 (종료 코드는 신규 발견만 기준)
node tools/site-audit.mjs --target https://example.com --i-am-authorized \
  --baseline result.json --json result-new.json
```

| 옵션 | 설명 |
|---|---|
| `--i-am-authorized` | 점검 허가 확인 (필수) |
| `--paths` | 쉼표로 구분한 경로 (기본 `/`) |
| `--baseline <json>` | 이전 `--json` 결과와 비교해 신규/해결/유지 표시 |
| `--fail-on low\|medium\|none` | 해당 위험도 이상이면 종료 코드 1 (기본 medium) |
| `--allow-private` | localhost/사설망 대상 허용 (기본 차단, 본인 개발 환경용) |

## 웹 UI

```bash
node tools/web/server.mjs            # http://127.0.0.1:8787
node tools/web/server.mjs --allow-private   # 로컬 개발 서버를 점검할 때
```

주소와 경로를 입력하고 허가 확인을 체크하면 점검합니다. 이전 결과 JSON을 올리면 변화를 비교하고, 결과는 JSON/Markdown으로 저장할 수 있습니다.

## 안전 장치

- GET만 사용, 쿠키/인증정보 미전송, 리다이렉트 미추적, 같은 origin만 접근, 요청 간 1초, 요청 20초/응답 3MiB/총 30요청 제한, 429·5xx 시 중지.
- SSRF 차단: localhost·사설·링크로컬(169.254.169.254 포함)·예약 주소는 기본 차단. DNS 리바인딩을 막기 위해 실제 연결 시점의 IP를 검사합니다.
- 웹 서버: 기본 127.0.0.1 바인딩, 동일 출처 요청만 허용(CSRF), JSON 전용, 동시 1건, IP당 10분 5회, 업로드 2MiB 제한, 엄격한 CSP, 결과는 textContent로만 출력(XSS 방지).

## 한계

- 응답 내용만 분석합니다. 로그인·접근제어·세션·서버 입력 검증은 점검하지 못하며, 발견이 없다고 안전하다는 뜻이 아닙니다.
- 허가 확인은 사용자의 자기 선언일 뿐 도구가 소유권을 검증하지 않습니다. 공개 서비스로 운영하려면 도메인 소유 검증(DNS TXT 등)과 인증을 추가하세요.
- baseline 비교는 `ID + 위치`로 매칭하므로 내용 문구만 바뀐 경우는 같은 항목으로 봅니다. 점검 중 오류(ERR)가 있으면 "해결" 판정이 부정확할 수 있다고 경고합니다.

## 테스트

```bash
node --test tools/site-audit.test.mjs tools/web/server.test.mjs
```
