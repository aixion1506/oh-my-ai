# 하네스 설계 (harness design)

개인 AI 하네스(oh-my-ai)의 설계·결정·현황 기록.
용어는 `claude/CLAUDE.md` 의 "하네스 용어" 참조 (하네스 / 트리거↔플레이북 / cascade).
성격: **개인 의사결정 기록** — WHY 중심, 고민 흔적 포함, 상태표 유지. (Confluence 공유용 아님.)

## 1. 한 줄 정의
모델(Claude)은 못 바꾸니, 그 **주변(컨텍스트·도구·워크플로·진화)을 엔지니어링**해 같은 모델로 더 안정적·유용하게 만든다.

## 2. 아키텍처
```
상황/입력
  └─ 트리거(CLAUDE.md, 항상 켜짐) ──매칭──> 플레이북(스킬, 필요시) ──> 산출
        (라우팅 표 / 규칙)                  (상세 절차)

  무언가 만들거나 바꾸면
  └─ cascade ──> 트리거 엔트리 + MINE.md + (README) + 플레이북  (동반 갱신)
```
- **트리거 = 결정적**(항상 로드되니 확실히 발동). **플레이북 = 확률적**(description 매칭).
- 그래서 **반드시 떠야 하는 건 트리거(CLAUDE.md)/훅에, 두꺼운 절차는 플레이북에.**

## 3. 구성요소 (상태표)

| 요소 | 역할 | 종류 | 상태 |
|------|------|------|------|
| `CLAUDE.md` (하네스용어·표현원칙·품질기준·작업라우팅·자동화트리거·스킬출처) | 트리거 + 원칙(상시 규칙) | 결정적(항상 로드) | 운영 |
| `skills/harness-automation` | toil 자동화 판단·구조화 플레이북 | 확률적(description) | 운영, **미검증** |
| `commands/release-note` | 릴리즈노트 자동화 | 수동(`/` 호출) | 운영 |
| `automation-backlog.md` + SessionStart 훅 | toil 후보 누적 + 세션 주입 | 결정적(훅) | 운영, **데이터 0** |
| `skills/project-context` + SessionStart 훅 | 세션 간 컨텍스트 단절 해소: docs/context/ living doc 감지·주입 | 결정적(훅) + 확률적(스킬) | 운영, **미검증** |
| `settings.json` PostToolUse 훅 + `~/.claude/harness-usage.log` | 스킬/커맨드 사용 측정 | 결정적(훅) | 운영, **데이터 수집 시작** |
| `hooks/oh-my-ai-push-guard.sh` (PreToolUse) | 회사계정 oh-my-ai push 차단 | 결정적(훅) | 운영, 분기 검증 완료 |
| `docs/devcontainer-workflow.md` | oh-my-ai/심링크/계정 워크플로 상세 | 레퍼런스(트리거로 강등) | 운영 |
| `MINE.md` | 커스텀 산출물 인덱스 | 문서 | 운영 |
| 스킬 출처(provenance) 컨벤션 | born-here vs 외부 파생 | 규칙 | 정의됨, 적용 1건 |

## 4. 설계 결정 + WHY (고민 흔적)
- **트리거=CLAUDE.md / 플레이북=스킬**: 항상 로드는 비싸고 attention 희석 → CLAUDE.md는 얇게, 상세는 on-demand 스킬.
- **backlog + SessionStart 훅**: 세션은 매번 기억 0 → 크로스세션 toil 누적이 사각지대. 훅=읽기 보장(결정적), 쓰기는 내 규율(soft). soft를 persistent로 끌어올리는 장치.
- **rule of three / premature vendoring 금지**: 아직 안 굳은 걸 일찍 도구화·소유하면 재작업·유지비. (역설: 하네스 자체를 한 세션에 빨리 지음 → 검증 필요.)
- **cascade는 의존 대상만**: 모든 파일 건드리면 과잉. README는 외부 독자층이라 cascade 대상 아님.
- **명명**: 라우터/핸들러(기계적) 기각 → **트리거/플레이북**(목적 표현). **cascade > wiring** (동작 vs 상태; 원하는 건 "퍼져서 갱신"=동작).
- **portable 경로**: settings.json 심링크를 역추적해 레포 위치 도출 → 머신/홈(`vscode`↔`shpark`) 달라도 동작. 절대경로 하드코딩 금지.

## 5. 현재 한계 (정직)
1. **대부분 soft(프롬프트 기반).** 결정적인 건 훅뿐(SessionStart 주입 + 사용측정 + 회사계정 push 가드). 안전·핵심 규칙부터 점진적으로 hard화 중.
2. **실사용 검증 0.** 한 세션에 많이 지음 → 한 달 써봐야 살아남는지/죽은 config인지 판별 가능.
3. **측정 시작됨(데이터 0).** 스킬/커맨드 사용 로그 훅(`harness-usage.log`) 깔림 — 아직 데이터 없음. 월간 `sort|uniq -c` 리뷰로 prune 예정.

## 6. 다음 단계
- (당장 더 짓기 X) **실사용으로 검증·prune** 먼저. 멈추고 한동안 써보는 게 맞다.
- must-have를 **결정적 메커니즘(훅·스크립트·CI)** 으로 점진 이전.
- 측정 훅 깔림 → **데이터 쌓이면 월간 리뷰로 prune·강화** (안 쓰는 스킬/커맨드 정리).
- **#2 vendored 스킬 audit**: 승격 유지 vs 마켓플레이스로 제거 — 순차 진행.
- **다음 도메인**: `/daily-report` (작업 라우팅 + description으로 연결).
