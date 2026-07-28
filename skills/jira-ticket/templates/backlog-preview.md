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

## External Write Status

`Unavailable in this implementation phase`

## Approval Boundary

Show `이 구성으로 Jira에 생성할까요?` only when every candidate has verified
sources and valid Contract Validation. This asks only for approval of the
proposed Ticket configuration. It does not perform Jira Write in this
implementation phase. Approval is recorded in conversation only; do not create
a virtual Issue Key or URL.

Do not call Jira or Confluence, create an Epic, Child Ticket, Parent Link,
Issue Key, URL, branch, code change, commit, push, or PR.
