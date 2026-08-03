# Completion notification fixture contract

`scripts/test-completion-notify-fixtures.sh` runs these cases with a temporary
HOME, XDG data/state directories, fake Codex/Claude configuration, and fake
providers. It never reads or modifies a real user configuration or Notification
Center.

- `FX-CN-001`: only literal `ENABLE_COMPLETION_NOTIFY=1` plus `--yes` permits
  direct installation; a real pseudo-TTY proves empty Enter and no-input cases
  exit 2 without prompts or mutation. Plain `make install` skips completion
  without creating artifacts, and every unapproved standalone value rejects.
- `FX-CN-001` through `003`: explicit opt-in, unsupported-platform, malformed
  TOML, duplicate notify, config symlink, and predictable-temp attacks fail
  without a mutation.
- `FX-CN-004` through `005`: three-install identity, first downstream provider,
  permissions, and recursive dispatcher prevention are exact assertions.
- `FX-CN-006`: a stable flock reuses an old unlocked lock, rejects active-lock
  uninstall without mutation, rejects a lock symlink, and leaves no child alive
  after 100 concurrent dispatches.
- `FX-CN-007`: runtime-only fixed titles and the fixed body ignore cwd, project,
  path, Jira-like, shell-syntax, newline, and unknown-runtime payload text.
- `FX-CN-007b`: Claude is macOS-only; native Codex alone retains the existing
  downstream provider contract.
- `FX-CN-008` through `012`: transaction rollback; an all-surface uninstall
  preflight with zero mutation on divergence or an active lock; all-or-nothing
  settings, runtime, backup, production log, and lock cleanup; exact Claude
  identity; repeat `already absent` uninstall; and missing-state fail-closed
  paths.
- `FX-CN-013`: Claude Stop payload maps structurally without reading a user HOME.
- `FX-CN-013b`: the persisted Claude Hook command executes through `/bin/sh` with
  spaces, quotes, semicolons, command-substitution syntax, and newlines in the
  disposable path; no marker executes and uninstall restores bytes exactly.
- `FX-CN-014`: a discoverable Python 3.11+ interpreter completes the full
  install/status/test/uninstall/repeat-uninstall happy path through the
  Makefile's `PYTHON` override; otherwise falls back to a static check that
  the preflight gate exists in source.
- `FX-CN-015`: a pre-3.11 default `/usr/bin/python3` fails every managed
  command (`install`, `status`, `test`, `doctor`, `uninstall`) closed with
  exit 2, one shared message, and zero mutation of the disposable HOME;
  otherwise falls back to the same static check.

The fixture exports disposable HOME/XDG/Codex/Claude paths before invoking any
runtime, rejects a non-disposable test environment, leaves no source-tree
pycache, and removes temporary children before cleanup. Manual macOS E2E is
deliberately outside this automated fixture suite.
