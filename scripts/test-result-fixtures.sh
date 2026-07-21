#!/usr/bin/env bash
set -euo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO"

VALIDATOR="$REPO/scripts/validate-result-basic.mjs"
FIXTURE_ROOT="fixtures/result"

cleanup_dirs=()
cleanup() {
  for d in "${cleanup_dirs[@]:-}"; do
    case "$d" in
      */oh-my-ai-result-fixture.*) [ -d "$d" ] && rm -rf -- "$d" ;;
    esac
  done
}
trap cleanup EXIT

fail() {
  echo "fixture failure: $*" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "missing file: $1"
}

sandbox() {
  local d
  d="$(mktemp -d "${TMPDIR:-/tmp}/oh-my-ai-result-fixture.XXXXXX")"
  cleanup_dirs+=("$d")
  printf '%s\n' "$d"
}

expect_valid() {
  local file="$1" label="$2"
  if ! node "$VALIDATOR" "$file" >/dev/null 2>&1; then
    node "$VALIDATOR" "$file" || true
    fail "$label: expected valid, validator rejected it"
  fi
}

expect_invalid() {
  local file="$1" label="$2" expect_substring="$3"
  local out
  if out="$(node "$VALIDATOR" "$file" 2>&1)"; then
    fail "$label: expected invalid, validator accepted it"
  fi
  case "$out" in
    *"$expect_substring"*) ;;
    *) fail "$label: expected error containing '$expect_substring', got: $out" ;;
  esac
}

mutate_result() {
  local src="$1" out="$2" find_str="$3" replace_str="$4"
  node -e '
    const fs = require("fs");
    const [src, out, findStr, replaceStr] = process.argv.slice(1);
    const text = fs.readFileSync(src, "utf8");
    if (!text.includes(findStr)) { console.error("mutate_result: find string not present: " + findStr); process.exit(1); }
    fs.writeFileSync(out, text.split(findStr).join(replaceStr));
  ' "$src" "$out" "$find_str" "$replace_str"
}

# --- 1. Validation Performed ------------------------------------------------

fx_validation_performed() {
  expect_valid "$FIXTURE_ROOT/FX-RS-good-complete-validation-performed.md" "Validation-Performed-positive"

  local d out
  d="$(sandbox)"; out="$d/bad.md"
  mutate_result "$FIXTURE_ROOT/FX-RS-good-complete-validation-performed.md" "$out" \
    "- \`bash -n README.md\` is not applicable to Markdown; visually diffed the single-line change against the surrounding install steps." \
    "- \`None\`"
  expect_invalid "$out" "Validation-Performed-negative" "requires at least one entry under Validation Performed"
  echo "passed: FX-RS-validation-performed"
}

# --- 2. Validation Not Performed --------------------------------------------

fx_validation_not_performed() {
  expect_valid "$FIXTURE_ROOT/FX-RS-good-partial-validation-not-performed.md" "Validation-Not-Performed-positive"

  local d out
  d="$(sandbox)"; out="$d/bad.md"
  mutate_result "$FIXTURE_ROOT/FX-RS-good-partial-validation-not-performed.md" "$out" \
    "- Integration test against the live endpoint was not run because test credentials were not available in this environment." \
    "- \`None\`"
  mutate_result "$out" "$out" \
    "- Confirm rate-limit response code with the endpoint owner before merge." \
    "- \`None\`"
  expect_invalid "$out" "Validation-Not-Performed-negative" "requires evidence of incompleteness"
  echo "passed: FX-RS-validation-not-performed"
}

# --- 3. Files Read / Changed 분리 -------------------------------------------

fx_files_read_changed_separation() {
  expect_valid "$FIXTURE_ROOT/FX-RS-good-complete-validation-performed.md" "Files-Read-Changed-positive"
  local heading_count
  heading_count="$(grep -c '^## Files Read$\|^## Files Changed$' "$FIXTURE_ROOT/FX-RS-good-complete-validation-performed.md")"
  [ "$heading_count" = "2" ] || fail "Files-Read-Changed: expected exactly 2 distinct headings, got $heading_count"

  local d out
  d="$(sandbox)"; out="$d/bad.md"
  mutate_result "$FIXTURE_ROOT/FX-RS-good-complete-validation-performed.md" "$out" \
    "## Files Changed" \
    "## Files Read2renamed"
  expect_invalid "$out" "Files-Read-Changed-negative" "missing required heading: ## Files Changed"
  echo "passed: FX-RS-files-read-changed-separation"
}

# --- 4. Scope Deviation ------------------------------------------------------

fx_scope_deviation() {
  expect_valid "$FIXTURE_ROOT/FX-RS-good-scope-deviation.md" "Scope-Deviation-positive"

  local d out
  d="$(sandbox)"; out="$d/bad.md"
  mutate_result "$FIXTURE_ROOT/FX-RS-good-scope-deviation.md" "$out" \
    "\`execution_status\`: \`partial\`" \
    "\`execution_status\`: \`complete\`"
  expect_invalid "$out" "Scope-Deviation-negative" "complete but Scope Deviations is non-empty"
  echo "passed: FX-RS-scope-deviation"
}

# --- 5. Missing Result -------------------------------------------------------

fx_missing_result() {
  local d
  d="$(sandbox)"
  local out
  out="$(node "$VALIDATOR" "$d/does-not-exist.md" 2>&1)" && fail "Missing-Result: expected non-zero exit"
  case "$out" in
    *"missing_result"*) ;;
    *) fail "Missing-Result: expected missing_result message, got: $out" ;;
  esac
  echo "passed: FX-RS-missing-result"
}

# --- 6. Partial Result -------------------------------------------------------

fx_partial_result() {
  expect_valid "$FIXTURE_ROOT/FX-RS-good-partial-validation-not-performed.md" "Partial-Result-positive"

  local d out
  d="$(sandbox)"; out="$d/bad.md"
  mutate_result "$FIXTURE_ROOT/FX-RS-good-partial-validation-not-performed.md" "$out" \
    "- Integration test against the live endpoint was not run because test credentials were not available in this environment." \
    "- \`None\`"
  mutate_result "$out" "$out" \
    "- Confirm rate-limit response code with the endpoint owner before merge." \
    "- \`None\`"
  expect_invalid "$out" "Partial-Result-negative" "requires evidence of incompleteness"
  echo "passed: FX-RS-partial-result"
}

# --- 7. Blocked Result -------------------------------------------------------

fx_blocked_result() {
  expect_valid "$FIXTURE_ROOT/FX-RS-good-blocked.md" "Blocked-Result-positive"

  local d out
  d="$(sandbox)"; out="$d/bad.md"
  mutate_result "$FIXTURE_ROOT/FX-RS-good-blocked.md" "$out" \
    '- `blocker_type`: `missing_access` - description: no IAM grant for this account on the target secrets manager project; required_access: "secretmanager.versions.access on project X"; recommended_next_action: "Request access grant from the project owner, then resume this task"' \
    '- `None`'
  expect_invalid "$out" "Blocked-Result-negative" "requires at least one entry under Blocked Reasons"
  echo "passed: FX-RS-blocked-result"
}

# --- run everything ----------------------------------------------------------

require_file "$VALIDATOR"
for f in FX-RS-good-complete-validation-performed FX-RS-good-partial-validation-not-performed FX-RS-good-blocked FX-RS-good-scope-deviation; do
  require_file "$FIXTURE_ROOT/$f.md"
done

fx_validation_performed
fx_validation_not_performed
fx_files_read_changed_separation
fx_scope_deviation
fx_missing_result
fx_partial_result
fx_blocked_result

echo "all Result Basic fixtures passed"
