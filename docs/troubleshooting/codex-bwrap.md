# Codex bwrap loopback failure

This runbook is for a local Codex CLI sandbox failure observed on some
Ubuntu/AppArmor environments. It is not a shared harness default, not a skill,
and not a default routing rule.

Use this only when Codex shell commands fail before the command body runs.

## Symptom

Codex command execution fails during sandbox setup, before the requested command
itself runs.

Error:

```text
bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted
```

## Minimal Reproduction

Run this outside Codex in a normal shell:

```bash
bwrap --unshare-net --dev-bind / / true
```

If it fails with the same loopback error, the issue is likely in the local
bubblewrap/network namespace/AppArmor path, not in the repository command.

## Observed Environment

Observed on an Ubuntu 24.04 family environment with:

```text
Codex CLI: codex-cli 0.142.0
bubblewrap 0.9.0
kernel.unprivileged_userns_clone = 1
user.max_user_namespaces = 255645
kernel.apparmor_restrict_unprivileged_userns = 1
```

Note: bwrap sandbox behavior may vary across Codex CLI versions. Record the
version shown by `codex --version` when reproducing on a different version.

## Diagnosis

This is a local Codex CLI sandbox / bubblewrap / Ubuntu AppArmor interaction.
It is not caused by repository files or the shell command body.

Claude or a normal shell may be unaffected when they do not use the same Codex
bwrap sandbox path.

## Recommended Opt-In Workaround

Do not change OS AppArmor/sysctl settings first. Do not change the shared repo
configuration. Do not make this a default for all users.

Create a local opt-in Codex profile:

```toml
# ~/.codex/no-bwrap.config.toml
sandbox_mode = "danger-full-access"
approval_policy = "on-request"
```

Then start Codex with:

```bash
codex -p no-bwrap -C /path/to/repo
```

This disables Codex's filesystem sandbox for that profile while keeping human
approval prompts enabled through `approval_policy = "on-request"`.

## Avoid

- Do not use `--dangerously-bypass-approvals-and-sandbox` as a default.
- Do not document OS AppArmor/sysctl weakening as the default fix.
- Do not commit personal `~/.codex` files into the repository.
- Do not add this workaround to shared routing or shared harness defaults.

## Verification

Run a minimal Codex command with the opt-in profile:

```bash
codex -p no-bwrap -C /path/to/repo exec --json "Run pwd only"
```

Confirm that the command completes and the bwrap loopback error does not recur.

## Separate Issue: npm Install Path

`codex doctor` may also report that the npm package root and running package
root differ. That is a Codex install/update path issue, not the cause of this
bwrap loopback failure. Handle it separately.
