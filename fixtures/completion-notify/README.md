# Completion notification fixture contract

`scripts/test-completion-notify-fixtures.sh` runs these cases with a temporary
HOME, XDG data/state directories, fake Codex/Claude configuration, and fake
providers. It never reads or modifies a real user configuration or Notification
Center.

- `FX-CN-001`: non-interactive install changes nothing without explicit opt-in.
- `FX-CN-002`: absent notify, Claude additive merge, and three-install
  idempotency.
- `FX-CN-002b`: an existing Codex/Computer Use provider is retained as the
  downstream provider.
- `FX-CN-003` / `FX-CN-004`: macOS provider failure and a hanging downstream
  provider do not block dispatch.
- `FX-CN-005` / `FX-CN-006`: safe restore and divergence-safe uninstall.
- `FX-CN-007`: duplicate `notify` and invalid config are rejected before a
  mutation.
- `FX-CN-008`: event redaction/normalization, unsupported events, and malformed
  JSON fail open.
- `FX-CN-009`: Claude Stop payload maps to the common event contract.

Manual macOS E2E is deliberately outside this automated fixture suite.
