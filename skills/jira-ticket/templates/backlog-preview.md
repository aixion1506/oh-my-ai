# Jira Backlog Preview

> Preview only. Logical parent and dependency candidates are not Jira Epic,
> Parent Link, or Jira Sub-task records.

## Source Status

- List sources in this order: Accepted Decision, Canonical Repository Product and Architecture Documents, Confluence Specification, Explicit User Request, Handoff Candidate, Current Conversation.
- Mark unread source content `Not Verifiable`. Do not treat a URL, handoff, or
  conversation as a durable verified fact by itself.

## Mode

`Backlog`

Use `Single Ticket` when one independent, repository-scoped contract is enough.

## Epic Candidate

- **Summary:**
- **Goal:**
- **Scope:**
- **Repository boundaries:**

## Child Ticket Index Summary

For each logical Child Ticket Candidate, include:

1. **Type:** Semantic candidate only; use `Issue Type Decision Required` when
   unknown.
2. **Summary:**
3. **Repository:** Exactly one repository; split candidates that span
   repositories.
4. **Goal:**
5. **Dependencies:** Logical predecessor or external input candidates.
6. **Contract Validation:** Valid or Blocked with the applicable failure.
7. **Blocking Items:** Missing source, sentinel, conflict, or decision.

This Index Summary is for backlog navigation only and does not replace a
complete Child Ticket Contract.

Keep the backlog to 3–10 Child Ticket Candidates. Each must be independently
small enough for one future branch and one Draft PR. Separate implementation,
test, documentation, and infrastructure responsibility when doing so clarifies
ownership; do not create excessive Jira Sub-task-like fragments.

## Complete Child Ticket Contracts

Repeat the following complete Contract for every Child Ticket Candidate. A
template link or the Index Summary alone is insufficient.

### Summary

### Context

### Goal

### Source of Truth

### In Scope

### Out of Scope

### Acceptance Criteria

### Repository

### Base Branch

### Expected Branch Name

### Dependencies

### Verification

### Do Not Touch

### Definition of Done

Every Child Contract must satisfy the rules in `ticket-contract.md`. All Child
Contracts must be Valid for the whole Backlog to be Valid. If any Child is
Invalid or contains a Blocking Sentinel, do not show the Jira creation approval
question.

## Jira MCP-backed Create boundary

This Backlog Preview does not create an Epic or Child Issue as a group. Expand
each Child into a separate valid Single Ticket Create Preview, then apply its
own Capability, Duplicate Search, current-preview approval, Create, and
returned-result verification gates.

## Approval Boundary

Show a separate Single Ticket Create Preview only when every selected Child has
verified sources and valid Contract Validation. No group approval authorizes
multiple Create calls; do not create a virtual Issue Key or URL.

Do not call Jira or Confluence, create an Epic, Child Ticket, Parent Link,
Issue Key, URL, branch, code change, commit, push, or PR.
