# devcontainer / oh-my-ai 워크플로 (상세)

> `instructions/harness.md`의 "devcontainer / oh-my-ai 작업 — 트리거"에서 가리키는 상세 레퍼런스.
> oh-my-ai 레포를 만지거나 `~/.claude`/`~/.codex` 연결 구조가 헷갈릴 때 읽는다. (평소 세션엔 불필요 → 항상 로드 안 함.)

## 심링크 구조 (매번 헤매던 부분)
- **`~/.claude/`, `~/.codex/`, `~/.agents/` 자체는 진짜 디렉토리다.** "심링크"는 그 안의 **개별 엔트리**에만 걸려 있다: `~/.claude/CLAUDE.md`는 `claude/CLAUDE.md` 생성물을, `~/.claude/skills`와 Codex 공식 사용자 스킬 경로 `~/.agents/skills`는 공용 `skills/` 원본을, `~/.codex/AGENTS.md`는 `AGENTS.md` 생성물을 가리킨다. Claude의 `settings.json`, `hooks/`, `agents/`는 dotfiles 레포 **`~/Github/oh-my-ai/claude/`** 의 동명 파일/디렉토리를 가리킨다. (레포 경로는 `~/oh-my-ai`가 아니라 **`~/Github/oh-my-ai`**.)
- 그래서:
  - Claude 스킬/커맨드처럼 심링크된 엔트리를 고치면 레포에 바로 반영됨.
  - 공유 instruction과 인덱스는 생성물을 직접 고치지 말고 `instructions/harness.md`, `instructions/mine.md`, `instructions/adapters/*.md`, 또는 `SKILL.md` 메타데이터를 고친 뒤 `make instructions`를 실행한다.
  - `~/.claude/`나 `~/.codex/` 최상위에 **새 파일**을 만들면 레포에 안 들어간다 — 레포에 직접 만들고, 필요하면 별도 심링크를 건다.

## Codex instruction 연결
- `setup.sh`는 `~/.codex/AGENTS.md`를 레포의 `AGENTS.md` 생성물로, `~/.agents/skills`를 공용 `skills/` 원본으로 심링크한다.
- 기존 `~/.agents/skills`가 실제 디렉터리면 `~/.agents/skills.pre-oh-my-ai`로 한 번 백업한 뒤 공용 원본을 연결한다.
- Codex CLI 설치와 인증/세션 관리는 instruction 배포와 분리한다.

## Portable 경로 (머신별 절대경로 하드코딩 금지)
- 머신마다 절대경로가 다르다 (홈이 `/home/vscode`인데 심링크는 `/home/shpark/...`로 적혀 있고 양쪽이 같은 실경로로 resolve됨).
- 그래서 **레포에 커밋되는 설정(settings.json 등)에 머신별 절대경로를 하드코딩하지 말 것.** 런타임에 풀어 쓴다:
  `"$(dirname "$(dirname "$(readlink -f ~/.claude/settings.json)")")"` → 레포 루트.

## 커밋/푸시 — 개인 계정 전용 (안전 규칙)
- **oh-my-ai(dotfiles) 레포는 절대 회사 계정(shpark26/shpark-nurilab)으로 커밋하지 않는다.** 항상 개인 계정(`aixion1506` / `aixion1506@gmail.com`).
- `setup.sh`가 이 레포의 local git config(user.name/email)를 aixion1506으로 자동 설정함 (= 커밋 author는 자동으로 맞음).
- push 권한은 개인 계정 필요. **단축 스크립트 권장:**
  ```bash
  bash scripts/omai-commit.sh "메시지" [경로...]   # 전환→add→commit→push→복귀 한 번에
  ```
  수동(동등):
  ```bash
  cd ~/Github/oh-my-ai && gh auth switch --user aixion1506
  git add . && git commit -m "..." && git push
  gh auth switch --user shpark-nurilab   # 회사 계정 복귀
  ```
- push 가드 훅(`hooks/oh-my-ai-push-guard.sh`)이 회사계정 push를 차단한다(이중 안전).
- 글로벌 git config는 회사 계정(shpark26)이므로, 다른 레포(askurl 등)에서는 그대로 둘 것.
