# Example Profile

이 파일은 shared harness 위에 얹는 개인 설정 예시다. 실제 계정명, 토큰, 회사명, 내부 URL은 커밋하지 않는다.

## 응답 / 구현 선호
- 대화 언어: 사용자가 지정한 언어를 따른다.
- execution mode: `patch-with-approval` (shared 기본값)
- 필요하면 `suggest-only`, `patch-with-approval`, `auto-apply` 중 하나로 바꾼다.
- 관점 우선순위: 작업 도메인에 맞춰 정한다.

## 업무 방식
- 개인 업무 도구나 회사별 워크플로는 이 profile에만 둔다.
- shared instruction에는 특정 회사 도구, 계정, 내부 URL을 넣지 않는다.

## GitHub 계정 정책
- 커밋·푸시 전 `remote`, `branch`, `author`, GitHub 인증 계정을 확인한다.
- 개인 계정 정책이 필요하면 `<your-github-user>`, `<work-github-user>` 같은 placeholder를 local env에서 채운다.
- 특정 계정 강제, 계정 전환, push guard는 local hook 또는 private script로 둔다.

## 로컬 환경
- `HARNESS_PROFILE`
- `HARNESS_EXECUTION_MODE=patch-with-approval`
- `GITHUB_PRIMARY_USER=<your-github-user>`
- `GITHUB_WORK_USER=<work-github-user>`
