# devcontainer에서 심링크 방식으로 oh-my-ai 연동하기

VS Code dotfiles 방식(복사)은 스킬/커맨드를 수정해도 레포에 바로 반영되지 않는다.
devcontainer 안에서도 실제 머신처럼 심링크를 유지하려면 `oh-my-ai`를 컨테이너에 직접 마운트해야 한다.

## devcontainer.json에 마운트 추가

```json
"mounts": [
  "source=${localEnv:HOME}/.claude,target=/home/vscode/.claude,type=bind",
  "source=${localEnv:HOME}/Github/oh-my-ai,target=/home/vscode/Github/oh-my-ai,type=bind"
]
```

## 변경을 커밋에서 제외하기

이 마운트 경로는 로컬 환경에 종속되므로 팀 레포에 커밋하면 안 된다.
로컬에서만 유지하려면:

```bash
git update-index --skip-worktree .devcontainer/devcontainer.json
```

이후 `git add .`에서 자동으로 제외되고 `git status`에도 나타나지 않는다.

해제:
```bash
git update-index --no-skip-worktree .devcontainer/devcontainer.json
```

## 왜 동작하나

많은 devcontainer 설정이 `postStartCommand`로 `/home/<host-user> → /home/vscode` 심링크를 만든다.
이 심링크 덕분에 `~/.claude/` 안의 절대경로 심링크들이 컨테이너 안에서도 정상적으로 리졸브된다.
