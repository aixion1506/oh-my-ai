---
name: completion-notify
description: Use when a user wants to install, inspect, test, diagnose, or remove the optional local Codex and Claude Code Turn completion notification integration on macOS.
metadata:
  source: born-here
  summary: Codex·Claude Turn 완료 알림을 opt-in으로 안전하게 설치·점검·제거하는 로컬 통합
---

# Completion notification (optional local integration)

This is an explicit opt-in local integration, not an automatic Skill action.

Use the Make commands from the oh-my-ai source repository:

```bash
make install-completion-notify
make completion-notify-status
make test-completion-notify
make doctor-completion-notify
make uninstall-completion-notify
```

`make install` asks for consent only on an interactive TTY. Non-interactive
installation requires `make install ENABLE_COMPLETION_NOTIFY=1` and is safely
skipped outside macOS.

The notification means **Codex Turn 완료** or **Claude Turn 완료**, never an
overall task success. It shows the working-directory basename and the first
safe line of the last assistant response; it excludes prompt text, paths,
code, diffs, branches, Jira identifiers, and secrets.

The installer previews the change and creates timestamped backups before it
replaces Codex's single top-level `notify` entry. An existing Codex provider
is retained as an asynchronous downstream provider. Claude's `Stop` hook is
merged additively. Failure restores the backups.

`uninstall` restores only when the active Codex `notify` still exactly points
to this dispatcher. If it has diverged, it makes no change and reports the
manual recovery path. Provider delivery is fail-open and never blocks a turn.

Manual E2E is separate: use an explicitly approved macOS configuration or a
disposable HOME. Fixtures never call Notification Center or modify real user
settings.
