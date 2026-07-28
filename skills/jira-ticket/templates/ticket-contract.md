# Ticket Contract Preview

> Preview only. This is not a Jira Issue, a creation approval, a branch, or an
> implementation command. Replace template markers only with verified sources.

## Issue Type Candidate

- **Purpose:** Record a semantic candidate only: Feature, Story, Task, Bug,
  Research, or Tech Debt.
- **Preview value:** `Issue Type Decision Required` when the type is unknown.

## Summary

- **Purpose:** State the user-visible intended outcome concisely.
- **Rule:** Do not infer missing intent from a title alone.

## Context

- **Purpose:** Explain why the work is needed and the relevant current state.
- **Rule:** Separate verified facts from assumptions.

## Goal

- **Purpose:** Define the observable outcome to achieve.
- **Rule:** Do not describe a Jira creation as the product goal.

## Source of Truth

- **Purpose:** Cite accepted decisions, canonical documents, supplied
  specification, or explicit request in priority order.
- **Rule:** Mark unread or unavailable sources `Not Verifiable`; a URL alone is
  not verified content.

## In Scope

- **Purpose:** List work this Ticket Candidate permits.
- **Rule:** Keep it compatible with Out of Scope and Do Not Touch.

## Out of Scope

- **Purpose:** List excluded work and non-goals.
- **Rule:** Do not overlap with In Scope.

## Acceptance Criteria

- **Purpose:** State observable completion conditions.
- **Rule:** Every criterion must have compatible Verification.

## Repository

- **Purpose:** Name the one repository that may later be changed.
- **Rule:** Use `Repository Required` when unknown; do not assume from a
  Confluence URL or conversation.

## Base Branch

- **Purpose:** Identify the verified branch against which future work begins.
- **Rule:** Use `Base Branch Required` when unknown; do not inspect or create a
  branch in this skill.

## Expected Branch Name

- **Purpose:** Show a preview candidate only.
- **Rule:** Use `<ISSUE-KEY>` before a real Jira key exists. Never create a
  branch, invent a key, or romanize an unstable non-ASCII slug.

## Dependencies

- **Purpose:** List required decisions, tickets, inputs, or approvals.
- **Rule:** Mark unresolved dependencies as blocking.

## Verification

- **Purpose:** Specify Ticket-required evidence and repository checks.
- **Rule:** Mark unavailable checks `Not Verifiable`; do not claim they ran.

## Do Not Touch

- **Purpose:** Record prohibited paths, systems, data, and operation classes.
- **Rule:** Preserve canonical restrictions without weakening them.

## Definition of Done

- **Purpose:** State the required implementation, verification, Git, PR, and
  future Jira evidence conditions.
- **Rule:** Do not claim this Preview has satisfied those conditions.

## Contract Validation

- **Result:** `Valid` only when all 14 fields are verified, non-empty,
  non-conflicting, and contain no blocking sentinel or unresolved placeholder.
- **Failure:** List `Decision Required`, `Repository Required`, `Base Branch
  Required`, `Not Verifiable`, missing, whitespace-only, unknown, or
  contradictory values under Blocking Items.

## Blocking Items

- List every unresolved source, contract conflict, or decision needed before a
  complete Ticket Preview is possible.

## External Write Status

`Unavailable in this implementation phase`

## Approval Boundary

Show `이 구성으로 Jira에 생성할까요?` only after Contract Validation is valid.
If approved, record approval in conversation only and report that Jira Write
Integration is not implemented. Do not create an Issue, key, URL, link,
comment, transition, branch, code change, commit, push, or PR.
