<!-- GENERATED FILE. Edit instructions/mine.md or skills/*/SKILL.md metadata, then run make instructions. -->

# 내가 만든 커스텀 (MINE)

이 dotfiles 레포에서 **내가(aixion1506) 추가한 산출물**만 모아 보는 인덱스.
(커뮤니티/기본 스킬과 구분용. 커스텀 스킬은 `SKILL.md`의 `metadata`를 채우고 `make instructions`로 등록한다.)

## 스킬
스킬은 frontmatter `metadata.source` 로 출처 표기 (born-here / 외부 origin).

### born-here (처음부터 내가)
- `skills/daily-report/` — 오늘 한 일을 프로젝트별 진척률과 함께 취합·정리
- `skills/harness-automation/` — 반복 업무를 감지하고 적절한 자동화 형태로 구조화
- `skills/project-context/` — 세션 간 설계 배경과 작업 상태를 이어주는 컨텍스트 관리
- `skills/release-note/` — Jira 릴리즈를 사용자 체감 릴리즈 노트로 자동 정리
- `skills/worklog-note/` — 장황한 노션 업무일지를 한눈에 들어오도록 정리

### 외부 파생 (외부 베이스 + 내 context, 승격됨)
- (아직 없음 — 외부 스킬을 커스터마이즈하기 시작하면 여기로 승격 + `source: <origin>` 표기)

## 데이터/기타
- `instructions/mine.md` — `MINE.md` 자동 생성용 템플릿
- `automation-backlog.md` — harness-automation 용 toil 후보 누적장 (SessionStart 훅이 매 세션 띄움)
- `claude/settings.json` SessionStart 훅 #2 — 현재 디렉토리의 docs/context/ 파일 목록 자동 주입
- `docs/harness-design.md` — 하네스 설계·결정·현황 기록 (WHY 중심, 상태표)
- `docs/devcontainer-workflow.md` — oh-my-ai/심링크/계정 워크플로 상세 (CLAUDE.md에서 강등)
- `claude/settings.json` PostToolUse 훅 + `~/.claude/harness-usage.log` — 스킬/커맨드 사용 측정 (월간 prune용)
- `claude/hooks/oh-my-ai-push-guard.sh` (PreToolUse) — oh-my-ai 회사계정 push 차단 (soft 규칙 → hard 결정성)
- `scripts/omai-commit.sh` — oh-my-ai 커밋·푸시 한 줄(계정 자동 전환·복귀). 반복 4단계 자동화.
- `scripts/cascade-check.sh` — 커스텀 비스킬 산출물 MINE.md 등록 검사 (omai-commit 통합, drift 방지)
- `scripts/render-instructions.sh` — 스킬 메타데이터와 공용 원본으로 MINE/Claude/Codex 산출물 생성

## 공유 파일에 내가 넣은 편집분 (참고)
- `CLAUDE.md` — 표현 원칙 / 반복 업무 자동화 트리거 / devcontainer 심링크 구조 명시
- `claude/settings.json` — SessionStart 훅 (automation-backlog 주입)
