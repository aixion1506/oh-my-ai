---
name: project-context
description: Use when starting a new session on a codebase, resuming interrupted work from a previous session, after making an architectural or design decision, or before ending a session or creating a PR — to create, update, or hand off docs/context/ project context files.
metadata:
  source: born-here
  summary: 세션 간 설계 배경과 작업 상태를 이어주는 컨텍스트 관리
---

# Project Context — 생성·업데이트·핸드오프

## Overview

세션 간 컨텍스트 단절 문제를 해결하는 living doc 관리 스킬.  
`docs/context/<도메인>/<서비스>.md` 를 생성·업데이트·핸드오프해서 새 세션도 즉시 맥락을 확보한다.

**핵심 원칙: 태스크 목록만으로는 핸드오프 불가.** 결정 로그·설계 배경·파일 맵이 함께 있어야 다음 세션이 이어받을 수 있다.

---

## 모드 선택

```
docs/context/ 파일 있음? ─── YES ──→ [UPDATE] 또는 [HANDOFF]
        │                                    │
        NO                          세션 끝/PR 전? ─── YES ──→ [HANDOFF]
        │                                    │
        ↓                                   NO
    [CREATE]                            [UPDATE] (결정 로그만)
```

---

## 파일 경로 규칙

```
docs/context/<도메인>/<서비스>.md
```

**도메인 결정 순서:**
1. 현재 git 브랜치 → 이슈 트래커 항목 → 상위 작업 (`<ISSUE-123>` → parent `<EPIC-456>` → `<domain-name>`)
2. 작업 디렉토리명 (`audit/`, `url-scanner/` 등)
3. 모호하면 사용자에게 확인

**예시:**
- `docs/context/db-migration/audit.md`
- `docs/context/url-scanner/request-collapsing.md`
- `docs/context/console/audit-targetid.md`

---

## [CREATE] 신규 생성

컨텍스트 파일이 없을 때.

1. 도메인·서비스명 결정 (위 경로 규칙 따라)
2. 아래 템플릿으로 생성
3. 현재 브랜치·이슈 트래커·알려진 상태로 채움
4. 사용자 확인 후 파일 작성

### 템플릿

```markdown
---
module: <서비스명>
last_updated: <YYYY-MM-DD>
issue_parent: <EPIC-456> (<상위 작업 제목>)
branch: <현재 브랜치>
---

## 현재 상태

| 작업 | 이슈 | 상태 | 비고 |
|------|------|------|------|
| ...  | ...  | ⏳   |      |

## 핵심 결정 로그

| 날짜 | 결정 | 이유 |
|------|------|------|

## 파일 맵

```
<서비스>/
├── ...  # 주요 파일과 역할
```

## 남은 태스크

| # | 작업 | 파일 |
|---|------|------|

## 핸드오프 — 새 Claude 세션 시작 시 붙여넣기

```
<현재 작업 요약>

컨텍스트:
- <핵심 배경 1>
- <핵심 배경 2>

현재 상태:
- <완료된 것> ✅
- <진행 중> 🔄
- <미착수> ❌

해야 할 것 (순서대로):
1. ...

핵심 설계 결정:
- <결정 1>: <이유>
- <결정 2>: <이유>

레퍼런스 파일:
- <파일 경로> — <역할>

규칙: 현재 execution mode를 따른다. `suggest-only`이면 diff 형식(+/- 마커)으로 변경안을 보여주고 직접 수정하지 않는다.
```
```

---

## [UPDATE] 결정 로그 추가

세션 중 아키텍처·설계 결정을 내렸을 때.

1. 기존 파일 Read
2. `핵심 결정 로그` 테이블에 행 추가:
   - 날짜: 오늘
   - 결정: 결정 내용 (무엇을 선택했나)
   - 이유: 선택하지 않은 대안 포함한 근거
3. `현재 상태` 표 상태 변경 있으면 업데이트
4. `last_updated` 갱신

---

## [HANDOFF] 세션 종료·PR 전

다음 세션이 즉시 이어받을 수 있게 핸드오프 섹션을 최신화.

1. 기존 파일 Read
2. `현재 상태` 표 갱신 (이번 세션에서 완료된 것 ✅, 새로 시작된 것 🔄)
3. `남은 태스크` 갱신
4. `핸드오프` 섹션 재작성:
   - 이번 세션에서 한 것
   - 내린 결정 요약
   - **정확한 다음 단계** (파일명·함수명·줄번호 수준)
   - 레퍼런스 파일 목록
5. `last_updated` 갱신

**핸드오프 섹션은 다음 세션에 그대로 붙여넣기 가능해야 한다.**  
"대략 이런 작업" 수준이면 부족 — "다음 할 일은 X 파일 Y 함수부터" 수준이어야 한다.

---

## 발동 시점 요약

| 상황 | 모드 |
|------|------|
| 세션 시작 + `[HARNESS:context]` 목록 보임 | 목록에서 관련 파일 Read |
| 세션 시작 + context 파일 없음 | CREATE |
| 중요 결정 내린 직후 | UPDATE (결정 로그) |
| 세션 종료 / PR 생성 전 | HANDOFF |
| 새 기능·서비스 착수 | CREATE |

---

## 흔한 실수

| 실수 | 올바른 방법 |
|------|-------------|
| 태스크 목록만 남김 | 결정 로그·이유·대안까지 |
| 핸드오프를 "대략" 수준으로 | 파일명·다음 단계 구체적으로 |
| 세션 끝에 깜빡함 | PR 커밋 전에 context 파일 업데이트 포함 |
| 도메인 구분 없이 flat하게 | `docs/context/<도메인>/` 하위로 분류 |
