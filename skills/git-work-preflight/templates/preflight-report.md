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
- Issue Key: provided only; never inferred.
- Execution Policy:
- Provided Evidence:

## Evidence

- Executed Evidence:
- Supplied Evidence:
- Unexecuted Checks: record as `NOT_CHECKED`, never as passed.

## Repository and Base

- Repository Verification:
- Remote Verification:
- Current Branch:
- Current HEAD:
- Local Base SHA:
- Remote Base SHA:
- Ancestry Status:

## Working Tree Status

- Tracked Working Tree Status:
- Staged Working Tree Status:
- Unmerged Conflict Status:
- Untracked Local State:
- Ignored File Status:
- Local Generated State:
- Mutation Safety:

## Branch and PR Status

- Expected Branch Candidate:
- Local Branch Status:
- Remote Branch Status:
- PR Status:
- Existing Work A–H:

## Preflight Result

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

- Enumerate every required-input failure, unreadable Repository, Remote or
  GitHub failure, Base mismatch, dirty state, naming-rule gap, divergence, or
  collision. Do not downgrade an unavailable check to branch absence.

## Allowed Next Step

- PLAN_NEW_WORK_ONLY, PLAN_RESUME_ONLY, RECOVERY_PLAN_ONLY,
  PLAN_WITH_SEPARATE_APPROVAL, PLAN_ONLY_RUNTIME_UNAVAILABLE,
  JIRA_RECONCILIATION_ONLY, or STOP.

## Prohibited Actions

- Branch Creation
- Checkout
- Reset
- Commit and Push
- Draft PR
- Merge
- Release
- Tag
- Deploy
- Migration
- Secret change

## Unavailable Capabilities

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
