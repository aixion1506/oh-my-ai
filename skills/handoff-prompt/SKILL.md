---
name: handoff-prompt
description: Use when ending a session, switching AI tools, or creating a PR — to generate a structured handoff prompt that the next AI session can use as context. Covers branch state, completed work, do-not-touch constraints, verification results, and next actions. Does NOT capture raw logs or auto-summarize conversation.
metadata:
  source: born-here
  summary: 세션 전환 시 다음 AI 세션에 붙여넣을 handoff prompt를 사람이 직접 작성하도록 안내
  routing:
    visibility: contextual
    risk_level: medium
    task_types:
      - handoff
      - session-transfer
    triggers:
      - kind: keyword
        values:
          - 핸드오프
          - 인수인계
          - 새 세션
          - 넘겨줘
          - handoff
      - kind: intent
        values:
          - prepare_next_session_context
    keywords:
      ko:
        - 핸드오프
        - 인수인계
        - 넘겨
        - 새 세션
      en:
        - handoff
        - transfer
        - next session
    use_when:
      - 세션 종료나 AI 도구 전환 전에 다음 세션이 이어받을 수 있는 짧은 export prompt가 필요한 경우
    do_not_use_when:
      - 장기 보존할 설계 맥락을 docs/context에 축적해야 하는 경우
    requires:
      - current_repo_state
---

# Handoff Prompt — 세션 전환 export 가이드

## 이 스킬의 범위

이 스킬은 세션이 끝날 때 **다음 AI 세션에 붙여넣을 handoff prompt를 사람이 직접 작성**하도록 안내한다.

- raw log 읽기 금지
- transcript_path 읽기 금지
- 자동 summary 생성 금지
- hook, script, make target 없음
- 자동 `docs/context` 승격 없음

**입력**: 현재 repo 상태, 사람이 확인한 결정·제약·다음 액션  
**출력**: 복붙용 handoff prompt 텍스트

---

## project-context와의 차이

| 항목 | `handoff-prompt` | `project-context` |
|------|-----------------|-------------------|
| 목적 | 다음 세션의 즉시 실행을 위한 단기 export | 장기 설계·결정 맥락 축적 |
| 저장 위치 | 기본 미저장. 필요 시 local-only 임시 파일 | `docs/context/*` (Git tracking 가능) |
| 입력 | 현재 repo 상태 + 사람이 확인한 제약/결정 | human-confirmed 설계 배경, 장기 보존 맥락 |
| Git tracking | 금지 | curated 내용만 가능 |
| 수명 | 다음 세션 시작 후 폐기 | 장기 유지 |

`handoff-prompt`는 `project-context`를 반드시 거칠 필요 없다. 현재 repo 상태만으로도 생성 가능하다.

## conversation-capture와의 차이

`conversation-capture`는 raw event 관측 계층이다. raw log를 생성하고 redacted candidate를 만든다.  
`handoff-prompt`는 그 candidate를 사람이 검토·확인한 뒤에 쓰는 export 단계다.

**흐름**: `conversation-capture` → raw log → human review → confirmed → `handoff-prompt` export

---

## 안전 경계 (항상 준수)

- raw log 원문을 handoff prompt에 포함하지 않는다
- tool output 원문을 장기 복사하지 않는다
- secret / token / 개인 경로를 포함하지 않는다
- 자동 summary를 사실로 단정하지 않는다
- 민감 정보가 포함된 prompt를 다른 AI 세션에 전달하지 않는다
- next session에 raw log를 자동 주입하지 않는다

---

## Handoff Prompt 작성 절차

### 1. 현재 repo 상태 수집 (CLI로 직접 확인)

```bash
git remote -v         # remote 확인 (credential 제거)
git branch            # 현재 브랜치
git status            # worktree 상태
git log --oneline -3  # 최근 커밋
gh pr list            # 열린 PR 목록
```

### 2. 사람이 직접 확인해야 할 항목

아래를 CLI 결과나 직접 판단으로 채운다. **자동 summary가 아니라 사람이 인지하고 있는 사실만 써야 한다.**

- 완료된 변경의 목적
- 중요한 결정과 이유
- 다음 액션 (1~3개, 구체적으로)
- 건드리면 안 되는 브랜치·파일·stash
- 검증 결과 (pass/fail/blocked)

### 3. 템플릿 채우기

아래 템플릿을 복사해서 채운다. 빈 항목은 `(없음)` 또는 `N/A`로 표시한다.

---

## Handoff Prompt 템플릿

```markdown
# Agent Handoff Prompt

## Goal
- <작업 목표와 완료 기준>

## Current Repo State
- Repository: <owner/repo 또는 local path>
- Current branch: <branch>
- Base branch: <base>
- Worktree status: <clean / dirty + 파일 목록>
- Last commit: <sha 제목>
- Remote: <credential 제거한 remote URL>

## Related Work
- Primary PR: <번호/URL/상태>
- Related PRs: <건드리면 안 되는 PR 포함>
- Tags / release baselines: <있으면>

## Do Not Touch
- master 직접 push 금지
- reset / rebase / force push 금지
- <다른 PR 브랜치 이름> 브랜치 금지
- stash@{n} 건드리지 않음
- <generated file 목록> 직접 수정 금지 (make instructions로 재생성)

## Local State / Stash
- Stashes: <관련 항목만>
- Must not apply/drop: <주의 stash>
- Local-only files/profiles: <profiles/local 등 git tracking 안 되는 파일>

## Completed Work
- <완료된 변경 요약 — raw log 아니라 사람이 판단한 사실>
- <중요 결정과 이유>

## Verification
- `make instructions`: <pass / fail / skip>
- `git diff --check`: <pass / fail / skip>
- `make doctor`: <pass / fail / skip>
- Known environment issues: <bwrap 등 환경 제약이 있으면>
- Generated file drift: <make instructions 후 clean 여부>

## Next Action
1. <정확한 다음 액션>
2. <그 다음 액션>
3. <있으면>

## Expected Final Report
- Branch:
- Changed files:
- Verification:
- Risks:
- Whether push/merge/tag was done:
```

---

## 작성 후 체크리스트

- [ ] raw log 원문이 들어가 있지 않은가
- [ ] secret / token / 개인 경로가 포함돼 있지 않은가
- [ ] 자동 summary가 아니라 사람이 확인한 사실만 담겨 있는가
- [ ] Do Not Touch 항목이 명시돼 있는가
- [ ] Next Action이 구체적으로 1~3개 써져 있는가

---

## 저장 여부

**기본: 저장하지 않는다.** 붙여넣고 세션 시작 후 폐기한다.

저장이 필요하면:
- local-only 임시 경로 (`~/.local/state/oh-my-ai/handoff-prompt-<date>.md`)
- Git tracking 금지
- 민감 정보 포함 여부 재확인 후 저장

`docs/context/`에 그대로 저장하지 않는다. `docs/context/`는 human-confirmed 장기 맥락 전용이다.
