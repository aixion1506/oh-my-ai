# Jira Work Ticket Gate Report

> Pure Contract preview only. This report neither reads a Jira Ticket nor runs
> Git, creates a Branch, implements code, verifies changes, commits, pushes,
> creates a Draft PR, comments on Jira, or changes Jira state.

## Issue Key

- Provided key only. Do not infer or invent one.

## Ticket Source Status

- `Verified`, `Ticket Source Not Verifiable`, or the supplied evidence status.

## Contract Validation

- Summary
- Context
- Goal
- Source of Truth
- In Scope
- Out of Scope
- Acceptance Criteria
- Repository
- Base Branch
- Expected Branch Name
- Dependencies
- Verification
- Do Not Touch
- Definition of Done
- Blocking sentinels:
  - Decision Required
  - Repository Required
  - Base Branch Required
  - Not Verifiable

## Source of Truth Validation

1. Accepted Decision
2. Canonical Repository Product and Architecture Documents
3. Confluence Specification
4. Jira Ticket
5. Handoff Candidate
6. Current Conversation

Record unread material as `Not Verifiable`. A Canonical/Jira mismatch is
`CONFLICTED`.

## Dependency Validation

- List each dependency and whether supplied evidence shows it complete.
- An unresolved blocking dependency is `BLOCKED`.

## Repository Scope

- One Repository only. Multiple repositories are `BLOCKED`.

## Base Branch Status

- Report verified, required, conflict, or `Not Verifiable`; do not query it.

## Expected Branch Candidate

- Candidate only; apply verified Repository rules before a Ticket name or the
  common fallback.

## Existing Work Status

- Apply A–H supplied evidence using
  [existing-work-status.md](existing-work-status.md).

## Execution Policy

- `suggest-only`: Preview; Mutation 0.
- `patch-with-approval`: Preview plus separate approval required; Mutation 0.
- `auto-apply`: Local Git Lifecycle unavailable in this PR; Mutation 0.

## Gate Result

- READY, BLOCKED, NOT_VERIFIABLE, ALREADY_IN_PROGRESS, ALREADY_MERGED, or
  CONFLICTED.

## Blocking Items

- Enumerate every missing field, Sentinel, contradiction, unavailable source,
  dependency, or conflict. No blocking item is silently downgraded.

## Allowed Next Step

- State the safe Preview-only or correction step; do not mark a Git Mutation as
  executable.

## Unavailable Runtime Capabilities

- Jira Ticket Connector Read
- Git Preflight
- Branch Creation
- Implementation
- Verification Execution
- Commit and Push
- Draft PR
- Jira Comment and Transition
