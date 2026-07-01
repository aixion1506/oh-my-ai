# 커스텀 산출물 인덱스 (MINE)

이 dotfiles 레포에서 **사용자가 추가한 커스텀 산출물**만 모아 보는 인덱스.
(커뮤니티/기본 스킬과 구분용. 커스텀 스킬은 `SKILL.md`의 `metadata`를 채우고 `make instructions`로 등록한다.)

## 스킬
스킬은 frontmatter `metadata.source` 로 출처 표기 (born-here / 외부 origin).

### born-here (처음부터 이 레포에서 만든 것)
{{GENERATED_BORN_HERE_SKILLS}}

### 외부 파생 (외부 베이스 + 사용자 context, 승격됨)
- (아직 없음 — 외부 스킬을 커스터마이즈하기 시작하면 여기로 승격 + `source: <origin>` 표기)

## 데이터/기타
- `instructions/harness.md` — Claude/Codex 공통 운영 정책 원본 (문서 산출물 추적·작업 라우팅·Git 원칙)
- `instructions/mine.md` — `MINE.md` 자동 생성용 템플릿
- `instructions/execution-policy.md` — 파일 수정 방식 선택을 위한 execution mode 정책
- `automation-backlog.md` — harness-automation 용 toil 후보 누적장 (SessionStart 훅이 매 세션 띄움)
- `claude/settings.json` UserPromptSubmit 훅 — toil·스킬 라우팅 신호를 감지해 컨텍스트 주입
- `codex/hooks.json` UserPromptSubmit 훅 — Codex에서 toil·스킬 라우팅 신호를 감지해 컨텍스트 주입
- `claude/settings.json` SessionStart 훅 #2 — 현재 디렉토리의 docs/context/ 파일 목록 자동 주입
- `docs/harness-design.md` — 하네스 설계·결정·현황 기록 (WHY 중심, 상태표)
- `docs/incidents/2026-06-24-bwrap-retry-loop.md` — 편집 도구 장애의 재시도·토큰 폭주 incident와 방지 규칙
- `docs/devcontainer-workflow.md` — oh-my-ai/심링크/계정 워크플로 상세 (CLAUDE.md에서 강등)
- `scripts/harness-event.mjs` + XDG state — Claude/Codex SkillStart를 Git 저장소 단위로 기록·집계 (월간 prune용)
- `scripts/prompt-routing-hook.mjs` — UserPromptSubmit에서 toil·handoff·project-context 신호를 결정적으로 보강
- `profiles/example/PROFILE.md` — 개인 profile 분리 예시 템플릿
- `profiles/example/commit-helper.sh.example` — 개인 커밋 helper 예시 템플릿
- `profiles/example/push-guard.sh.example` — 개인 push guard 예시 템플릿
- `scripts/cascade-check.sh` — 커스텀 비스킬 산출물 MINE.md 등록 검사
- `scripts/render-instructions.sh` — 스킬 메타데이터와 공용 원본으로 MINE/Claude/Codex 산출물 생성
- `scripts/fix-plugin-install-paths.sh` — devcontainer/host `$HOME` 불일치로 깨진 `~/.claude/plugins/installed_plugins.json`의 installPath를 진단·교정

## 공유 파일의 커스텀 편집분 (참고)
- `CLAUDE.md` — 표현 원칙 / 반복 업무 자동화 트리거 / devcontainer 심링크 구조 명시
- `claude/settings.json` — SessionStart 훅 (automation-backlog 주입) + UserPromptSubmit 훅 (prompt routing)
