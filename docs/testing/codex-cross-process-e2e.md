# Codex Cross-Process E2E

Status:

- Procedure Defined: yes (companion to [`manual-result-return-e2e.md`](manual-result-return-e2e.md), scoped to a Codex CLI Worker specifically)
- Evidence Classification: **user-executed, human-reviewed manual Codex CLI E2E**
- Cross-process process attestation (PID / session-id / cryptographic proof): **not collected**
- Automated / CI reproduction: **not performed**

This document is a companion to [`manual-result-return-e2e.md`](manual-result-return-e2e.md), scoped specifically to a Codex CLI Worker running the Manual Result Return flow in a genuinely separate terminal/process from the Main Session, as opposed to the same-session Worker role-play that `manual-result-return-e2e.md` explicitly flagged as an open gap.

## Scope

This run verifies that a Codex CLI process, invoked by the repository owner in a separate terminal from the Main (Claude Code) Session, can read a fixture file, edit exactly one field in it, run a shell validation command, and return a Result Basic artifact that a human reviewer can independently re-verify. It does not produce a machine-verifiable proof of process separation (no PID, session id, or signed transcript was captured) — it is Evidence of the human owner directly operating a separate Codex CLI session and directly re-checking the returned artifacts, not an automated or cryptographically attested cross-process trace.

Boundaries preserved throughout:

- No Worker Session was automatically created; the repository owner started `codex` manually in a separate terminal.
- No Result was automatically collected; the repository owner read the returned `result-basic.md` back manually.
- No Result was automatically approved; Human Review below is an explicit decision recorded by the repository owner, not inferred by any tool.
- The Result stayed a self-report Evidence Candidate until the explicit Human Review acceptance decision recorded in this document.

## 실행 날짜 (Run Date)

2026-07-21

## Codex CLI Version

```text
$ which codex
/home/shpark/.local/bin/codex
$ codex --version
codex-cli 0.144.6
```

The repository owner reported running these two commands directly in their terminal before starting the Codex session; the Main Session (Claude Code) independently re-ran both commands against the same machine during this write-up and observed identical output (`/home/shpark/.local/bin/codex`, `codex-cli 0.144.6`).

## E2E 목적 (Purpose)

Verify, with a real Codex CLI process operated by a human in a separate terminal, that a Codex Worker can:

- receive a task prompt,
- read a fixture file,
- edit exactly the one field the task asked for and nothing else,
- run a shell validation command,
- author a Result Basic artifact following `templates/result-basic.md`,
- and have that artifact manually returned to, and independently re-verified by, a human reviewer —

without any repository file outside the designated scratch directory being touched, and without any `git` state change.

## Input Fixture

`.oh-my-ai/codex-e2e-scratch/fixture.json`:

```json
{
  "fixture_id": "codex-cross-process-e2e-001",
  "status": "pending",
  "note": "Codex Worker should change status to 'reviewed' only."
}
```

## Allowed Scope

- Work directory: `.oh-my-ai/codex-e2e-scratch/` only.
- Allowed change: `fixture.json` `status` field, `pending` → `reviewed`.
- Explicitly forbidden: any other field in `fixture.json`; any file outside the scratch directory; `scripts/`, `capabilities/`, `fixtures/`, `docs/`, `README.md`, `Makefile`; `git add`/`commit`/`push`; PR creation; Foundation Repository access.

## 실제 변경 (Actual Change)

`.oh-my-ai/codex-e2e-scratch/fixture.json` — `status` changed from `"pending"` to `"reviewed"`. `fixture_id` and `note` unchanged. Re-read after the run:

```json
{
  "fixture_id": "codex-cross-process-e2e-001",
  "status": "reviewed",
  "note": "Codex Worker should change status to 'reviewed' only."
}
```

## 실행한 검증 명령 (Validation Commands Actually Run)

Commands the repository owner reported running in their own Codex Worker terminal, and which the Main Session independently re-ran against the resulting file state:

```bash
node -e "JSON.parse(require('fs').readFileSync('.oh-my-ai/codex-e2e-scratch/fixture.json','utf8'))"
# exit status: 0
```

```bash
node scripts/validate-result-basic.mjs .oh-my-ai/codex-e2e-scratch/result-basic.md
# valid: .oh-my-ai/codex-e2e-scratch/result-basic.md
```

```bash
find .oh-my-ai/codex-e2e-scratch -maxdepth 1 -type f -printf '%f\n' | sort
# fixture.json
# result-basic.md
```

```bash
git status --porcelain --untracked-files=all
# (no output before this document's own capability/doc changes were staged)
```

All four commands above were re-run independently by the Main Session during this write-up against the actual repository state, with matching results.

## Result Basic validator 결과 (Result Basic Validator Result)

`node scripts/validate-result-basic.mjs .oh-my-ai/codex-e2e-scratch/result-basic.md` → `valid: .oh-my-ai/codex-e2e-scratch/result-basic.md` (re-run and confirmed by the Main Session).

The returned Result Basic's `Runtime Context.runtime` field reads `Codex`; its `review_state` was `not_reviewed` at hand-back time, consistent with the contract that a Worker never self-grants review acceptance.

## Repository 변경 없음 (No Product Repository Change From The E2E Itself)

`git status --porcelain --untracked-files=all` showed no output prior to this PR's own documentation and capability-metadata changes. `.oh-my-ai/codex-e2e-scratch/` is gitignored, so the fixture/result files themselves never entered `git status` regardless of their content.

## Human Review 결과 (Human Review Result)

Recorded directly by the repository owner (not inferred or self-issued by any AI Runtime):

```text
Human Review Decision: Accepted
Accepted Scope: the Codex CLI Manual Worker E2E succeeded within the instructed, bounded scope
Reason: the repository owner personally ran the Codex CLI session and personally re-verified the
        returned artifact, the validator result, the scratch directory file list, and repository
        git-status isolation.
```

Checked and confirmed by the reviewer against the returned Result Basic:

| Category | Claim | Checked against |
|---|---|---|
| Confirmed | `fixture.json.status` changed `pending` → `reviewed`; `fixture_id`/`note` unchanged | Re-read `fixture.json` directly |
| Confirmed | `node -e JSON.parse(...)` exit status 0 | Re-ran the command directly |
| Confirmed | `node scripts/validate-result-basic.mjs ...` → `valid` | Re-ran the validator directly |
| Confirmed | Scratch directory contains only `fixture.json` and `result-basic.md` | Re-ran the `find` command directly |
| Confirmed | Product repository git status clean (pre-PR) | Re-ran `git status --porcelain --untracked-files=all` directly |
| Not claimed | Genuinely separate OS process/session, independent of the human's own attestation | No PID, session id, or signed transcript was captured for either side of the hand-off |

## 검증된 Capability (Capabilities Verified By This E2E)

- `capability.prompt.initial` — Codex received and acted on the task prompt as given.
- `capability.file.read` — Codex read `fixture.json` and `templates/result-basic.md`.
- `capability.file.edit` — Codex edited exactly the `status` field, leaving `fixture_id`/`note` untouched.
- `capability.shell.execute` — Codex ran the requested `node -e "JSON.parse(...)"` command and observed exit status 0.
- `capability.validation.run` — Codex ran a validation command and reported its real result (JSON.parse exit status); note this was a direct `node` invocation, not a `make test-*` target.
- `capability.result.freeform` — Codex authored a freeform Result Basic artifact that a human could read back.
- `capability.result.structured` (conditional) — the returned artifact followed `templates/result-basic.md` headings closely enough to pass `scripts/validate-result-basic.mjs`; this remains a manual authoring convention, not a Runtime-enforced guarantee (see `capabilities/runtime-capabilities.json`).

## 검증하지 않은 Capability (Capabilities Not Verified By This E2E)

- `capability.session.resume` — no attempt was made to resume a prior Codex session across a Handoff boundary.
- `capability.workspace.worktree` — no git worktree creation/switching was exercised (deliberate V1 non-goal, applies to every Runtime).
- Automatic Session creation — the Codex session was started manually by the repository owner, not by any oh-my-ai automation.
- Automatic Result collection/return — the Result Basic artifact was read back manually by the repository owner, not automatically collected or imported.
- Machine-verifiable cross-process isolation — no PID, session id, or cryptographic attestation was collected to distinguish this from a same-session role-play; this is the same procedural gap `manual-result-return-e2e.md` calls out for its own Claude-side run, now closed for the Result-authoring half but still open for process-identity proof specifically.

## Related

- [`manual-result-return-e2e.md`](manual-result-return-e2e.md) — the same-session precursor to this run, including the open cross-process gap this document narrows (Result-authoring by a real Codex process) but does not fully close (process-identity attestation)
- `templates/result-basic.md` — the template followed by the Codex Worker
- `scripts/validate-result-basic.mjs` — the validator used to confirm structural conformance
- `capabilities/runtime-capabilities.json` — the Codex capability records promoted on the basis of this Evidence document
