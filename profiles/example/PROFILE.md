# Example Profile

이 파일은 shared harness 위에 얹는 개인 설정 예시다. 실제 계정명, 토큰, 회사명, 내부 URL은 커밋하지 않는다.

## 사용 흐름 (Quick Start)

```bash
# 1. 내 profile scaffold 생성 (profiles/local/<name>/ 은 gitignored)
make init-profile PROFILE=<name>

# 2. 생성된 파일의 <placeholder> 값을 실제 값으로 채운다
#    profiles/local/<name>/commit-helper.sh  — GITHUB_PRIMARY_USER 등
#    profiles/local/<name>/push-guard.sh     — GITHUB_PRIMARY_USER 등
#    profiles/local/<name>/claude-settings.json — permission, plugin 목록

# 3. 실행 스크립트를 ~/.local/bin/ 에 링크
make install-profile PROFILE=<name>

# 4. 설치 상태 확인
make doctor

# 5. profile 활성화 (지속하려면 ~/.bashrc 또는 ~/.zshrc 에 추가)
export HARNESS_PROFILE=<name>
```

`profiles/local/` 은 gitignored다. 실제 계정값이나 토큰을 이 디렉토리에 커밋하지 않는다.

---

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
