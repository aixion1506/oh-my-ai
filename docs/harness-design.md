# 하네스 설계 (harness design)

개인 AI 하네스(oh-my-ai)의 설계·결정·현황 기록.
용어는 생성된 `CLAUDE.md` 또는 `AGENTS.md` 의 "하네스 용어" 참조 (하네스 / 트리거↔플레이북 / cascade).
성격: **개인 의사결정 기록** — WHY 중심, 고민 흔적 포함, 상태표 유지. (Confluence 공유용 아님.)

## 1. 한 줄 정의
모델(Claude)은 못 바꾸니, 그 **주변(컨텍스트·도구·워크플로·진화)을 엔지니어링**해 같은 모델로 더 안정적·유용하게 만든다.

## 2. 아키텍처
```
상황/입력
  └─ 트리거(CLAUDE.md, 항상 켜짐) ──매칭──> 플레이북(스킬, 필요시) ──> 산출
        (라우팅 표 / 규칙)                  (상세 절차)

  커스텀 스킬을 만들거나 바꾸면
  └─ SKILL.md metadata ──make──> 트리거 엔트리 + MINE.md + AI별 instruction  (자동 projection)
```
- **트리거 = 결정적**(항상 로드되니 확실히 발동). **플레이북 = 확률적**(description 매칭).
- 그래서 **반드시 떠야 하는 건 트리거(CLAUDE.md)/훅에, 두꺼운 절차는 플레이북에.**

## 3. 구성요소 (상태표)

| 요소 | 역할 | 종류 | 상태 |
|------|------|------|------|
| `CLAUDE.md` (하네스용어·표현원칙·품질기준·작업라우팅·배치규칙·자동화트리거·스킬출처) | 트리거 + 원칙(상시 규칙) | 결정적(항상 로드) | 운영 |
| `skills/harness-automation` | toil 자동화 판단·구조화 플레이북 | 확률적(description) | 운영, **미검증** |
| `skills/execution-recovery` | 도구 장애 재시도 폭주 차단·대피 플레이북 | 상시 트리거 + 스킬 | 운영, 실사용 검증 대기 |
| `skills/release-note` | Jira 릴리즈를 사용자 체감 릴리즈 노트로 정리 | 확률적(description) + 명시적 호출 | 운영 |
| `automation-backlog.md` + SessionStart 훅 | toil 후보 누적 + 세션 주입 | 결정적(훅) | 운영, **데이터 0** |
| `skills/project-context` + SessionStart 훅 | 세션 간 컨텍스트 단절 해소: docs/context/ living doc 감지·주입 | 결정적(훅) + 확률적(스킬) | 운영, **미검증** |
| 공용 SkillStart 이벤트 + XDG state | Claude/Codex 사용을 Git 저장소 단위로 측정 | Claude 훅 + Codex 명시 emit | 운영, Codex는 soft |
| `claude/hooks/oh-my-ai-push-guard.sh` (PreToolUse) | 회사계정 oh-my-ai push 차단 | 결정적(훅) | 운영, 분기 검증 완료 |
| `docs/devcontainer-workflow.md` | oh-my-ai/심링크/계정 워크플로 상세 | 레퍼런스(트리거로 강등) | 운영 |
| `MINE.md` | SKILL.md 메타데이터로 생성되는 커스텀 산출물 인덱스 | 생성물 | 운영 |
| 스킬 출처(provenance) 컨벤션 | born-here vs 외부 파생 | 규칙 | 정의됨, born-here 5건 적용 |

## 4. 설계 결정 + WHY (고민 흔적)
- **트리거=CLAUDE.md / 플레이북=스킬**: 항상 로드는 비싸고 attention 희석 → CLAUDE.md는 얇게, 상세는 on-demand 스킬.
- **backlog + SessionStart 훅**: 세션은 매번 기억 0 → 크로스세션 toil 누적이 사각지대. 훅=읽기 보장(결정적), 쓰기는 내 규율(soft). soft를 persistent로 끌어올리는 장치.
- **rule of three / premature vendoring 금지**: 아직 안 굳은 걸 일찍 도구화·소유하면 재작업·유지비. (역설: 하네스 자체를 한 세션에 빨리 지음 → 검증 필요.)
- **스킬 메타데이터를 단일 원본으로**: 라우팅·MINE·AI별 instruction은 `make instructions`가 자동 projection. 수동 cascade는 drift와 토큰 낭비를 만들므로 제거.
- **실행 장애 circuit breaker**: 동일 실패는 최대 1회, 결정적 인프라 오류는 재시도 0회. 대피·승인을 각각 1회로 제한한다.
- **런타임 중립 사용 측정**: 이벤트 schema와 XDG state는 공용으로 두고 Claude/Codex는 얇은 emitter만 가진다. raw 로그는 Git에 커밋하지 않고 repo 필드로 집계한다.
- **명명**: 라우터/핸들러(기계적) 기각 → **트리거/플레이북**(목적 표현). **cascade > wiring** (동작 vs 상태; 원하는 건 "퍼져서 갱신"=동작).
- **portable 경로**: settings.json 심링크를 역추적해 레포 위치 도출 → 머신/홈(`vscode`↔`shpark`) 달라도 동작. 절대경로 하드코딩 금지.

## 5. 현재 한계 (정직)
1. **대부분 soft(프롬프트 기반).** 결정적인 건 훅뿐(SessionStart 주입 + 사용측정 + 회사계정 push 가드). 안전·핵심 규칙부터 점진적으로 hard화 중.
2. **실사용 검증 0.** 한 세션에 많이 지음 → 한 달 써봐야 살아남는지/죽은 config인지 판별 가능.
3. **Codex SkillStart는 soft.** native Skill 이벤트가 없어 AGENTS 규칙의 명시 emit에 의존한다. 누락률을 본 뒤 wrapper/MCP 승격 여부를 판단한다.

## 6. 다음 단계 (전부 usage-gated — 트리거 전엔 premature)
> 원칙: 당장 더 짓지 말고 **실사용으로 검증·prune 먼저.** 아래는 각 항목을 "언제" 착수할지.

| 항목 | 트리거 (언제 착수) | 메모 (디테일·주의) |
|------|-------------------|-------------------|
| **/insights** (죽은 스킬 탐지) | usage 로그 데이터 쌓이면 | report-only(자동삭제 X). `실패횟수` 플래그는 현재 로그에 에러필드 없어 제외 |
| **월간 prune·강화** | 데이터 쌓인 뒤 월 1회 | `harness-usage.log` `uniq -c` → 안 쓰는 스킬 정리, 자주 쓰는 건 강화 |
| **vendored 스킬 audit** | 외부 스킬(golang·kotlin 등)이 실제 거슬릴 때 | 승격 유지 vs 마켓플레이스로 제거 |
| **must-have 결정적화** | 점진적 (안전·핵심 규칙부터) | soft 규칙 → 훅/스크립트/CI로 이전 |
| **verdict 캡처** | "품질 판단 기록 필요" 느낄 때 | 품질은 사람이 느낌 — 정량 신호 아님(그래서 측정과 분리) |
| **로컬 검색 하네스** | 자연어 단서 기반 파일·문서 탐색에서 raw `rg`/`find` 반복이 3회 이상 보이면 | Jikji는 외부 CLI 기반 optional backend 후보로만 검증한다. `docs/context/` 전용 FTS5는 하위 후보로 유지한다. 코드 심볼·정확 문자열·정규식·config key 검색은 `rg` 우선, 자연어 단서 기반 문서/파일 discovery는 Jikji 우선 검토. Markdown/docs/files가 source of truth이고, SQLite/FTS5/`.jikji/`/`.jikji_agent_map.md`/`.jikji/doc_text/`는 Git·rsync 대상이 아닌 재생성 가능한 검색 index/cache/read model이다. |
| **universal cascade** (git pre-commit) | 생 `git commit`으로 drift 한 번 새면 | 현재는 omai-commit 경로만 강제. judgment(배치)는 훅 불가 |
| **settings.json wiring 체크** | 훅 만들고 연결 빼먹는 일 실제로 생기면 | 훅 파일 존재 ↔ settings.json 참조 대조 |
| **golden prompts** (회귀 감지) | 큰 하네스 변경 후 | 수동 eyeball (prompt 하네스는 자동 pass/fail 불가). revert는 복구일 뿐 |
| **자동 projection 실사용 검증** | 다음 커스텀 스킬 추가 시 | SKILL.md 한 곳만 수정 → 라우팅·MINE 자동 생성 확인 |
| **측정 emitter 가시화** | /insights 쓰기 전 또는 노트북에서도 로그 0이면 | `make install`이 `harness-event`를 링크하는지 확인. 훅 `; true`가 silent-fail → `make doctor` 류 health check로 가시화 (fail-closed 아님 — 텔레메트리가 작업 막으면 안 됨) |
| **팀 테스트 스택** (bats + CI + install-smoke) | **팀 단위 도입 시** | git 훅은 팀에서 enforcement 안 됨(.git/ 비공유·`--no-verify`) → CI로 이전. PR CI에 blocking 스크립트 테스트 + drift 가드(`make instructions && git diff --exit-code`) + install smoke. solo면 premature |
