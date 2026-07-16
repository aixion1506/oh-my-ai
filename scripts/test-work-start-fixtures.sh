#!/usr/bin/env bash
set -euo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO"

FIXTURE_ROOT="fixtures/work-start"
cleanup_paths=()
cleanup_files=()

cleanup() {
  if [ "${KEEP_WORK_START_FIXTURE_ARTIFACTS:-}" = "1" ]; then
    return 0
  fi
  for path in "${cleanup_paths[@]}"; do
    case "$path" in
      .oh-my-ai/work-start/*) [ -d "$path" ] && rm -rf -- "$path" ;;
    esac
  done
  for path in "${cleanup_files[@]}"; do
    case "$path" in
      .oh-my-ai/state/*) [ -f "$path" ] && rm -f -- "$path" ;;
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
  rg -q -- "$pattern" "$file" || fail "missing pattern '$pattern' in $file"
}

require_fixed() {
  local text="$1"
  local file="$2"
  rg -q -F -- "$text" "$file" || fail "missing text '$text' in $file"
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

work_start_artifact_count() {
  if [ ! -d ".oh-my-ai/work-start" ]; then
    echo 0
    return 0
  fi
  find .oh-my-ai/work-start -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' '
}

run_claude_prompt_hook() {
  local task_file="$1"
  local task_json
  task_json="$(node -e 'const fs=require("fs"); const text=fs.readFileSync(process.argv[1],"utf8"); process.stdout.write(JSON.stringify({prompt:text}));' "$task_file")"
  printf '%s' "$task_json" | node scripts/prompt-routing-hook.mjs --format=claude-json
}

run_work_start_output() {
  local task_file="$1"
  TASK="$(cat "$task_file")" make work-start 2>&1
}

check_common_artifact() {
  local artifact="$1"
  local fixture_dir="$2"
  local handoff="$artifact/handoff-candidate.md"
  local next_step_section

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

  require_pattern "^## Human Review: Choose the Next Step$" "$handoff"
  require_fixed "- [ ] Direct Handoff" "$handoff"
  require_fixed "- [ ] Plan First" "$handoff"
  require_fixed "- [ ] Gather Context" "$handoff"
  require_fixed "Selected by:" "$handoff"
  require_fixed "Reason:" "$handoff"
  require_fixed "Unresolved context:" "$handoff"
  require_fixed "Needs human review" "$handoff"
  require_fixed "No next step is selected by default" "$handoff"
  require_fixed "does not choose, recommend, or run any next step automatically" "$handoff"

  next_step_section="$(section_body "## Human Review: Choose the Next Step" "$handoff")"
  if printf '%s\n' "$next_step_section" | rg -q -- '- \[[xX]\]'; then
    fail "next step is preselected in $handoff"
  fi
  if rg -qi 'Recommended action|Complexity detected|System selected|External context required|Superpowers required|Automatically run Superpowers' "$handoff"; then
    fail "automatic recommendation or external dependency wording found in $handoff"
  fi

  require_pattern "^## External Context Checkpoint$" "$handoff"
  require_fixed "Possible external context to review manually:" "$handoff"
  require_fixed "Internal Wiki or Confluence" "$handoff"
  require_fixed "Issue Tracker" "$handoff"
  require_fixed "Drive or Notion" "$handoff"
  require_fixed "Design files" "$handoff"
  require_fixed "Other repositories" "$handoff"
  require_fixed "Recent decisions from Slack or email" "$handoff"
  require_fixed "Production-only configuration" "$handoff"
  require_fixed "not a confirmed fact list" "$handoff"
  require_fixed "not connector output" "$handoff"
  require_fixed "does not assert that any listed external source exists" "$handoff"
  require_fixed "Possible external context to review manually:" "$artifact/context-gap-report.md"

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

check_multiline_slug() {
  local fixture_dir="$1"
  local artifact="$2"
  local dir_name

  case "$artifact" in
    *$'\n'*|*$'\r'*|*$'\t'*)
      fail "artifact directory name contains a control/whitespace character: $artifact"
      ;;
  esac

  dir_name="$(basename "$artifact")"
  printf '%s' "$dir_name" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[a-z0-9]+(-[a-z0-9]+)*$' \
    || fail "artifact directory name does not match expected slug shape: $dir_name"

  [ "$(find ".oh-my-ai/work-start" -mindepth 1 -maxdepth 1 -type d -name "$dir_name" | wc -l | tr -d ' ')" = "1" ] \
    || fail "expected exactly one artifact directory named $dir_name"
}

check_runtime_entry_metadata() {
  require_fixed "display-name: Work-start" "skills/work-start/SKILL.md"
  require_fixed "disable-model-invocation: true" "skills/work-start/SKILL.md"
  require_fixed "Use only when a user explicitly invokes /work-start" "skills/work-start/SKILL.md"
  require_fixed "Claude Code Runtime Entry" "skills/work-start/SKILL.md"
  require_fixed "entry_mode = explicit" "skills/work-start/SKILL.md"
  require_fixed "approval = not_required" "skills/work-start/SKILL.md"
  require_fixed "자연어 Intent는 이 스킬의 실행 트리거가 아니다" "skills/work-start/SKILL.md"
  require_fixed "stop the current response" "skills/work-start/SKILL.md"
  if [ -f "$HOME/.claude/skills/work-start/SKILL.md" ]; then
    require_fixed "disable-model-invocation: true" "$HOME/.claude/skills/work-start/SKILL.md"
    require_fixed "Use only when a user explicitly invokes /work-start" "$HOME/.claude/skills/work-start/SKILL.md"
  fi
  if rg -q -F "or says they want to start, plan, or kick off a task" "skills/work-start/SKILL.md"; then
    fail "work-start skill description still permits natural-language model invocation"
  fi
}

check_runtime_entry_suggestion() {
  local fixture_dir="$1"
  local task_file="$fixture_dir/input/task.txt"
  local state_file=".oh-my-ai/state/work-start-suggestions.json"
  local before_count
  local after_count
  local output
  local repeated_output

  require_file "$fixture_dir/fixture.yaml"
  require_file "$task_file"
  cleanup_files+=("$state_file")
  rm -f -- "$state_file"

  before_count="$(work_start_artifact_count)"
  output="$(run_claude_prompt_hook "$task_file")"
  after_count="$(work_start_artifact_count)"

  [ "$before_count" = "$after_count" ] || fail "Work-start artifact was created before consent for $(basename "$fixture_dir")"
  printf '%s\n' "$output" | rg -q -F "Suggested by oh-my-ai: Work-start" || fail "missing Work-start suggestion"
  printf '%s\n' "$output" | rg -q -F "state: SUGGESTED" || fail "missing SUGGESTED state"
  printf '%s\n' "$output" | rg -q -F "Work-start는 로컬 Artifact를 생성합니다" || fail "suggestion does not explain artifact behavior"
  printf '%s\n' "$output" | rg -q -F "아직 Work-start는 실행되지 않았습니다" || fail "suggestion does not state Work-start has not run"
  printf '%s\n' "$output" | rg -q -F "no Work-start Engine has run" || fail "suggestion does not state no engine ran"
  printf '%s\n' "$output" | rg -q -F "no local Artifact has been created" || fail "suggestion does not state no artifact was created"
  printf '%s\n' "$output" | rg -q -F "Suggestion text is not a tool instruction" || fail "suggestion does not separate text from tool instructions"
  printf '%s\n' "$output" | rg -q -F "Suggestion text is not a Skill invocation request" || fail "suggestion does not separate text from skill invocation"
  printf '%s\n' "$output" | rg -q -F "Suggestion text is not Engine consent" || fail "suggestion does not separate text from engine consent"
  printf '%s\n' "$output" | rg -q -F "/work-start" || fail "suggestion does not provide explicit follow-up entry"
  printf '%s\n' "$output" | rg -q -F "사용하지 않으려면 현재 요청을 그대로 계속하세요" || fail "suggestion does not provide skip path"
  printf '%s\n' "$output" | rg -q -F 'Do not run `/work-start`, `make work-start`, `scripts/work-start.sh`, or the Work-start Skill from this suggestion.' \
    || fail "suggestion does not explicitly block execution from suggestion"
  if printf '%s\n' "$output" | rg -q 'work-start artifact created:|oh-my-ai Work-start artifacts created:'; then
    fail "suggestion output looks like engine execution"
  fi
  if printf '%s\n' "$output" | rg -qi 'ask the user to invoke|execute /work-start|run /work-start'; then
    fail "suggestion contains imperative execution wording"
  fi

  repeated_output="$(run_claude_prompt_hook "$task_file")"
  if printf '%s\n' "$repeated_output" | rg -q -F "Suggested by oh-my-ai: Work-start"; then
    fail "same request was re-suggested after suppression"
  fi

  echo "passed: $(basename "$fixture_dir") suggestion-only"
}

check_runtime_entry_no_suggestion() {
  local fixture_dir="$1"
  local task_file="$fixture_dir/input/task.txt"
  local before_count
  local after_count
  local output

  require_file "$fixture_dir/fixture.yaml"
  require_file "$task_file"

  before_count="$(work_start_artifact_count)"
  output="$(run_claude_prompt_hook "$task_file")"
  after_count="$(work_start_artifact_count)"

  [ "$before_count" = "$after_count" ] || fail "Work-start artifact was created for generic task before consent"
  if printf '%s\n' "$output" | rg -q -F "Suggested by oh-my-ai: Work-start"; then
    fail "generic code task produced Work-start suggestion"
  fi

  echo "passed: $(basename "$fixture_dir") no-suggestion"
}

check_runtime_entry_explicit() {
  local fixture_dir="$1"
  local task_file="$fixture_dir/input/task.txt"
  local before_count
  local after_count
  local output
  local artifact

  require_file "$fixture_dir/fixture.yaml"
  require_file "$task_file"

  before_count="$(work_start_artifact_count)"
  output="$(run_work_start_output "$task_file")"
  after_count="$(work_start_artifact_count)"
  [ "$after_count" = "$((before_count + 1))" ] || fail "explicit entry did not create exactly one artifact"

  artifact="$(printf '%s\n' "$output" | sed -n 's/^work-start artifact created: //p' | tail -1)"
  [ -n "$artifact" ] || fail "could not parse explicit entry artifact path"
  cleanup_paths+=("$artifact")

  check_common_artifact "$artifact" "$FIXTURE_ROOT/FX-WSH-001-positive-doc-task"
  printf '%s\n' "$output" | rg -q -F "oh-my-ai Work-start completed." || fail "explicit output missing completion marker"
  printf '%s\n' "$output" | rg -q -F "Artifact directory:" || fail "explicit output missing artifact directory label"
  printf '%s\n' "$output" | rg -q -F "$artifact" || fail "explicit output missing actual artifact path"
  printf '%s\n' "$output" | rg -q -F "Status:" || fail "explicit output missing status label"
  printf '%s\n' "$output" | rg -q -F "Needs human review" || fail "explicit output missing review status"
  printf '%s\n' "$output" | rg -q -F "Choose the next step:" || fail "explicit output missing next step label"
  printf '%s\n' "$output" | rg -q -F -- "- Direct Handoff" || fail "explicit output missing Direct Handoff"
  printf '%s\n' "$output" | rg -q -F -- "- Plan First" || fail "explicit output missing Plan First"
  printf '%s\n' "$output" | rg -q -F -- "- Gather Context" || fail "explicit output missing Gather Context"
  printf '%s\n' "$output" | rg -q -F "Work-start has not modified the requested product code." || fail "explicit output missing no-product-code-change marker"
  printf '%s\n' "$output" | rg -q -F "Review the Candidate before continuing." || fail "explicit output missing stop/review marker"

  if printf '%s\n' "$output" | rg -qi '수정할까요|구현하겠습니다|관련 코드를 분석하겠습니다|Worker로 진행|Plan First 자동 실행'; then
    fail "explicit output contains continuation wording"
  fi

  echo "passed: $(basename "$fixture_dir") explicit-entry"
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
    FX-WSH-020-*|FX-WSH-030-*) ;;
    FX-WSH-060-*) check_multiline_slug "$fixture_dir" "$artifact" ;;
    *) fail "unknown fixture id: $fixture_id" ;;
  esac

  echo "passed: $fixture_id -> $artifact"
}

require_file "scripts/work-start.sh"
require_file "scripts/work-start-skill-match.mjs"
require_file "scripts/prompt-routing-hook.mjs"
require_file "templates/result-basic.md"
require_file "skills/handoff-prompt/SKILL.md"
require_file "skills/work-start/SKILL.md"

run_fixture "$FIXTURE_ROOT/FX-WSH-001-positive-doc-task"
run_fixture "$FIXTURE_ROOT/FX-WSH-010-ambiguous-deploy-task"
run_fixture "$FIXTURE_ROOT/FX-WSH-020-multi-scope-task"
run_fixture "$FIXTURE_ROOT/FX-WSH-030-external-context-task"
run_fixture "$FIXTURE_ROOT/FX-WSH-060-multiline-task-slug"
check_runtime_entry_metadata
check_runtime_entry_suggestion "$FIXTURE_ROOT/FX-WSH-040-runtime-entry-strong-intent"
check_runtime_entry_no_suggestion "$FIXTURE_ROOT/FX-WSH-050-runtime-entry-generic-code-task"
check_runtime_entry_explicit "$FIXTURE_ROOT/FX-WSH-070-explicit-work-start-entry"

echo "work-start fixtures passed"
