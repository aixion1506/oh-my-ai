# devcontainer / oh-my-ai 워크플로 (상세)

> `instructions/harness.md`의 "devcontainer / oh-my-ai 작업 — 트리거"에서 가리키는 상세 레퍼런스.
> oh-my-ai 레포를 만지거나 `~/.claude`/`~/.codex` 연결 구조가 헷갈릴 때 읽는다. (평소 세션엔 불필요 → 항상 로드 안 함.)

## 심링크 구조 (매번 헤매던 부분)
- **`~/.claude/`, `~/.codex/`, `~/.agents/` 자체는 진짜 디렉토리다.** shared install은 그 안의 **개별 엔트리**만 non-destructive 방식으로 연결한다. `~/.claude/CLAUDE.md`, `~/.claude/settings.json`, `~/.codex/AGENTS.md`, `~/.local/bin/harness-event`는 경로가 없거나 이미 이 레포가 관리하는 symlink일 때만 연결한다. `~/.claude/skills`, `~/.agents/skills`, `~/.claude/agents`도 기존 경로가 있으면 자동 대체하지 않고 skip한다.
- 그래서:
  - Claude 스킬/커맨드처럼 심링크된 엔트리를 고치면 레포에 바로 반영됨.
  - 공유 instruction과 인덱스는 생성물을 직접 고치지 말고 `instructions/harness.md`, `instructions/mine.md`, `instructions/adapters/*.md`, 또는 `SKILL.md` 메타데이터를 고친 뒤 `make instructions`를 실행한다.
  - `~/.claude/`나 `~/.codex/` 최상위에 **새 파일**을 만들면 레포에 안 들어간다 — 레포에 직접 만들고, 필요하면 별도 심링크를 건다.

## 설치 정책
- `make doctor` / `setup.sh --doctor`는 현재 symlink·settings·skills 상태만 읽고 충돌 가능성을 출력한다.
- `make install-shared` / `setup.sh --install-shared`는 shared instruction과 helper만 연결한다. 기존 `~/.claude/skills`, `~/.agents/skills`, settings, hooks, agents는 덮어쓰지 않는다.
- `make install-profile PROFILE=<name>`은 명시한 profile만 opt-in 설치한다. `profiles/example/`은 템플릿이고, 실제 개인 profile은 커밋하지 않는 `profiles/local/<name>/`에 둔다.
- Codex CLI 설치와 인증/세션 관리는 instruction 배포와 분리한다.

## Portable 경로 (머신별 절대경로 하드코딩 금지)
- 머신마다 절대경로가 다르다 (홈이 `/home/vscode`인데 심링크는 `/home/<user>/...`로 적혀 있고 양쪽이 같은 실경로로 resolve됨).
- 그래서 **레포에 커밋되는 설정(settings.json 등)에 머신별 절대경로를 하드코딩하지 말 것.** 런타임에 풀어 쓴다:
  `"$(dirname "$(dirname "$(readlink -f ~/.claude/settings.json)")")"` → 레포 루트.

## 커밋/푸시 — shared 기본 원칙
- 커밋·푸시 전 현재 `remote`, `branch`, `author`, GitHub 인증 계정을 확인한다.
- `setup.sh`는 특정 Git author나 GitHub 계정을 고정하지 않는다.
- shared workflow는 특정 계정 전환 스크립트나 push guard를 전제하지 않는다.
- 개인별 계정 정책, 커밋 자동화, push guard는 `profiles/local/` 아래 profile 또는 레포 밖 private script로 분리한다.
