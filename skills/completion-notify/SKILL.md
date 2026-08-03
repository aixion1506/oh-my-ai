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

These commands require Python 3.11+ (`tomllib`) and fail fast with exit 2 and
zero mutation otherwise. If the default `python3` is older, pass a 3.11+
interpreter explicitly:

```bash
make install-completion-notify PYTHON=/opt/homebrew/bin/python3.11 ENABLE_COMPLETION_NOTIFY=1
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
is retained only for native Codex completion events through a bounded
asynchronous downstream provider; Claude events are macOS-only. Claude's
`Stop` hook is merged additively with an exact stored identity and never
forwards assistant-response text downstream. Failure restores the complete
installation transaction.

`uninstall` preflights Codex, Claude, state, runtime, backup, log, and lock before
it mutates any surface. A divergence or active dispatcher lock preserves the
complete installation with zero mutation for manual recovery. When every
surface is safe, one all-or-nothing transaction restores both Runtime settings
and removes all managed artifacts; a repeated uninstall is an `already absent`
no-op. Provider delivery is bounded, fail-open, and cannot accumulate children
indefinitely.

Manual E2E is separate: use an explicitly approved macOS configuration or a
disposable HOME. Fixtures never call Notification Center or modify real user
settings.
