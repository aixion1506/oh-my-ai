# Product Decision: Jira-driven Work Lifecycle

**Status:** Accepted design decision
**Date:** 2026-07-28
**Scope:** Product contract only. This document does not ship a Jira connector,
skills, hooks, installer behavior, or Git mutation runtime.

## Decision

oh-my-ai will model Jira work as two separate, optional skills:

1. `jira-ticket` authors a Ticket Contract. It collects sources, presents a
   preview, creates the Jira issue only after explicit user approval, reports
   the issue key and URL, and then stops.
2. `jira-work` consumes an already-existing Ticket Contract. It validates the
   ticket, its sources, and the Git preflight before it can begin repository
   work.

The boundary is intentional. Creating a record of planned work is not
authorization to create a branch, modify a repository, or change Jira status.

```text
Authoring
request / Confluence
  -> source confirmation -> Ticket preview -> explicit approval
  -> Jira issue creation -> key + URL report -> stop

Consumption
existing Jira Ticket
  -> Ticket + source gates -> Git preflight -> Execution Policy
  -> branch or existing-work resume -> implementation + verification
  -> commit + push + draft PR -> Jira evidence + permitted transition
```

`jira-ticket` must not create a branch, change code, commit, push, create a
PR, transition Jira status, or imply automatic start. `jira-work` must not
merge, release, tag, deploy, run a migration, change a secret, or work on a
different Ticket.

### Governing decisions

- `jira-ticket` and `jira-work` are separate optional skills.
- `jira-ticket` ends after an explicitly approved Jira creation.
- `jira-work` consumes an existing Ticket Contract; it does not infer one from
  a vague task description.
- A Jira Ticket is an execution contract, not the canonical Product or
  Architecture Decision.
- If the Jira Ticket conflicts with an accepted decision or canonical
  repository Product/Architecture document, stop before branch creation and
  request a decision. Do not silently reconcile the conflict in Jira or code.
- One Ticket maps to one repository, one working branch, and one draft PR.
  Existing work may be resumed only after the same contract and preflight
  gates pass.
- `$jira-work` expresses intent to execute; the active Execution Policy still
  controls every mutation.
- Removing draft status, merge, release, tag, and deployment each require a
  separate explicit approval.
- V1 does not permit degraded execution without the required Jira Connector:
  `jira-work` must not mutate Git when the Connector is absent.
- Git and Jira partial successes are preserved and reported. The workflow does
  not automatically roll them back.

## Source of Truth by lifecycle stage

The following orders apply to different stages, so they are not contradictory.

### Ticket authoring: `jira-ticket`

1. Accepted Decision
2. Canonical repository Product and Architecture documents
3. Confluence specification
4. Explicit user request
5. Handoff Candidate
6. Current conversation

There is no Jira Ticket at this point. The skill must produce a preview from
the confirmed sources and wait for explicit approval before writing to Jira.

### Ticket consumption: `jira-work`

1. Accepted Decision
2. Canonical repository Product and Architecture documents
3. Confluence specification
4. Jira Ticket
5. Handoff Candidate
6. Current conversation

At consumption time Jira is added as the execution contract: it identifies the
approved work to perform and the evidence to return. It cannot override the
sources above it. Handoff Candidates and conversation are useful inputs, but
are not durable facts. A mismatch between either and a canonical source must
not be promoted as truth by `jira-work`.

## Common Ticket Contract

Both skills use the following fixed contract. `jira-ticket` previews and writes
it; `jira-work` reads and validates it. A field is not optional merely because
Jira does not have a dedicated native field for it.

| Field | Required meaning |
|---|---|
| Summary | Short, user-visible statement of the intended outcome. |
| Context | Why the work is needed and the relevant current state. |
| Goal | Observable outcome the Ticket intends to achieve. |
| Source of Truth | Specific accepted decision, canonical document, specification, or request used to derive the contract. |
| In Scope | Work permitted for this Ticket. |
| Out of Scope | Explicitly excluded work and non-goals. |
| Acceptance Criteria | Outcome conditions used to decide whether the requested change is complete. |
| Repository | The one repository that may be changed. |
| Base Branch | The branch from which work begins or against which existing work is checked. |
| Expected Branch Name | Expected working branch, if determined by the contract or repository convention. |
| Dependencies | Required prior decisions, tickets, services, approvals, or external inputs. |
| Verification | Ticket-required checks and their expected evidence. |
| Do Not Touch | Paths, systems, data, and operation classes prohibited for this Ticket. |
| Definition of Done | Required implementation, verification, Git, PR, and Jira evidence conditions. |

The following values are blocking sentinels, not placeholders that may be
ignored:

```text
Decision Required
Repository Required
Base Branch Required
Not Verifiable
```

If any sentinel remains, `jira-work` cannot create a branch. It must report the
missing decision or information and stop before Git mutation.

## Execution Policy

Execution Policy is a higher-order control than a `jira-work` invocation.

| Mode | Allowed lifecycle outcome |
|---|---|
| `suggest-only` | Read the Ticket, sources, and Git state; present an execution plan only. |
| `patch-with-approval` | After Ticket, source, and preflight gates pass, present a concrete mutation plan and wait for a separate approval before branch creation, implementation, commit, push, draft PR, or Jira update. |
| `auto-apply` | After every gate passes, proceed through implementation, draft PR, and Jira update. |

No mode automatically removes draft status, merges, releases, tags, deploys to
production, runs a migration, or changes secrets. These remain separate
approvals even in `auto-apply`.

## Branch and commit identity

Branch selection is deterministic in this order:

1. `Expected Branch Name` in the Ticket Contract
2. Repository convention
3. Common fallback

| Issue type | Common fallback |
|---|---|
| Feature / Story | `feat/<KEY>-<slug>` |
| Task | `chore/<KEY>-<slug>` |
| Bug | `fix/<KEY>-<slug>` |
| Docs | `docs/<KEY>-<slug>` |
| Tech Debt | `refactor/<KEY>-<slug>` |
| Research | `research/<KEY>-<slug>` |

The issue key preserves its original case. The slug is ASCII lowercase. If a
stable slug cannot be produced, `<prefix>/<KEY>` is valid; arbitrary
romanization is not. An unknown custom issue type requires user judgment rather
than an invented fallback. Commit conventions remain repository-owned, but a
Ticket commit includes the exact Issue Key exactly once.

## Verification and partial failure

Ticket-level Verification and repository verification rules are both mandatory.
If a required check fails, or cannot be executed, the work is not verified:
commit, push, and draft PR are prohibited. The changed files are preserved, and
the result must report the failure evidence and a recovery procedure. This
decision deliberately does not introduce a Ticket-level verification-exception
format; that is an open follow-up decision.

Partial success is state to preserve, not a reason to issue compensating
mutations:

- Never automatically roll back a created branch, commit, push, PR, Jira
  comment, or Jira transition.
- Before retrying, re-read Ticket, branch, remote, PR, and Jira state.
- If push succeeds but PR creation fails, retain and report the remote branch.
- If PR creation succeeds but a Jira comment fails, retain and report the PR.
- Transition to review only after the Jira evidence comment succeeds.
- Report only steps that actually succeeded; do not describe a planned or
  failed step as completed.

Jira evidence comments are append-only by default so recovery retains the
historical evidence rather than rewriting it.

## Optional integration boundary

`jira-ticket` and `jira-work` are not required Public Core skills and are not
included automatically by `make install-shared`. Their UX is available only in
an environment where the relevant Connector and Runtime Skill are explicitly
installed. README must not advertise an uninstalled command as current product
functionality.

Jira Connector configuration is optional and must not hard-code credentials,
Cloud ID, project key, or account ID. A draft-PR provider has an abstraction
boundary; an initial implementation may use `gh`, but the actual provider is an
implementation-time architecture decision that requires verification.

Open installation decisions, deferred until PR 8, are:

- individual manual installation guidance;
- a generic optional-skill installer; and
- a Jira-workflow-specific opt-in installer.

## Consequences and non-goals

This decision favors explicit gates and recoverable evidence over a convenient
single-command workflow. It adds contract maintenance and connector setup cost,
but prevents a ticket authoring action or stale Jira description from becoming
unreviewed repository mutation.

It does not implement either skill, a connector, preflight code, hook changes,
installer changes, a telemetry schema, or documentation advertising the skills
as shipped functionality. The implementation boundary is specified in
[Shared Git Preflight and Jira Execution Boundary](shared-git-preflight-jira-execution-boundary.md).
