#!/usr/bin/env bash
set -euo pipefail

repository=""
expected_base_branch=""
expected_base_sha=""
expected_branch_name=""
issue_key=""
execution_policy=""
consumer=""
provided_evidence=""

usage() {
  cat <<'USAGE'
usage: scripts/git-work-preflight.sh \
  --repository <path> \
  --expected-base-branch <name> \
  --execution-policy <suggest-only|patch-with-approval|auto-apply> \
  --consumer <work-start|jira-work|manual-review> \
  [--expected-base-sha <sha>] \
  [--expected-branch-name <candidate>] \
  [--issue-key <key>] \
  [--provided-evidence <reference>]
USAGE
}

report() {
  local result="$1" blocking="$2" next_step="$3" blocking_items="$4"
  printf '%s\n' '# Git Work Preflight Report'
  printf '%s\n' "Consumer: ${consumer:-NOT_PROVIDED}"
  printf '%s\n' "Repository: ${repository:-NOT_PROVIDED}"
  printf '%s\n' "Repository Verification: ${repository_verification:-NOT_CHECKED}"
  printf '%s\n' "Remote Verification: ${remote_verification:-NOT_CHECKED}"
  printf '%s\n' "Current Branch: ${current_branch:-NOT_CHECKED}"
  printf '%s\n' "Current HEAD: ${current_head:-NOT_CHECKED}"
  printf '%s\n' "Expected Base Branch: ${expected_base_branch:-NOT_PROVIDED}"
  printf '%s\n' "Expected Base SHA: ${expected_base_sha:-NOT_PROVIDED}"
  printf '%s\n' "Local Base SHA: ${local_base_sha:-NOT_CHECKED}"
  printf '%s\n' "Remote Base SHA: ${remote_base_sha:-NOT_CHECKED}"
  printf '%s\n' "Working Tree Status: ${working_tree_status:-NOT_CHECKED}"
  printf '%s\n' "Untracked Local State: ${untracked_local_state:-NOT_CHECKED}"
  printf '%s\n' "Expected Branch Candidate: ${expected_branch_name:-NOT_PROVIDED}"
  printf '%s\n' "Local Branch Status: ${local_branch_status:-NOT_CHECKED}"
  printf '%s\n' "Remote Branch Status: ${remote_branch_status:-NOT_CHECKED}"
  printf '%s\n' "PR Status: ${pr_status:-NOT_CHECKED}"
  printf '%s\n' "Ancestry Status: ${ancestry_status:-NOT_CHECKED}"
  printf '%s\n' "Existing Work A-H: ${existing_work_state:-NONE}"
  printf '%s\n' "Preflight Result: $result"
  printf '%s\n' "Blocking: $blocking"
  printf '%s\n' "Blocking Items: $blocking_items"
  printf '%s\n' "Provided Evidence: ${provided_evidence:-NONE}"
  printf '%s\n' "Allowed Next Step: $next_step"
  printf '%s\n' 'Mutation: 0'
  printf '%s\n' 'Unavailable Capabilities: Branch Creation, Checkout, Implementation, Verification Execution, Commit and Push, Draft PR, Jira Comment and Transition, Merge, Release, Tag, Deploy, Migration, Secret change'
}

hard_stop() {
  report "$1" true STOP "$2"
  exit 2
}

require_value() {
  [ "$#" -ge 2 ] && [ -n "$2" ] || { usage >&2; exit 2; }
}

safe_ref_component() {
  case "$1" in
    ''|-*|/*|*'..'*|*'@{'*|*' '*|*'~'*|*'^'*|*':'*|*'?'*|*'['*|*'\\'*|*'//'*|*/.|*.lock) return 1 ;;
    *) return 0 ;;
  esac
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repository)
      require_value "$@"
      [ -z "$repository" ] || hard_stop NOT_VERIFIABLE 'Multiple Repository values are not supported'
      repository="$2"
      shift 2
      ;;
    --expected-base-branch)
      require_value "$@"
      [ -z "$expected_base_branch" ] || hard_stop NOT_VERIFIABLE 'Expected Base Branch was supplied more than once'
      expected_base_branch="$2"
      shift 2
      ;;
    --expected-base-sha)
      require_value "$@"
      expected_base_sha="$2"
      shift 2
      ;;
    --expected-branch-name)
      require_value "$@"
      expected_branch_name="$2"
      shift 2
      ;;
    --issue-key)
      require_value "$@"
      issue_key="$2"
      shift 2
      ;;
    --execution-policy)
      require_value "$@"
      execution_policy="$2"
      shift 2
      ;;
    --consumer)
      require_value "$@"
      consumer="$2"
      shift 2
      ;;
    --provided-evidence)
      require_value "$@"
      provided_evidence="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if [ -x "$HOME/.local/bin/harness-event" ]; then
  "$HOME/.local/bin/harness-event" emit skill-start \
    --skill git-work-preflight \
    --runtime "${HARNESS_RUNTIME:-codex}" \
    || true
fi

[ -n "$repository" ] || hard_stop NOT_VERIFIABLE 'Repository Required'
[ -n "$expected_base_branch" ] || hard_stop NOT_VERIFIABLE 'Base Branch Required'
[ -n "$execution_policy" ] || hard_stop NOT_VERIFIABLE 'Execution Policy Required'
[ -n "$consumer" ] || hard_stop NOT_VERIFIABLE 'Consumer Required'

case "$execution_policy" in
  suggest-only|patch-with-approval|auto-apply) ;;
  *) hard_stop NOT_VERIFIABLE 'Execution Policy is not supported' ;;
esac
case "$consumer" in
  work-start|jira-work|manual-review) ;;
  *) hard_stop NOT_VERIFIABLE 'Consumer is not supported' ;;
esac
safe_ref_component "$expected_base_branch" || hard_stop NOT_VERIFIABLE 'Expected Base Branch is unsafe'
if [ -n "$expected_branch_name" ]; then
  safe_ref_component "$expected_branch_name" || hard_stop NOT_VERIFIABLE 'Expected Branch Candidate is unsafe'
fi
case "$repository" in -*) hard_stop NOT_VERIFIABLE 'Repository path is unsafe' ;; esac

repository_verification='NOT_VERIFIABLE'
remote_verification='NOT_CHECKED'
current_branch='NOT_CHECKED'
current_head='NOT_CHECKED'
local_base_sha='NOT_CHECKED'
remote_base_sha='NOT_CHECKED'
working_tree_status='NOT_CHECKED'
untracked_local_state='NOT_CHECKED'
local_branch_status='NOT_CHECKED'
remote_branch_status='NOT_CHECKED'
pr_status='NOT_CHECKED'
ancestry_status='NOT_CHECKED'
existing_work_state='NONE'

repo_root="$(git -C "$repository" rev-parse --show-toplevel 2>/dev/null)" || hard_stop NOT_VERIFIABLE 'Repository cannot be verified'
repository="$repo_root"
repository_verification='VERIFIED'
current_branch="$(git -C "$repository" rev-parse --abbrev-ref HEAD 2>/dev/null)" || hard_stop NOT_VERIFIABLE 'Current Branch cannot be verified'
current_head="$(git -C "$repository" rev-parse HEAD 2>/dev/null)" || hard_stop NOT_VERIFIABLE 'Current HEAD cannot be verified'
remote_base_sha="$(git -C "$repository" rev-parse --verify "origin/${expected_base_branch}^{commit}" 2>/dev/null)" || hard_stop NOT_VERIFIABLE 'Expected Base Branch cannot be resolved from origin'
local_base_sha="$(git -C "$repository" merge-base HEAD "origin/${expected_base_branch}" 2>/dev/null)" || hard_stop NOT_VERIFIABLE 'Current HEAD and expected Base have no verified merge base'
remote_verification='VERIFIED'

if [ -n "$expected_base_sha" ] && { [ "$expected_base_sha" != "$local_base_sha" ] || [ "$expected_base_sha" != "$remote_base_sha" ]; }; then
  ancestry_status='BASE_SHA_MISMATCH'
  hard_stop BLOCKED_BASE_MISMATCH 'Expected Base SHA does not match local and remote Base'
fi

base_counts="$(git -C "$repository" rev-list --left-right --count "${local_base_sha}...${remote_base_sha}" 2>/dev/null)" || hard_stop NOT_VERIFIABLE 'Base ancestry cannot be verified'
read -r local_ahead remote_ahead <<< "$base_counts"
if [ "$local_ahead" != 0 ] || [ "$remote_ahead" != 0 ]; then
  if [ "$local_ahead" != 0 ] && [ "$remote_ahead" != 0 ]; then
    ancestry_status='DIVERGED'
  elif [ "$local_ahead" != 0 ]; then
    ancestry_status='LOCAL_AHEAD_REMOTE'
  else
    ancestry_status='LOCAL_BEHIND_REMOTE'
  fi
  hard_stop BLOCKED_BASE_MISMATCH 'Local and remote Base are not aligned'
fi
ancestry_status='BASE_ALIGNED'

status_output="$(git -C "$repository" status --short --ignored 2>/dev/null)" || hard_stop NOT_VERIFIABLE 'Working Tree cannot be verified'
tracked_count=0
staged_count=0
unmerged_count=0
unknown_untracked_count=0
local_state_count=0
ignored_count=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  code="${line:0:2}"
  path="${line:3}"
  case "$code" in
    '??')
      case "$path" in
        .DS_Store|.oh-my-ai|.oh-my-ai/*) local_state_count=$((local_state_count + 1)) ;;
        *) unknown_untracked_count=$((unknown_untracked_count + 1)) ;;
      esac
      ;;
    '!!') ignored_count=$((ignored_count + 1)) ;;
    *U*|UU) unmerged_count=$((unmerged_count + 1)) ;;
    *)
      [ "${code:0:1}" = ' ' ] || staged_count=$((staged_count + 1))
      [ "${code:1:1}" = ' ' ] || tracked_count=$((tracked_count + 1))
      ;;
  esac
done <<< "$status_output"

untracked_local_state="LOCAL_GENERATED=${local_state_count}; UNKNOWN=${unknown_untracked_count}; IGNORED=${ignored_count}"
if [ "$unmerged_count" -gt 0 ]; then
  working_tree_status='UNMERGED_CONFLICT'
  hard_stop BLOCKED_DIRTY_TREE 'Unmerged conflict is present'
fi
if [ "$staged_count" -gt 0 ]; then
  working_tree_status='STAGED_DIRTY'
  hard_stop BLOCKED_DIRTY_TREE 'Staged modification is present'
fi
if [ "$tracked_count" -gt 0 ]; then
  working_tree_status='TRACKED_DIRTY'
  hard_stop BLOCKED_DIRTY_TREE 'Tracked modification is present'
fi
if [ "$unknown_untracked_count" -gt 0 ]; then
  working_tree_status='UNTRACKED_UNKNOWN'
  hard_stop NOT_VERIFIABLE 'Unknown untracked state requires Repository policy evidence'
fi
if [ "$local_state_count" -gt 0 ]; then
  working_tree_status='UNTRACKED_LOCAL_STATE'
else
  working_tree_status='CLEAN'
fi

if [ -z "$expected_branch_name" ]; then
  hard_stop NOT_VERIFIABLE 'Expected Branch Candidate is not supplied; Branch and PR state were not queried'
fi
case "$provided_evidence" in
  *repository-naming-rule-verified*) ;;
  *) hard_stop NOT_VERIFIABLE 'Repository naming rule evidence is not verified' ;;
esac

local_branch_output="$(git -C "$repository" branch --list -- "$expected_branch_name" 2>/dev/null)" || hard_stop NOT_VERIFIABLE 'Local Branch cannot be queried'
remote_branch_output="$(git -C "$repository" ls-remote --heads origin -- "refs/heads/${expected_branch_name}" 2>/dev/null)" || hard_stop NOT_VERIFIABLE 'Remote Branch cannot be queried'
if [ -n "$local_branch_output" ]; then
  local_branch_status='PRESENT'
else
  local_branch_status='ABSENT'
fi
if [ -n "$remote_branch_output" ]; then
  remote_branch_status='PRESENT'
else
  remote_branch_status='ABSENT'
fi

pr_json="$(cd "$repository" && gh pr list --head "$expected_branch_name" --state all --json state,isDraft,headRefName 2>/dev/null)" || hard_stop NOT_VERIFIABLE 'GitHub PR state cannot be queried'
case "$pr_json" in
  '[]') pr_status='NONE' ;;
  *'},{'*) pr_status='MULTIPLE' ;;
  *'"state":"MERGED"'*) pr_status='MERGED' ;;
  *'"state":"CLOSED"'*) pr_status='CLOSED_UNMERGED' ;;
  *'"state":"OPEN"'*'"isDraft":true'*) pr_status='OPEN_DRAFT' ;;
  *'"state":"OPEN"'*) pr_status='OPEN_NON_DRAFT' ;;
  *) hard_stop NOT_VERIFIABLE 'GitHub PR response is not understood' ;;
esac

if [ "$pr_status" = 'MULTIPLE' ]; then
  existing_work_state='H'
  hard_stop CONFLICTED 'Multiple PRs reference the expected Branch'
fi
if [ "$pr_status" = 'MERGED' ]; then
  existing_work_state='G'
  ancestry_status='HEAD_MERGED'
  report ALREADY_MERGED true JIRA_RECONCILIATION_ONLY 'Merged PR forbids a new implementation plan'
  exit 0
fi
if [ "$pr_status" = 'OPEN_NON_DRAFT' ] || [ "$pr_status" = 'CLOSED_UNMERGED' ]; then
  hard_stop CONFLICTED 'Existing non-Draft or closed PR requires human judgment'
fi
if [ "$local_branch_status" = 'PRESENT' ] && [ "$remote_branch_status" = 'PRESENT' ]; then
  branch_counts="$(git -C "$repository" rev-list --left-right --count "${expected_branch_name}...origin/${expected_branch_name}" 2>/dev/null)" || hard_stop NOT_VERIFIABLE 'Issue Branch ancestry cannot be verified'
  read -r branch_local_ahead branch_remote_ahead <<< "$branch_counts"
  if [ "$branch_local_ahead" != 0 ] && [ "$branch_remote_ahead" != 0 ]; then
    existing_work_state='F'
    ancestry_status='DIVERGED'
    hard_stop BLOCKED_DIVERGENCE 'Local and Remote Issue Branches diverge'
  fi
  local_branch_status='PRESENT_ALIGNED'
  remote_branch_status='PRESENT_ALIGNED'
  if [ "$pr_status" = 'OPEN_DRAFT' ]; then
    existing_work_state='E'
  else
    existing_work_state='B'
  fi
  report READY_RESUME false PLAN_RESUME_ONLY 'NONE'
  exit 0
fi
if [ "$local_branch_status" = 'PRESENT' ]; then
  existing_work_state='C'
  report RECOVERY_REQUIRED true RECOVERY_PLAN_ONLY 'Local-only Issue Branch requires recovery planning'
  exit 0
fi
if [ "$remote_branch_status" = 'PRESENT' ]; then
  existing_work_state='D'
  report RECOVERY_REQUIRED true RECOVERY_PLAN_ONLY 'Remote-only Issue Branch requires recovery planning'
  exit 0
fi

existing_work_state='A'
case "$execution_policy" in
  suggest-only) next_step='PLAN_NEW_WORK_ONLY' ;;
  patch-with-approval) next_step='PLAN_WITH_SEPARATE_APPROVAL' ;;
  auto-apply) next_step='PLAN_ONLY_RUNTIME_UNAVAILABLE' ;;
esac
report READY_NEW_WORK false "$next_step" 'NONE'
