# 개인 개발 스타일

## 구현 방식
- 코드를 직접 편집하지 않는다. 코드는 보여주기만 하고 내가 직접 타이핑한다.
- 이유: 직접 써야 실력이 는다.

## 워크플로 규칙
- Jira 이슈 + 설계 문서가 이미 있으면 `/brainstorming` 스킵하고 바로 `/writing-plans`로 간다.
- 설계 문서 + plan 모두 있으면 "Task N 시작할게" 식으로 바로 구현으로 간다.
  - "plan"이란 `/writing-plans` 스킬로 생성된 plan 파일 (`docs/superpowers/plans/` 하위)을 의미한다.
  - context 문서(audit.md 등)의 task 목록은 설계 문서이지 plan 파일이 아니다.
- `/executing-plans`로 구현 시 task 하나씩 코드 제시 → 내가 타이핑 완료 확인 후 다음 task로 넘어간다. 한꺼번에 다 주지 않는다.
- 불필요한 파일 전체 Read 대신 grep으로 타겟팅한다.

## Jira 이슈 계층 규칙
- 에픽: 2~3달짜리 장기 큰 주제
- 에픽 하위 태스크(작업/스토리/버그/개선/새기능): 유저 입장에서의 변화 단위
- 서브태스크(하위 작업): 실제 개발자가 해야 할 액션 단위 (코드 커밋/브랜치 단위)

## 응답 스타일
- 짧고 직접적으로. 설명 장황하게 하지 말 것.
- 코드 보여줄 때는 변경 전/후를 명확히 구분해서 보여준다.

## 백엔드 관점
- 프론트엔드보다 백엔드/API 관점 우선.
- DB 설계 시 WHY를 문서에 남기는 스타일.

## 문서 전략
- 개인용 (의사결정 기록): WHY 중심, 고민 흔적 포함, 상태 표 유지.
- Confluence용 (팀 공유): 결정된 것만, 간결하게.
- 두 문서 분리 운영. Confluence에 WHY는 안 씀.

## devcontainer 워크플로
- `~/.claude/`는 `~/oh-my-ai/claude/`의 심링크. 수정하면 레포에 바로 반영됨.
- 스킬/커맨드/에이전트 추가 후 반드시 레포에서 커밋/푸시:
  ```
  cd ~/oh-my-ai && git add . && git commit -m "..." && git push
  ```
- **oh-my-ai(dotfiles) 레포는 절대 회사 계정(shpark26/shpark-nurilab)으로 커밋하지 않는다.** 항상 개인 계정(`aixion1506` / `aixion1506@gmail.com`)으로 author/committer 설정.
  - `setup.sh`가 이 레포의 local git config(user.name/email)를 aixion1506으로 자동 설정함.
  - push 권한도 개인 계정 필요: `gh auth switch --user aixion1506` 후 push, 끝나면 `gh auth switch --user shpark-nurilab`으로 복귀.
  - 글로벌 git config는 회사 계정(shpark26)이므로, 다른 레포(askurl 등)에서는 그대로 둘 것.

## 언어
- 대화는 한국어로.
- 코드 주석은 한글로 (프로젝트 CLAUDE.md 규칙 따름).
