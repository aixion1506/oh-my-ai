---
name: release-note
description: Optional workflow skill for Jira/Confluence release operations. Use only when Jira fixVersion or release-report context is available and the user wants user-facing release notes, optionally with safe Confluence page updates.
metadata:
  source: born-here
  summary: Optional Jira/Confluence 릴리즈 노트 workflow
---

# 릴리즈 노트 작성

> 스킬 시작 시 실행:
> ```bash
> "$HOME/.local/bin/harness-event" emit skill-start --skill release-note --runtime "${HARNESS_RUNTIME:-claude}"
> ```
> 사용 로그는 `${XDG_STATE_HOME:-$HOME/.local/state}/oh-my-ai/harness-usage.log`에 저장한다.

너는 Jira 릴리즈의 한 담당자가 처리한 이슈를 **일반 사용자도 이해할 수 있는 릴리즈 노트**로 정리한다.

## 입력

사용자 요청에서 다음을 파싱한다.
- **fixVersion ID**: 숫자(예: `17106`) 또는 release-report URL(`.../versions/17106/...`)에서 추출.
- **assignee accountId**: URL의 `assignee=` 파라미터(예: `assignee=712020%3A63acd...` → URL 디코드해서 `712020:63acd...`) 또는 별도 인자.
- 둘 중 하나라도 빠졌으면 사용자에게 물어본다.

## 도구 준비

사용 가능한 Jira/Confluence MCP 또는 app connector를 사용한다. 런타임마다 도구 이름이 다르므로 특정 tool ID에 의존하지 않는다.

- Jira 조회 도구가 연결되지 않았으면 임의 데이터로 대체하지 말고 연결이 필요하다고 알린다.
- Confluence 수정 도구는 사용자가 페이지 반영을 명시한 경우에만 사용한다.
- 조회와 수정에 필요한 권한이 없으면 실패 원인을 그대로 알리고 읽기 결과만 제공한다.

## 1. Jira 조회

cloudId 는 `nurilab-jira.atlassian.net` 를 사용한다.

JQL: `fixVersion = <ID> AND assignee = "<accountId>" ORDER BY issuetype, created`

**토큰 절약 — 필수:**
- Jira 도구가 필드 선택을 지원하면 **`summary`, `issuetype`만** 요청한다. 분류에 쓰는 것은 key·타입·요약뿐이다.
- 페이지 크기는 최대 100으로 요청하고, 응답 형식을 선택할 수 있으면 구조화된 결과를 우선한다.
- 결과가 파일로 저장되면 파일 전체를 본문으로 읽지 말고 실제 응답 스키마를 확인한 뒤 `jq`로 key·타입·요약만 추출한다. `issues.nodes` 형태라면:
  ```
  jq -r '.issues.nodes[] | [.key, .fields.issuetype.name, .fields.summary] | @tsv' <파일>
  ```
- 다음 페이지가 있으면 도구가 제공하는 cursor/page token으로 모두 가져온다. 여러 담당자면 assignee 조건을 빼고 한 번에 받아 그룹핑하는 편이 호출 수와 토큰을 줄인다.

## 2. 유저 체감 필터링 (자동 제외)

릴리즈 노트는 **유저가 직접 체감하는 변화**만 담는다. 아래는 **자동 제외**한다:
- CLI 도구 (`*cli`, `*-scannercli`, `domaincli` 등 사내 개발자용)
- devcontainer / docker 빌드 / Makefile / 빌드환경 / 의존성 정합(`go work sync`) 수정
- 설정·테스트 격리·mock·viper 오염 등 테스트/CI 수정
- pkg 리팩터, 내부 패키지 추출/이주, DTO 내부 배선
- request collapsing / fan-out / stateless cutover 의 **내부 배선**(유저 동작 변화 없는 plumbing)
- 내부 데이터 저장 정합성(필드 누락 저장 등)으로 **결과 화면·응답이 바뀌지 않는** 것
- 문서/CLAUDE.md/설계문서 작성

**포함**하는 것:
- 스캔 결과·응답에 **새로 노출되는 정보**(예: AI 스미싱 판정/카테고리)
- 스캔 **동작 변화**(예: 짧은 문자 AI 스킵)
- 유저가 실제로 부딪힌 **버그**(조회 오류, 화면 멈춤/타임아웃, 엔진 다운/OOM, 통계 비정상 표시 등)
- 콘솔/리포트/통계의 **새 기능·개선**
- 새 **조회/검사 API** 기능

애매하면 제외하지 말고 사용자에게 "이건 유저 체감 약한데 넣을까?" 로 물어본다.

## 2.5 일감 레벨 — 에픽/스토리 위주, 서브태스크는 롤업 (가장 중요)

릴리즈 노트는 **에픽/스토리(= 유저 입장에서의 변화 단위) 레벨**로 적는다. 개발자 액션 단위의 **짜잘한 서브태스크/구현 디테일을 1:1 로 줄세우지 않는다.** (이게 가장 흔한 실수다 — 실제로 짜잘한 게 잔뜩 들어가기 쉽다.)

일감 계층(이 팀 기준):
- **에픽** = 큰 주제 (예: "sms-scanner 독립 서비스 분리", "Griffin AI 서비스 개발")
- **하위태스크**(작업/스토리/버그/개선/새기능) = 유저 입장에서의 변화 단위 ← **릴리즈 노트는 이 레벨**
- **서브태스크**(하위 작업) = 커밋/브랜치 단위 개발 액션 ← **노트에 직접 쓰지 않음**

판단 절차:
1. 각 이슈가 어떤 **에픽/스토리에 속하는지** 먼저 묶는다. (제목의 `[stateless-N]`, `Phase N`, `[cutover-N]`, 같은 epic prefix, 같은 패키지/서비스 등이 단서.)
2. 한 에픽 아래 잘게 쪼개진 Phase/버그/개선이 여러 개면, **개별로 쓰지 말고 그 에픽/스토리의 유저 체감 결과물 1줄(또는 소수)로 합친다.**
3. 그 에픽 자체가 **백엔드 리팩터라 유저 비체감**이면(예: 서비스 분리, 무상태 cutover, request collapsing) → **노트에서 통째로 생략**하거나, 꼭 알려야 하면 추상화한 1줄만.

구체 예시:
- ❌ 나쁜 예 (서브태스크/구현 디테일을 줄세움):
  - "publicapi SMS cutover stateless 경로 client_ip/apikey 누락 수정"
  - "web/privateapi 동일 이슈 확산 수정"
  - "follower 요청 PENDING 상태 기록"
  → 이건 전부 "sms-scanner 분리" 에픽 하위 구현 디테일. **노트에 넣지 않는다.**
- ✅ 좋은 예 (에픽의 유저 체감 결과만):
  - "Griffin AI 연동 — SMS 스캔 시 스미싱 판정·유형 분류 결과 제공" (Griffin AI 서비스 개발 에픽의 유저 체감 산출물)

원칙: **"이 줄이 유저가 인지하는 하나의 기능/변화인가, 아니면 그걸 만들기 위한 내부 작업인가?"** 후자면 부모 스토리로 올리거나 뺀다.

## 3. 분류 체계

**제품(대분류)** — 실제 노출 위치 기준:
- `SMS Scanner` — 문자 검사 엔진/서비스 동작·응답
- `URL Scanner` — URL 검사 엔진 동작
- `Griffin AI` — griffinsmishing-ai 스미싱 판정 AI 서비스 (모델·추론 엔진 자체 변화)
- `NSFW AI` — nsfw-ai 이미지 분석 서비스 (모델·추론 엔진 자체 변화)
- `Web` — 일반 사용자 웹 화면
- `Console` — 관리/기업 콘솔(리포트·통계·블랙/화이트리스트)
- `PrivateAPI` — Private REST API (파트너/내부 연동)
- `API` — 외부 연동 API(KISA 등) 및 계정/프로필

**분류**: `새 기능` / `기능 개선` / `버그 수정`

**중분류(영역)** — 콘솔 화면/탭 이름에 맞춘다. 예시:
`스캔 요청 - URL`, `스캔 요청 - SMS`, `스캔 요청 - GetAPK`, `스캔 결과 - URL`, `스캔 결과 - SMS`, `블랙리스트`, `화이트리스트`, `리포트`, `통계`, `기타`

## 4. 출력 형식

`제품 / 분류 / 세부 내용` 3컬럼. **세부 내용**은 `중분류 → 소분류(구체 설명)` 네스트 구조.

마크다운 표(세부 내용 셀은 `중분류<br>　• 소분류` 형태)와, 시트 붙여넣기용 평문(들여쓰기 불릿) 둘 다 출력한다.

**빈 분류 행 처리:** 버그 수정/기능 개선/새 기능 중 해당 항목이 없는 행은 **회사 양식(Confluence 고정 템플릿)이면 유지**한다 — 빈 행이 "이 분류에 업데이트 없음"을 명시하는 신호다. 자유형식 표라면 제거해도 무방.

**중분류 카테고리 일관성:** 한 셀 내에서 기준을 통일한다. "스캔 요청(요청 타입별)"과 "SMS 검사 서비스(서비스별)"를 같은 셀에 섞지 않는다. 실제로 다른 변화면 임의로 병합하지 않는다.

소분류 문구 규칙:
- 일반인이 봐도 이해되게. 전문용어(tenant, DeadlineExceeded, request_infos, gRPC 등) 금지.
- 동작 중심으로: `~ 추가` / `~ 하도록 개선` / `~ 현상 수정`.
- 각 항목 끝에 추적용으로 이슈 키를 작게 덧붙여도 됨(사용자가 빼라면 뺀다).

## 5. 마무리

- **제외한 이슈 목록**을 별도로 접어서 보여줘 사용자가 누락을 검증할 수 있게 한다.
- 제품/중분류 명칭이 팀 정식 메뉴명과 다를 수 있으니 "메뉴명 맞춰줄 게 있으면 알려달라"고 안내한다.
- 노출 화면이 애매한 항목(Web vs Console 등)은 짚어준다.

## 6. Confluence 페이지에 직접 반영할 때 (덮어쓰기 사고 방지)

기본은 **표만 출력**한다. 사용자가 "이 페이지에 넣어줘" 라고 명시할 때만 Confluence 를 수정한다.

Confluence MCP 는 **부분 수정이 불가**하고 본문 전체를 교체한다. 따라서 다른 사람이 동시에 편집 중이면 그 변경을 덮어쓸 수 있다. **반드시:**
1. **저장 직전에** `getConfluencePage` 로 **현재 본문과 version 번호를 다시 읽는다.** (이전 턴에 읽어둔 본문을 재사용하지 말 것 — 그 사이 누가 편집했을 수 있다.)
2. 방금 읽은 최신 본문에 **내 변경만 더해서** 전체 본문을 구성한다. (기존 행/내용은 한 글자도 빠뜨리지 않는다.)
3. 저장 후 응답의 `version.number` 가 **읽었던 번호 +1 인지 확인**한다. 건너뛰었으면(예: 읽을 땐 5인데 저장 결과가 10) 그 사이 편집이 있었다는 뜻 → 사용자에게 알리고 버전 기록 확인을 권한다.
4. `versionMessage` 에 무엇을 추가했는지 한 줄로 남긴다.

여러 번 수정할 때는 매 저장마다 1~3 을 반복한다. (토큰이 더 들어도 공유 페이지에선 필수.)
