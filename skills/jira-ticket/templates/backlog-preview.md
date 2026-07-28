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

## Ticket Candidates

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

Keep the backlog to 3–10 Child Ticket Candidates. Each must be independently
small enough for one future branch and one Draft PR. Separate implementation,
test, documentation, and infrastructure responsibility when doing so clarifies
ownership; do not create excessive Jira Sub-task-like fragments.

## Approval Boundary

Show `이 구성으로 Jira에 생성할까요?` only when every candidate has verified
sources and valid Contract Validation. Approval is recorded in conversation
only; it is not an external write authorization for this implementation phase.

## External Write Status

`Unavailable in this implementation phase`

Do not call Jira or Confluence, create an Epic, Child Ticket, Parent Link,
Issue Key, URL, branch, code change, commit, push, or PR.
