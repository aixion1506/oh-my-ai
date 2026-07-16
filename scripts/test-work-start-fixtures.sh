#!/usr/bin/env bash
set -euo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO"

FIXTURE_ROOT="fixtures/work-start"
cleanup_paths=()

cleanup() {
  if [ "${KEEP_WORK_START_FIXTURE_ARTIFACTS:-}" = "1" ]; then
    return 0
  fi
  for path in "${cleanup_paths[@]}"; do
    case "$path" in
      .oh-my-ai/work-start/*) [ -d "$path" ] && rm -rf -- "$path" ;;
    esac
  done
}
trap cleanup EXIT

fail() {
  echo "fixture failure: $*" >&2
  exit 1
}

require_file() {
  local path="$1"
  [ -f "$path" ] || fail "missing file: $path"
}

require_pattern() {
  local pattern="$1"
  local file="$2"
  rg -q "$pattern" "$file" || fail "missing pattern '$pattern' in $file"
}

require_fixed() {
  local text="$1"
  local file="$2"
  rg -q -F "$text" "$file" || fail "missing text '$text' in $file"
}

section_body() {
  local heading="$1"
  local file="$2"
  awk -v heading="$heading" '
    $0 == heading { in_section=1; next }
    /^## / && in_section { exit }
    in_section { print }
  ' "$file"
}

run_work_start() {
  local task_file="$1"
  local output
  output="$(TASK="$(cat "$task_file")" make work-start 2>&1)"
  printf '%s\n' "$output" | sed -n 's/^work-start artifact created: //p' | tail -1
}

check_common_artifact() {
  local artifact="$1"
  local fixture_dir="$2"
  local handoff="$artifact/handoff-candidate.md"

  [ -d "$artifact" ] || fail "artifact directory not created: $artifact"
  require_file "$artifact/starter-prompt.md"
  require_file "$artifact/handoff-candidate.md"
  require_file "$artifact/context-manifest.yaml"
  require_file "$artifact/sources.md"
  require_file "$artifact/context-gap-report.md"

  while IFS= read -r marker; do
    [ -n "$marker" ] || continue
    if [[ "$marker" == "## "* ]]; then
      require_pattern "^${marker}$" "$handoff"
    else
      require_fixed "$marker" "$handoff"
    fi
  done < "$fixture_dir/expected/required-handoff-fields.txt"

  while IFS= read -r marker; do
    [ -n "$marker" ] || continue
    require_fixed "$marker" "$handoff"
  done < "$fixture_dir/expected/result-basic-markers.txt"

  require_pattern "^## Skill candidates$" "$handoff"
  require_fixed "Human Review is required" "$handoff"
  require_fixed "manual copy/paste" "$handoff"
  require_fixed "handoff_candidate: 'handoff-candidate.md'" "$artifact/context-manifest.yaml"

  if rg -q 'Permission denied|command not found|No such file or directory' "$handoff"; then
    fail "shell error marker found in $handoff"
  fi

  git check-ignore -q "$handoff" || fail "artifact is not ignored: $handoff"
}

check_positive() {
  local fixture_dir="$1"
  local artifact="$2"
  local handoff="$artifact/handoff-candidate.md"

  require_fixed "Add a small documentation-only example" "$handoff"
  if ! section_body "## Project Context References" "$handoff" | rg -q '^- `docs/context/|Needs human review'; then
    fail "Project Context References lacks a candidate or conservative review marker in $handoff"
  fi
}

check_negative() {
  local fixture_dir="$1"
  local artifact="$2"
  local handoff="$artifact/handoff-candidate.md"
  local allowed

  require_fixed "Needs human review" "$handoff"
  require_fixed "no Worker action is approved by this Candidate alone" "$handoff"
  require_fixed "Do not treat this Candidate as Runtime Invocation" "$handoff"

  allowed="$(section_body "## Allowed Actions" "$handoff")"
  if printf '%s\n' "$allowed" | rg -qi 'commit|push|merge|deploy|배포|runtime'; then
    fail "Allowed Actions grants an unsafe action in $handoff"
  fi
}

run_fixture() {
  local fixture_dir="$1"
  local fixture_id
  local artifact

  fixture_id="$(basename "$fixture_dir")"
  require_file "$fixture_dir/fixture.yaml"
  require_file "$fixture_dir/input/task.txt"
  require_file "$fixture_dir/expected/required-handoff-fields.txt"
  require_file "$fixture_dir/expected/result-basic-markers.txt"

  artifact="$(run_work_start "$fixture_dir/input/task.txt")"
  [ -n "$artifact" ] || fail "could not parse artifact path for $fixture_id"
  case "$artifact" in
    .oh-my-ai/work-start/*) ;;
    *) fail "unsafe artifact path for $fixture_id: $artifact" ;;
  esac
  cleanup_paths+=("$artifact")

  check_common_artifact "$artifact" "$fixture_dir"

  case "$fixture_id" in
    FX-WSH-001-*) check_positive "$fixture_dir" "$artifact" ;;
    FX-WSH-010-*) check_negative "$fixture_dir" "$artifact" ;;
    *) fail "unknown fixture id: $fixture_id" ;;
  esac

  echo "passed: $fixture_id -> $artifact"
}

require_file "scripts/work-start.sh"
require_file "scripts/work-start-skill-match.mjs"
require_file "templates/result-basic.md"
require_file "skills/handoff-prompt/SKILL.md"

run_fixture "$FIXTURE_ROOT/FX-WSH-001-positive-doc-task"
run_fixture "$FIXTURE_ROOT/FX-WSH-010-ambiguous-deploy-task"

echo "work-start fixtures passed"
