# Completion notification fixture contract

`scripts/test-completion-notify-fixtures.sh` runs these cases with a temporary
HOME, XDG data/state directories, fake Codex/Claude configuration, and fake
providers. It never reads or modifies a real user configuration or Notification
Center.

- `FX-CN-001`: non-interactive install changes nothing without explicit opt-in.
- `FX-CN-001` through `003`: explicit opt-in, unsupported-platform, malformed
  TOML, duplicate notify, config symlink, and predictable-temp attacks fail
  without a mutation.
- `FX-CN-004` through `005`: three-install identity, first downstream provider,
  permissions, and recursive dispatcher prevention are exact assertions.
- `FX-CN-006`: hanging macOS and downstream providers are process-group killed;
  100 dispatches leave no child alive.
- `FX-CN-007`: the rendered body is fixed text and contains no assistant summary.
- `FX-CN-008` through `012`: transaction rollback, independent runtime cleanup,
  exact Claude identity, repeat uninstall, and missing-state fail-closed paths.
- `FX-CN-013`: Claude Stop payload maps structurally without reading a user HOME.

The fixture exports disposable HOME/XDG/Codex/Claude paths before invoking any
runtime, rejects a non-disposable test environment, leaves no source-tree
pycache, and removes temporary children before cleanup. Manual macOS E2E is
deliberately outside this automated fixture suite.
