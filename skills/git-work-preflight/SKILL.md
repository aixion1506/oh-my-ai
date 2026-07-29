---
name: git-work-preflight
description: Use only when work-start, jira-work, or manual-review explicitly requests a shared read-only Git preflight before planning a future mutation. Inspect one repository, base, working tree, branch, remote, PR, and ancestry state; report a safe candidate next step and never mutate Git or GitHub.
metadata:
  source: born-here
  summary: Git Mutation 전 공통으로 소비하는 읽기 전용 Repository 안전 Gate
---

# Git Work Preflight

## Purpose and invocation boundary

`git-work-preflight` is a consumer-only shared contract for `work-start`,
`jira-work`, and `manual-review`. implicit invocation is prohibited: it is not
an implicit end-user workflow and does not run from a general Git question. A consumer must explicitly request
the preflight; the preflight never invokes a consumer.

It is a read-only gate. It inspects one supplied repository and produces a
Preflight Report with evidence and a candidate next step. It never creates a
Branch, checks out, resets, restores, stashes, cleans, rebases, merges, pulls,
pushes, creates a PR, or changes a PR.

`work-start` continues to create a Candidate and stop at Human Review.
`jira-work` continues to require its Ticket Gate, canonical source agreement,
and Connector boundary before any future Git lifecycle. A successful preflight
is not approval to bypass either boundary.

## Best-effort telemetry

Attempt only the shared fail-open skill-start event. Do not send Repository
paths, Issue Keys, Branch names, or report content to telemetry.

```bash
if [ -x "$HOME/.local/bin/harness-event" ]; then
  "$HOME/.local/bin/harness-event" emit skill-start \
    --skill git-work-preflight \
    --runtime "${HARNESS_RUNTIME:-codex}" \
    || true
fi
```

Telemetry failure does not block the preflight. Git or GitHub evidence failure
is fail-closed: report `NOT_VERIFIABLE` or another blocking result.

## Input contract

Require exactly one Repository, Expected Base Branch, Execution Policy, and
Consumer. The supported Consumers are `work-start`, `jira-work`, and
`manual-review`.

| Input | Requirement |
|---|---|
| Repository | Required. One local repository path only. Missing input is `Repository Required`. |
| Expected Base Branch | Required. Missing input is `Base Branch Required`. |
| Expected Base SHA | Optional. If supplied, both local and remote Base must match it. |
| Expected Branch Name Candidate | Optional. Validate only; never generate or create a Branch. |
| Issue Key | Optional. Do not infer or invent one. |
| Execution Policy | Required: `suggest-only`, `patch-with-approval`, or `auto-apply`. |
| Consumer | Required: `work-start`, `jira-work`, or `manual-review`. |
| Provided Evidence | Optional evidence reference. Never claim it was verified unless the consumer supplied verified evidence. |

Multiple Repository values, unsafe ref input, unreadable Repository, missing
Base, unavailable Remote, unavailable GitHub query, or missing required
Repository rule evidence are never treated as branch absence or READY.

## Read-only runtime

Run [scripts/git-work-preflight.sh](../../scripts/git-work-preflight.sh) only
from an explicit consumer boundary. It accepts named arguments, quotes every
input, does not use `eval`, and rejects unsafe Base or Branch arguments before
using them as refs.

The Runtime may use only these read-only operations after confirming the
Repository and ref input are usable:

- `git rev-parse`, `git status`, `git branch --list`, `git branch -vv`
- `git ls-remote`, `git rev-list`, `git merge-base`, `git log`
- `gh pr list`, `gh pr view`

The Runtime reports executed Evidence separately from supplied Evidence. An
unexecuted query is `NOT_CHECKED`, not a successful absence result. It parses
`gh pr list` with Node.js JSON parsing, so PR state never depends on JSON key
order; malformed, unavailable, or multiple records fail closed as appropriate.

For a feature Branch, Local Base SHA is the merge base between current HEAD and
verified `origin/<base>`. This detects a stale integration point without
misclassifying a Feature Branch that already merged the latest Base merely
because a separate local base ref has not moved.

Before a READY conclusion, the Runtime separately verifies the cached
`origin/<base>` ref and the actual `refs/heads/<base>` value from
`git ls-remote --heads origin`. Exactly one actual remote ref is required and
it must match the cached ref. The report keeps Expected Base SHA, Cached
Remote-tracking Base SHA, Actual Remote Base SHA, and Feature Integration Point
separate. A candidate Branch tip already ancestral to Actual Remote Base is
`ALREADY_MERGED`, independent of PR state.

## Result model

| Result | Required conclusion |
|---|---|
| READY_NEW_WORK | Repository, Base, tree, Branch, Remote, PR, and rule evidence permit a future new-work plan only. |
| READY_RESUME | Same Issue Branch or Draft PR is aligned and permits a future resume plan only. |
| RECOVERY_REQUIRED | Local-only, Remote-only, untracked relationship, or incomplete Branch/PR state requires a recovery plan only. |
| BLOCKED_DIRTY_TREE | Tracked, staged, or unmerged Working Tree state is a hard stop. |
| BLOCKED_BASE_MISMATCH | Expected Base SHA, local Base, or remote Base differs. |
| BLOCKED_DIVERGENCE | Local and Remote Issue Branches diverge. |
| ALREADY_MERGED | Merged PR or ancestor evidence forbids a new implementation plan. |
| CONFLICTED | Repository mismatch, naming conflict, duplicate PR, non-Draft PR, closed PR, or other Issue collision needs judgment. |
| NOT_VERIFIABLE | Git, Remote, GitHub, Base rule, or supplied evidence cannot be verified. |

All blocking results prohibit a mutation plan. `READY_NEW_WORK` and
`READY_RESUME` are planning results, never a Branch-creation, checkout, or
Push authorization.

Only `READY_NEW_WORK` and `READY_RESUME` may return process exit code `0`.
Every other result is non-zero; the Runtime owns this mapping centrally.

## Existing Work A–H

Use the shared model without changing `jira-work` semantics.

| Existing Work | Preflight Result | Allowed Next Step |
|---|---|---|
| A. New Branch and PR absent | READY_NEW_WORK | PLAN_NEW_WORK_ONLY |
| B. Normal Local and Remote Issue Branch | READY_RESUME | PLAN_RESUME_ONLY |
| C. Local-only Branch | RECOVERY_REQUIRED | RECOVERY_PLAN_ONLY |
| D. Remote-only Branch | RECOVERY_REQUIRED | RECOVERY_PLAN_ONLY |
| E. Open Draft PR | READY_RESUME | PLAN_RESUME_ONLY; duplicate PR forbidden |
| F. Local and Remote Divergence | BLOCKED_DIVERGENCE | STOP |
| G. Merge complete | ALREADY_MERGED | JIRA_RECONCILIATION_ONLY |
| H. Branch collision with another Issue Key or PR | CONFLICTED | STOP |

## Working Tree and naming policy

Report tracked modification, staged modification, unmerged conflict, untracked
file, ignored file, and local generated state separately. Tracked, staged, and
unmerged state are `BLOCKED_DIRTY_TREE`. Known local state such as `.DS_Store`
or `.oh-my-ai/` is reported, never deleted or silently called clean. Unknown
untracked state is `NOT_VERIFIABLE` until a Repository policy supplies a safe
interpretation.

Repository-enforced Base and naming rules outrank a Ticket candidate and any
general convention. This preflight does not create names. If a supplied
candidate conflicts with verified rules, report `CONFLICTED`; if the rules are
not verified, report `NOT_VERIFIABLE`.

For a `jira-work` invocation with an Issue Key, the Consumer must supply an
explicit Issue-to-Branch association evidence marker. The Runtime never infers
an Issue Key from a Branch or PR name: missing association evidence is
`NOT_VERIFIABLE`, and an evidence marker for another Branch is `CONFLICTED`.
No Jira read or write integration is performed here.

## Execution Policy and output

All policies report Mutation 0.

| Policy | Preflight output |
|---|---|
| suggest-only | Evidence, result, and a candidate plan only. |
| patch-with-approval | Candidate future mutation plan with separate approval required. |
| auto-apply | State that Local Git Lifecycle is unavailable; Mutation 0. |

Use [preflight-report.md](templates/preflight-report.md). The Runtime has no
Branch Creation, Checkout, Implementation, Verification Execution, Commit and
Push, Draft PR, Jira Comment and Transition, Merge, Release, Tag, Deploy,
Migration, or Secret-change capability.
