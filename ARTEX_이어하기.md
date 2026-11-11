# ARTEX 작업 이어하기

기록일: 2026-11-09 (한국시간). 사용자가 여기서 중단하고 다음에 이어가기로 함.

## 사용자 목표

최종 목표는 ARTEX 자동 탐지 → 사람의 결과 검토 → 수정안·변경 내역 제시 → 별도 사람 승인 → 수정 적용 → 재점검이다. 현재 이 전체 흐름은 구현되지 않았다. 자동 수정/승인 워크플로를 완료했다고 설명하면 안 된다.

최근 완료 범위는 LLM 간편 연결 화면이다. 기본 입력을 공급자·API 키·모델로 단순화하고 API 형식/Base URL은 고급 설정으로 옮겼다.

## 파일과 배포본

- 개발 원본: C:\codex_pen_test\artex-review
- 최신 배포 ZIP: C:\codex_pen_test\deliverables\approved-web-review-engine-v7.zip
- 최신 배포 staging: deliverables/approved-web-review-engine-v7/artex-review
- USER_GUIDE.md: 전체 설명서
- UPDATE-v7.md: 업데이트 시 데이터 보존 및 간편 설정 설명
- ENGINE.md: ARTEX 실행 구성
- web/manual.html: 설명서 화면
- web/llm-guide.html: API 형식/모델 ID 예시
- web/llm-settings.html, web/llm-settings.js: 실제 간편 설정 화면
- llm-bridge.mjs: ARTEX 인증·모델 조회·테스트·프로필 저장 연결

## 구현과 상태

- ARTEX Global v0.3.15-global.1의 수정하지 않은 소스를 engine/에 포함.
- 소스 커밋 d6964594a0221cd921b85056d604bce9d8ce54df.
- 공식 이미지 ghcr.io/jiwoochris/artex-global:v0.3.15-global.1 + postgres:16-alpine.
- Docker Compose 프로젝트명 artex-review-engine.
- ARTEX http://127.0.0.1:8790 (프록시 8791), 경량 점검기/간편 설정 http://127.0.0.1:8787.
- 간편 설정 URL: http://127.0.0.1:8787/llm-settings.html.
- 간편 설정은 원본 ARTEX 컨테이너 UI를 교체하지 않는다. 별도 화면에서 기존 ARTEX API를 호출한다.
- API 경로: /api/auth/login, /api/llm/models, /api/llm/test, /api/llm/profiles, /api/llm/profiles/active.
- 로컬 서버는 관리자 JWT를 메모리에서 15분 유지. 키를 로컬 파일/브라우저 저장소에 저장하지 않는다. 명시적 저장 시 ARTEX DB에 저장.
- 경량 점검기는 별도 단일 GET 기반 헤더/쿠키/TLS 관찰 도구다. 이 도구의 승인 체크·기간·중단은 ARTEX를 통제하지 않는다.
- run.bat은 ASCII/CRLF로 수정됨. 이전 UTF-8/LF 배치가 깨지는 문제가 있었음. 편집 후 node artex-review/fix-launcher.cjs 실행.
- 테스트: node --test scan.test.mjs server.test.mjs llm-bridge.test.mjs (artex-review에서). 최근 6개 통과.
- 실제 공급자 API 테스트는 우리 쪽에서 사용자 키로 수행하지 않았다. 모의 ARTEX 계약 검증이다.

## 사용자 확인 완료

- 사용자 Windows 세션에서 Docker Desktop 엔진 실행.
- ARTEX /setup 진입 및 관리자 비밀번호 설정·로그인 성공.
- run.bat 9번 간편 설정 실행 성공.
- 사용자가 공유한 ARTEX LLM 화면에서 '회사 승인 점검용' 프로필, OPENAI-RESPONSES 형식, gpt-5.6-luna 모델, Healthy, 별표/Active 표시 확인. 키/비밀번호는 기록하지 않음.
- 로컬 HTTP 읽기로 /api/auth/status HTTP 200, initialized=true도 확인했음.
- New task 생성 시 Creating이 계속 표시됐다고 사용자 보고. 실제 생성/실행/대상 요청 여부는 미확인.

## 해결되지 않은 문제: 디스크와 Docker

- 이 세션 exec 도구에서 '디스크 공간이 부족합니다. (os error 112)' 발생을 실제 확인했다. Creating 지연 원인이라고 확정하지는 않았다.
- Docker 명령은 이 관리형 세션에서 소켓 Access is denied 및 ~/.docker/config.json 권한 오류 발생. 사용자 Docker GUI 실행 상태와 별개다. 관리형 환경 권한 상승/접근 우회를 시도하지 말 것.
- 사용자 run.bat 3번도 'Docker Desktop is not ready' 표시. 이 문구는 일반 실패 안내라 원인 확정 불가. v7 진단은 접근 거부를 구분하지만 실제 실행 중인 폴더/파일 버전은 다시 확인해야 한다.
- Docker GUI에서 Containers의 artex-review-engine 그룹 Stop으로 중지하도록 안내했다. 실제 중지 완료는 미확인.
- 사용자 이미지 목록: pwnlab 2.03GB, localstack/localstack 1.88GB, ubuntu 156.76MB 등. 사용 여부가 확인되지 않아 삭제 확정하지 않았다. 다른 컨테이너/볼륨 삭제 금지.
- 사용자에게 Windows 휴지통·불필요 다운로드·중복 ZIP 먼저 정리하도록 안내.
- C드라이브 10GB 이상, 가능하면 20GB 이상 여유를 작업 권고로 안내. 공식 최소 사양이 아님을 명시. 실제 확보량은 미확인.

## 데이터 보존

- 현재 실제 실행 폴더를 유지해야 한다. 사용자가 처음 v2 압축 해제 폴더를 썼고 이후 업데이트했으므로 정확한 현재 경로 재확인 필요.
- engine-runtime/.env: DB 비밀번호와 setup token. 읽거나 출력하지 말 것.
- engine-runtime/data: ARTEX 영속 파일.
- Docker PostgreSQL 볼륨: artex-review-engine_engine_pgdata.
- 새 폴더에서 .env 재생성 후 기존 DB 볼륨 연결 시 비밀번호 불일치가 생길 수 있다. 업데이트는 기존 실행 폴더에 덮어쓰되 runtime과 DB를 보존한다.
- API 키, 비밀번호, 토큰은 채팅으로 요청하지 않는다.
- docker system prune --volumes, 광범위한 삭제, 볼륨 삭제를 수행하지 않는다.

## 대상과 승인 범위 주의

사용자가 Description에 https://www.lina.co.kr, 승인번호 test-001, 담당자 홍길동/보안팀, 기간 2026-11-09~10을 입력했다고 말했다. 허용 기법/제외 대상은 예시 placeholder 그대로여서 미확정이었다.
해당 공개 서비스에 실제 능동 점검을 실행할 근거로 삼지 않는다. 승인된 정확한 범위와 기법·시간창을 확인해야 한다. 기존 날짜를 다음 세션에서 유효한 승인으로 간주하지 않는다.
Description의 '승인 후 능동 검증' 문장만으로 실제 승인 게이트가 보장되지 않음을 설명했다. 작업이 실행 중이면 ARTEX 자체 제어 또는 컨테이너 Stop으로 중단하고 상태를 확인하도록 안내.

## 다음 재개 순서

1. 사용자에게 현재 C드라이브 여유 공간과 ARTEX 중지 여부 확인. 가능하면 읽기 전용 확인.
2. 사용자 세션에서 docker version의 Server/오류 및 docker context show로 Docker 연결 원인 분류. 현재 세션 권한은 임의 변경하지 않는다.
3. 공간과 Docker 연결 복구 후 실제 실행 폴더와 .env/DB 보존을 확인.
4. ARTEX 재시작 후 Tasks에서 기존 생성 요청이 남아 있는지 확인. 중복 Create 금지.
5. 필요한 경우 민감정보를 가린 엔진 로그로 Creating 지연 분석. 로그/DB 증거 없이는 원인 확정하지 않는다.
6. 최종 승인·개선 워크플로는 아직 미구현임을 유지하고, 개발할 때 실제 저장소/수정 대상/승인체계와 구체적 구현 범위를 정한다.

## run.bat 메뉴

1 경량 점검 / 2 ARTEX 시작 / 3 중지 / 4 상태 / 5 초기 토큰 / 6 로그 / 7 API 안내 / 8 설명서 / 9 간편 LLM 설정.

## 2026-11-12 논문 방향 및 동기화 인계

- 사용자 요청으로 GitHub 동기화 결과, 임시 파일 삭제 확인, SSCI/SCIE 논문화 논의와 arXiv:2611.07611 기반 보완 방향을 `논문_연구_이어가기.md`에 정리했다. 다음 논문 작업은 이 문서부터 읽는다.
- GitHub main과 .sync-work HEAD는 501bc5f이며 원래 작업 폴더 HEAD는 아직 79c6850이다. Chrome 임시 프로필은 사용자 삭제 후 부재를 확인했다.
- 제안 연구는 기만 환경에서 AI 보안 발견의 진위·대상·영향을 증거와 독립 평가로 검증하는 방법이다. 연구 방향은 미확정이며 실험 효과·신규성·게재 가능성을 확정하지 않았다.
- 다음 작업은 선행연구 비교와 2~3쪽 연구계획 초안이다. 이번 인계 메모는 로컬 저장분이며 기존 GitHub 커밋에 포함되지 않는다.
