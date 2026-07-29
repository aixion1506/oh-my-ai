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
make install-completion-notify ENABLE_COMPLETION_NOTIFY=1
make completion-notify-status
make test-completion-notify
make doctor-completion-notify
make uninstall-completion-notify
```

`make install` and `make install-completion-notify` ask for consent only on an
interactive TTY. Non-interactive installation requires
`ENABLE_COMPLETION_NOTIFY=1` and is safely skipped outside macOS.

The notification means **Codex Turn 완료** or **Claude Turn 완료**, never an
overall task success. It shows only the normalized working-directory basename
and the fixed body `응답이 완료되었습니다. 결과를 확인하세요.` Assistant-response
summaries are intentionally unsupported, so prompts, paths, code, diffs,
branches, Jira identifiers, terminal output, and secrets are not projected.
The Claude adapter does not read or include assistant-response fields in the
shared event, and the macOS adapter receives no response text from either
runtime.

The installer previews the change and creates private backups before it
replaces Codex's single top-level `notify` entry. An existing Codex provider
is retained through a bounded asynchronous downstream provider; it is the
user's pre-installation target and keeps its original Codex event contract.
Claude's `Stop` hook is merged additively with an exact stored identity and
never forwards assistant-response text downstream. Failure restores the
complete installation transaction.

`uninstall` restores a Runtime only when its exact stored managed identity still
matches. A user-modified Runtime is preserved and reported for manual recovery;
other exact managed Runtimes are cleaned independently. Provider delivery is
bounded, fail-open, and cannot accumulate children indefinitely.

Manual E2E is separate: use an explicitly approved macOS configuration or a
disposable HOME. Fixtures never call Notification Center or modify real user
settings.
