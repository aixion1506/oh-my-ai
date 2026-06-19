# 내가 만든 커스텀 (MINE)

이 dotfiles 레포에서 **내가(aixion1506) 추가한 산출물**만 모아 보는 인덱스.
(커뮤니티/기본 스킬과 구분용. 새로 만들면 `harness-automation` 스킬 규칙에 따라 여기 한 줄 등록한다.)

## 커맨드
- `commands/release-note.md` — Jira 릴리즈를 유저 체감 릴리즈 노트로 자동 정리

## 스킬
스킬은 frontmatter `metadata.source` 로 출처 표기 (born-here / 외부 origin).

### born-here (처음부터 내가)
- `skills/harness-automation/` — 반복 업무(toil) 감지 후 자동화 판단·구조화 방법론
- `skills/project-context/` — 세션 간 컨텍스트 단절 해소: docs/context/ living doc 생성·업데이트·핸드오프

### 외부 파생 (외부 베이스 + 내 context, 승격됨)
- (아직 없음 — 외부 스킬을 커스터마이즈하기 시작하면 여기로 승격 + `source: <origin>` 표기)

## 데이터/기타
- `automation-backlog.md` — harness-automation 용 toil 후보 누적장 (SessionStart 훅이 매 세션 띄움)
- `settings.json` SessionStart 훅 #2 — 현재 디렉토리의 docs/context/ 파일 목록 자동 주입
- `../docs/harness-design.md` — 하네스 설계·결정·현황 기록 (WHY 중심, 상태표)

## 공유 파일에 내가 넣은 편집분 (참고)
- `CLAUDE.md` — 표현 원칙 / 반복 업무 자동화 트리거 / devcontainer 심링크 구조 명시
- `settings.json` — SessionStart 훅 (automation-backlog 주입)
