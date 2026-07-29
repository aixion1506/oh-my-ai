# Git Work Preflight Report

> Read-only shared Preflight. This report never creates a Branch, checks out,
> resets, restores, stashes, cleans, rebases, merges, pulls, pushes, creates a
> PR, or changes a PR. Mutation 0.

## Input

- Consumer:
- Repository:
- Expected Base Branch:
- Expected Base SHA:
- Expected Branch Candidate:
- Issue Key: required for `jira-work`; optional otherwise; `NOT_PROVIDED` when absent; never inferred.
- Execution Policy:
- Provided Evidence:

## Evidence

- Executed Evidence:
- Provided Evidence:
- Supplied Evidence:
- Unexecuted Checks: `NONE` only after every required check; otherwise list
  `...=NOT_EXECUTED (reason)`, or use `Required checks not reached; per-field
  status is authoritative` before the check plan is reached. Per-field
  unexecuted state is `NOT_CHECKED`, never passed.

## Repository and Base

- Repository Verification:
- Remote Verification:
- Feature Remote Verification:
- Current Branch:
- Current HEAD:
- Expected Base SHA:
- Cached Remote-tracking Base SHA:
- Actual Remote Base SHA:
- Cached Remote-tracking Feature SHA:
- Actual Remote Feature SHA:
- Feature Integration Point:
- Local Base SHA:
- Remote Base SHA:
- Ancestry Status:

## Working Tree Status

- Working Tree Status:
- Tracked Status:
- Staged Status:
- Unmerged Status:
- Untracked Local State:
- Ignored Local State:
- Mutation Safety:

## Branch and PR Status

- Expected Branch Candidate:
- Local Branch Status:
- Remote Branch Status:
- PR Status:
- Issue Association Status: `MISSING_ISSUE_KEY` when a `jira-work` Issue Key
  was absent and association was not executed.
- Candidate Tip Evidence:
- Existing Work A-H:

## Preflight Result

- Preflight Result:
- READY_NEW_WORK
- READY_RESUME
- RECOVERY_REQUIRED
- BLOCKED_DIRTY_TREE
- BLOCKED_BASE_MISMATCH
- BLOCKED_DIVERGENCE
- ALREADY_MERGED
- CONFLICTED
- NOT_VERIFIABLE

## Blocking Items

- Blocking:
- Blocking Items: enumerate every required-input failure, unreadable Repository,
  Remote or GitHub failure, Base mismatch, dirty state, naming-rule gap,
  divergence, or collision. Do not downgrade an unavailable check to branch
  absence.

## Allowed Next Step

- Allowed Next Step:
- PLAN_NEW_WORK_ONLY, PLAN_RESUME_ONLY, RECOVERY_PLAN_ONLY,
  PLAN_WITH_SEPARATE_APPROVAL, PLAN_ONLY_RUNTIME_UNAVAILABLE,
  JIRA_RECONCILIATION_ONLY, or STOP.

## Process Exit Code

- Mutation: always `0`.
- Process Exit Code: `0` is allowed only for `READY_NEW_WORK` and `READY_RESUME`.
- Every recovery, blocked, merged, conflicted, or unverifiable result is
  non-zero.

## Prohibited Actions

- Prohibited Actions:
- Branch Creation
- Checkout
- Reset
- Restore
- Stash
- Clean
- Commit and Push
- Draft PR
- PR Edit
- Merge
- Release
- Tag
- Deploy
- Migration
- Secret change

## Unavailable Capabilities

- Unavailable Capabilities:
- Branch Creation
- Checkout
- Implementation
- Verification Execution
- Commit and Push
- Draft PR
- Jira Comment and Transition
- Merge
- Release
- Tag
- Deploy
- Migration
- Secret change
