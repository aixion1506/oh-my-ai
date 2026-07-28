---
name: jira-work
description: Use only when a user explicitly invokes $jira-work with an existing Jira Issue Key and Ticket Contract, or explicitly asks to validate that Contract before starting the named work.
metadata:
  source: born-here
  summary: 기존 Jira Ticket Contract를 소비해 실행 전 Gate와 Preview만 제공하는 optional workflow
---

# Jira Work — Pure Ticket Gate

## Purpose and invocation boundary

`jira-work` consumes an already-existing Ticket Contract. It does not author a
Ticket, replace an accepted decision, or invoke `work-start`.

This is an **explicit-only** workflow. The user may invoke `$jira-work <ISSUE-KEY>`,
or make an unambiguous named start request such as `RPL-42 작업
시작해`, `RPL-42 착수해`, or `RPL-42 기준으로 작업 계획 검증해`. General
questions such as `RPL-42가 무슨 작업이야?`, `RPL-42를 지금 하는 게 좋을까?`,
`RPL-42 Branch 이름 추천해줘`, and `jira-work가 뭐야?` remain read-only or
suggestion-only; they do not start this workflow.

This PR supplies a Pure Contract and preview only. It performs no Jira or
Confluence read, Git preflight, branch operation, implementation, verification
execution, commit, push, Draft PR, Jira comment, or Jira transition.

## Best-effort telemetry

At skill start, attempt only the shared, fail-open event. Do not introduce a
step-level schema.

```bash
if [ -x "$HOME/.local/bin/harness-event" ]; then
  "$HOME/.local/bin/harness-event" emit \
    skill-start \
    --skill jira-work \
    --runtime "${HARNESS_RUNTIME:-codex}" \
    || true
fi
```

The missing binary or a telemetry failure never blocks the Ticket Gate. Issue Key, Summary, Ticket content를 Telemetry에 기록하지 않는다.

## Ticket Contract consumption

The Contract must have actual, non-empty, non-whitespace values for every
field below. `jira-work` consumes their meaning; it does not depend on a
`jira-ticket` runtime or a particular Jira field layout.

1. Summary
2. Context
3. Goal
4. Source of Truth
5. In Scope
6. Out of Scope
7. Acceptance Criteria
8. Repository
9. Base Branch
10. Expected Branch Name
11. Dependencies
12. Verification
13. Do Not Touch
14. Definition of Done

The following blocking sentinels are Contract Validation Failures: `Decision
Required`, `Repository Required`, `Base Branch Required`, and `Not Verifiable`.
Unresolved or unknown placeholders, field contradictions, a Source of Truth,
Repository, Base Branch, In Scope, Out of Scope, Acceptance Criteria, or
Verification conflict, multiple repositories, and an incomplete blocking
dependency also fail the gate.

## Source of Truth Gate

Validate sources in this order:

1. Accepted Decision
2. Canonical Repository Product and Architecture Documents
3. Confluence Specification
4. Jira Ticket
5. Handoff Candidate
6. Current Conversation

A Jira Ticket is an execution contract, not a canonical Product or
Architecture Decision. A Canonical-versus-Jira conflict is `CONFLICTED` and
stops before any Branch plan. An unread source is `Not Verifiable`; a URL
alone is not verified content. Handoff Candidate and Current Conversation are
not durable facts and do not amend an earlier decision.

Because this PR has no Jira Ticket Connector Read or Confluence connector, an
unsupplied Ticket body is reported as `Ticket Source Not Verifiable`, never as
READY.

## Ticket Gate result

| Result | Pure Contract conclusion |
|---|---|
| READY | Contract, sources, dependencies, one Repository, Base Branch, and supplied Existing Work evidence permit a future plan. This is not branch-creation approval. |
| BLOCKED | Sentinel, missing value, contradiction, multiple Repository, or blocking dependency must be resolved. |
| NOT_VERIFIABLE | Ticket, source, Repository rule, Base Branch rule, or supplied evidence cannot actually be read. |
| ALREADY_IN_PROGRESS | Supplied evidence confirms the same Issue Branch or Draft PR; plan a resume, never a duplicate. |
| ALREADY_MERGED | Supplied evidence confirms merge; implementation is forbidden and only Jira-state alignment may be reported later. |
| CONFLICTED | Canonical/Jira mismatch, Local and Remote Divergence, or another Issue Key/PR branch collision needs human judgment. |

A failed gate reports every blocking item, forbids an executable Git Mutation
plan and Jira state-change plan, and stops. It never guesses Existing Work that
has not been supplied as verified evidence.

## Existing Work decision model

Use [existing-work-status.md](templates/existing-work-status.md) for the A–H
model. This PR does not query Local, Remote, or PR state; it maps only supplied
evidence to a future plan. A permits a new Branch plan; B and E permit a resume
plan; C and D require recovery or alignment planning without checkout or push;
F and H hard-stop; and G forbids implementation.

## Branch candidate

Choose only a candidate, never create it:

1. Verified Repository-enforced naming, protection, and Base Branch rules.
2. Verified Ticket Expected Branch Name that conforms to those rules.
3. Verified Repository general convention.
4. Common fallback:

| Issue Type | Candidate |
|---|---|
| Feature / Story | `feat/<ISSUE-KEY>-<slug>` |
| Task | `chore/<ISSUE-KEY>-<slug>` |
| Bug | `fix/<ISSUE-KEY>-<slug>` |
| Docs | `docs/<ISSUE-KEY>-<slug>` |
| Tech Debt | `refactor/<ISSUE-KEY>-<slug>` |
| Research | `research/<ISSUE-KEY>-<slug>` |

Preserve Issue Key case. A slug is ASCII lowercase; do not invent a Jira Key or
romanize Korean. With no stable slug use `<prefix>/<ISSUE-KEY>`. An Unknown Custom Issue Type is `Decision Required`. An unverified Repository-enforced
rule is `NOT_VERIFIABLE`; a violating Expected Branch Name never receives an
invented fallback.

## Execution Policy preview

| Policy | Pure Contract output |
|---|---|
| suggest-only | Ticket Gate result plus execution plan Preview; Mutation 0. |
| patch-with-approval | After a passing Gate, preview a future mutation plan and state that separate approval is required; Mutation 0. |
| auto-apply | State that the Local Git Lifecycle runtime is not implemented in this PR; Mutation 0. |

No mode in this PR can remove a Draft state, Merge, Release, Tag, deploy to
production, run a migration, or change a secret.

## Output and privacy

Use [ticket-gate-report.md](templates/ticket-gate-report.md). Default Artifact
creation is prohibited. Never persist a Jira Description, Confluence body, Raw Transcript, Raw Tool Output, Credential, Token, Secret, Cloud ID, or Account ID. A preview uses only the minimum Contract Summary and Source Reference; the Issue Key remains out of telemetry.

## Unavailable runtime capabilities

This PR has no Jira Ticket Connector Read, Git Preflight, Branch Creation,
Implementation, Verification Execution, Commit and Push, Draft PR, or Jira
Comment and Transition runtime. Do not claim any of those operations succeeded.
