# Ticket Contract

> This 14-field Contract is the source for a Jira MCP-backed Create Preview.
> It is not an Issue, approval, branch, or implementation command until the
> Workflow has passed its Capability, Duplicate Search, and approval gates.

## Issue Type Candidate

- **Purpose:** Record a semantic candidate only: Feature, Story, Task, Bug,
  Research, or Tech Debt.
- **Rule:** An unknown type is `Issue Type Decision Required`; do not invent a
  Project-specific type.

## Summary

- **Purpose:** State the user-visible intended outcome concisely.
- **Rule:** Do not infer missing intent from a title alone.

## Context

- **Purpose:** Explain why the work is needed and the relevant current state.
- **Rule:** Separate verified facts from assumptions.

## Goal

- **Purpose:** Define the observable outcome to achieve.
- **Rule:** Do not describe Jira creation as the product goal.

## Source of Truth

- **Purpose:** Cite accepted decisions, canonical documents, supplied
  specification, or explicit request in priority order.
- **Rule:** Mark unread or unavailable sources `Not Verifiable`; a URL alone is
  not verified content.

## In Scope

- **Purpose:** List work this Ticket permits.
- **Rule:** Keep it compatible with Out of Scope and Do Not Touch.

## Out of Scope

- **Purpose:** List excluded work and non-goals.
- **Rule:** Do not overlap with In Scope.

## Acceptance Criteria

- **Purpose:** State observable completion conditions.
- **Rule:** Every criterion must have compatible Verification.

## Repository

- **Purpose:** Name the one repository that may later be changed.
- **Rule:** Use `Repository Required` when unknown.

## Base Branch

- **Purpose:** Identify the verified branch against which future work begins.
- **Rule:** Use `Base Branch Required` when unknown.

## Expected Branch Name

- **Purpose:** Show a branch candidate, never a branch command.
- **Rule:** Preserve `<ISSUE-KEY>` until a returned Jira Key exists.

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

- **Purpose:** State required implementation, verification, Git, PR, and Jira
  evidence conditions.
- **Rule:** Do not claim the Preview has satisfied those conditions.

## Contract Validation

- **Result:** `Valid` only when all 14 fields are verified, non-empty,
  non-conflicting, and contain no blocking sentinel or unresolved placeholder.
- **Failure:** List `Decision Required`, `Repository Required`, `Base Branch
  Required`, `Not Verifiable`, missing, whitespace-only, unknown, or
  contradictory values under Blocking Items.

## Blocking Items

- List every unresolved source, contract conflict, or decision needed before a
  Create Preview can be shown.
