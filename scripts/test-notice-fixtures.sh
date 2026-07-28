#!/usr/bin/env bash
set -euo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO"

FIXTURE_ROOT="fixtures/notice/manifests"
NOTICE="$REPO/scripts/notice.mjs"

cleanup_dirs=()
cleanup_paths=()

cleanup() {
  if [ "${KEEP_NOTICE_FIXTURE_ARTIFACTS:-}" = "1" ]; then
    return 0
  fi
  for path in "${cleanup_dirs[@]:-}"; do
    case "$path" in
      */oh-my-ai-notice-fixture.*) [ -d "$path" ] && rm -rf -- "$path" ;;
    esac
  done
  for path in "${cleanup_paths[@]:-}"; do
    case "$path" in
      .oh-my-ai/work-start/*) [ -d "$path" ] && rm -rf -- "$path" ;;
    esac
  done
  return 0
}
trap cleanup EXIT

fail() {
  echo "fixture failure: $*" >&2
  exit 1
}

run_with_timeout() {
  local seconds="$1"
  shift
  node -e '
    const { spawnSync } = require("node:child_process");
    const [seconds, command, ...args] = process.argv.slice(1);
    const result = spawnSync(command, args, {
      stdio: "inherit",
      timeout: Number(seconds) * 1000,
    });
    if (result.error?.code === "ETIMEDOUT") process.exit(124);
    process.exit(result.status ?? 1);
  ' "$seconds" "$@"
}

require_file() {
  local path="$1"
  [ -f "$path" ] || fail "missing file: $path"
}

# --- sandbox helpers ---------------------------------------------------------

# Every fixture gets its own XDG_CACHE_HOME/XDG_CONFIG_HOME under a fresh
# temp dir, so fixtures never touch the real $HOME and never share state
# with each other or with a real installation.
new_sandbox() {
  local dir
  dir="$(mktemp -d "${TMPDIR:-/tmp}/oh-my-ai-notice-fixture.XXXXXX")"
  cleanup_dirs+=("$dir")
  mkdir -p "$dir/cache" "$dir/config"
  printf '%s\n' "$dir"
}

notice_in() {
  local sandbox="$1"
  shift
  XDG_CACHE_HOME="$sandbox/cache" XDG_CONFIG_HOME="$sandbox/config" node "$NOTICE" "$@"
}

manifest_url() {
  printf 'file://%s/%s' "$REPO" "$1"
}

cache_file_in() {
  printf '%s/cache/oh-my-ai/notice-manifest.json' "$1"
}

state_file_in() {
  printf '%s/config/oh-my-ai/notice-state.json' "$1"
}

lock_file_in() {
  printf '%s/cache/oh-my-ai/notice-refresh.lock' "$1"
}

# work-start.sh's own end-of-run refresh-if-stale (see
# run_work_start_capturing_artifact below) spawns a genuinely detached,
# unref()'d child whenever the sandbox's cache is empty/stale. That child
# outlives work-start.sh's own exit, so a fixture that immediately follows
# such a run with its own synchronous do_refresh() in the SAME sandbox can
# race the leftover child for the shared refresh lock and silently lose:
# do_refresh() no-ops if it finds the lock still held (see notice.mjs
# acquireLock()'s "skipped-held" path).
#
# Wait on the lock's actual release -- the same signal the product itself
# uses for mutual exclusion -- rather than guessing a sleep duration. The
# short settle before polling exists only to give a just-spawned child time
# to reach its first acquireLock() call; once the lock is observed, this
# waits for its genuine release (bounded), not a fixed guess.
wait_for_refresh_lock_clear() {
  local sandbox="$1"
  local lock_file waited_ms=0 timeout_ms=3000
  lock_file="$(lock_file_in "$sandbox")"
  sleep 0.15
  while [ -e "$lock_file" ]; do
    [ "$waited_ms" -lt "$timeout_ms" ] \
      || fail "notice refresh lock did not clear within ${timeout_ms}ms: $lock_file"
    sleep 0.02
    waited_ms=$((waited_ms + 20))
  done
}

do_refresh() {
  local sandbox="$1"
  local manifest_rel="$2"
  local version="${3:-1.0.0}"
  NOTICE_MANIFEST_URL="$(manifest_url "$manifest_rel")" \
    notice_in "$sandbox" __do-refresh --version "$version"
}

render() {
  local sandbox="$1"
  local version="${2:-1.0.0}"
  notice_in "$sandbox" render --version "$version"
}

# --- FX-NT-001 No Cache -------------------------------------------------------

fx_nt_001() {
  local sandbox out
  sandbox="$(new_sandbox)"
  out="$(render "$sandbox" 1.0.0)"
  [ -z "$out" ] || fail "FX-NT-001: expected empty render with no cache, got: $out"
  [ -f "$(cache_file_in "$sandbox")" ] && fail "FX-NT-001: cache file must not be created by render alone"
  echo "passed: FX-NT-001-no-cache"
}

# --- FX-NT-002 Valid Cache -----------------------------------------------------

fx_nt_002() {
  local sandbox out
  sandbox="$(new_sandbox)"
  do_refresh "$sandbox" "$FIXTURE_ROOT/valid-single-notice.json" 1.0.0
  [ -s "$(cache_file_in "$sandbox")" ] || fail "FX-NT-002: cache was not populated"
  out="$(render "$sandbox" 1.0.0)"
  case "$out" in
    *"a valid single notice"*) ;;
    *) fail "FX-NT-002: expected notice text in render output, got: $out" ;;
  esac
  echo "passed: FX-NT-002-valid-cache"
}

# --- FX-NT-003 Stale Cache -----------------------------------------------------

fx_nt_003() {
  local sandbox cache_file
  sandbox="$(new_sandbox)"
  do_refresh "$sandbox" "$FIXTURE_ROOT/valid-single-notice.json" 1.0.0
  cache_file="$(cache_file_in "$sandbox")"
  [ -s "$cache_file" ] || fail "FX-NT-003: cache was not populated"
  # Force staleness: rewrite fetched_at far in the past.
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    data.fetched_at = Date.now() - (25 * 60 * 60 * 1000);
    fs.writeFileSync(file, JSON.stringify(data));
  ' "$cache_file"
  local status
  status="$(notice_in "$sandbox" status)"
  echo "$status" | grep -q '"cache_stale": true' || fail "FX-NT-003: cache was not reported stale"
  # refresh-if-stale must return quickly and not block on network; the
  # decisive proof (a spawn actually happened) is covered by FX-NT-014/015,
  # which drive the same code path through work-start.sh end to end.
  XDG_CACHE_HOME="$sandbox/cache" XDG_CONFIG_HOME="$sandbox/config" \
    run_with_timeout 5 node "$NOTICE" refresh-if-stale --version 1.0.0 \
    || fail "FX-NT-003: refresh-if-stale did not return promptly"
  echo "passed: FX-NT-003-stale-cache"
}

# --- FX-NT-004 Network Failure --------------------------------------------------

fx_nt_004() {
  local sandbox cache_file
  sandbox="$(new_sandbox)"
  cache_file="$(cache_file_in "$sandbox")"
  # A nonexistent file:// target is a deterministic, network-free proxy for
  # "the fetch failed" -- __do-refresh's catch-all treats every fetch failure
  # (ENOENT, ECONNREFUSED, DNS failure, ...) identically: leave cache as-is.
  do_refresh "$sandbox" "$FIXTURE_ROOT/does-not-exist.json" 1.0.0
  [ -f "$cache_file" ] && fail "FX-NT-004: cache must stay absent after a fetch failure with no prior cache"

  # Seed a valid cache, then fail a refresh -- prior cache must survive untouched.
  do_refresh "$sandbox" "$FIXTURE_ROOT/valid-single-notice.json" 1.0.0
  local before after
  before="$(cat "$cache_file")"
  do_refresh "$sandbox" "$FIXTURE_ROOT/does-not-exist.json" 1.0.0
  after="$(cat "$cache_file")"
  [ "$before" = "$after" ] || fail "FX-NT-004: existing cache was modified after a failed refresh"
  echo "passed: FX-NT-004-network-failure"
}

# --- FX-NT-005 Invalid JSON ----------------------------------------------------

fx_nt_005() {
  local sandbox cache_file
  sandbox="$(new_sandbox)"
  cache_file="$(cache_file_in "$sandbox")"
  do_refresh "$sandbox" "$FIXTURE_ROOT/invalid.json" 1.0.0
  [ -f "$cache_file" ] && fail "FX-NT-005: invalid JSON must not produce a cache file"
  echo "passed: FX-NT-005-invalid-json"
}

# --- FX-NT-006 Unsupported Schema ----------------------------------------------

fx_nt_006() {
  local sandbox cache_file
  sandbox="$(new_sandbox)"
  cache_file="$(cache_file_in "$sandbox")"
  do_refresh "$sandbox" "$FIXTURE_ROOT/unsupported-schema.json" 1.0.0
  [ -f "$cache_file" ] && fail "FX-NT-006: unsupported schema_version must not produce a cache file"
  echo "passed: FX-NT-006-unsupported-schema"
}

# --- Supplementary: Action URL Allowlist (Contract Part VI §23) ----------------
# Not one of the Foundation Fixture Plan's 15 automatic IDs on its own; it
# exercises per-notice Manifest Safety validation exercised during FX-NT-002's
# schema path, kept as its own function for a clearer failure message.

fx_supplementary_action_url_allowlist() {
  local sandbox cache_file
  sandbox="$(new_sandbox)"
  cache_file="$(cache_file_in "$sandbox")"
  do_refresh "$sandbox" "$FIXTURE_ROOT/bad-action-url.json" 1.0.0
  [ -s "$cache_file" ] || fail "action-url-allowlist: expected the manifest to still cache the surviving notice"
  if grep -q "fx-nt-bad-url" "$cache_file"; then
    fail "action-url-allowlist: notice with a non-allowlisted action_url was cached"
  fi
  grep -q "fx-nt-good-url" "$cache_file" \
    || fail "action-url-allowlist: sibling notice with an allowlisted action_url was dropped too"
  echo "passed: FX-supplementary-action-url-allowlist"
}

# --- FX-NT-007 Version Mismatch -------------------------------------------------

fx_nt_007() {
  local sandbox out
  sandbox="$(new_sandbox)"
  do_refresh "$sandbox" "$FIXTURE_ROOT/version-ranged.json" 1.0.0
  out="$(render "$sandbox" 5.0.0)"
  [ -z "$out" ] || fail "FX-NT-007: out-of-range version must not see the notice, got: $out"

  local sandbox2
  sandbox2="$(new_sandbox)"
  do_refresh "$sandbox2" "$FIXTURE_ROOT/version-ranged.json" unknown-not-semver
  out="$(render "$sandbox2" unknown-not-semver)"
  [ -z "$out" ] || fail "FX-NT-007: unparseable version must never match, got: $out"
  echo "passed: FX-NT-007-version-mismatch"
}

# --- FX-NT-008 Max Impressions Reached ------------------------------------------

fx_nt_008() {
  local sandbox out
  sandbox="$(new_sandbox)"
  do_refresh "$sandbox" "$FIXTURE_ROOT/max-impressions-one.json" 1.0.0
  out="$(render "$sandbox" 1.0.0)"
  case "$out" in
    *"max_impressions is 1"*) ;;
    *) fail "FX-NT-008: expected the notice on the first render, got: $out" ;;
  esac
  out="$(render "$sandbox" 1.0.0)"
  [ -z "$out" ] || fail "FX-NT-008: notice must not render again after reaching max_impressions, got: $out"
  echo "passed: FX-NT-008-max-impressions"
}

# --- FX-NT-009 Dismiss ----------------------------------------------------------

fx_nt_009() {
  local sandbox out
  sandbox="$(new_sandbox)"
  do_refresh "$sandbox" "$FIXTURE_ROOT/valid-single-notice.json" 1.0.0
  notice_in "$sandbox" dismiss fx-nt-valid >/dev/null
  out="$(render "$sandbox" 1.0.0)"
  [ -z "$out" ] || fail "FX-NT-009: dismissed notice must not render, got: $out"
  echo "passed: FX-NT-009-dismiss"
}

# --- FX-NT-010 Opt-out -----------------------------------------------------------

fx_nt_010() {
  local sandbox out cache_before cache_after
  sandbox="$(new_sandbox)"
  do_refresh "$sandbox" "$FIXTURE_ROOT/valid-single-notice.json" 1.0.0
  notice_in "$sandbox" opt-out >/dev/null

  out="$(render "$sandbox" 1.0.0)"
  [ -z "$out" ] || fail "FX-NT-010: render must be empty after opt-out, got: $out"

  cache_before="$(cat "$(cache_file_in "$sandbox")")"
  # refresh-if-stale must not spawn a fetch at all once opted out.
  XDG_CACHE_HOME="$sandbox/cache" XDG_CONFIG_HOME="$sandbox/config" \
    NOTICE_MANIFEST_URL="$(manifest_url "$FIXTURE_ROOT/version-ranged.json")" \
    node "$NOTICE" refresh-if-stale --version 1.0.0
  sleep 0.3
  cache_after="$(cat "$(cache_file_in "$sandbox")")"
  [ "$cache_before" = "$cache_after" ] || fail "FX-NT-010: cache changed after opt-out; a network check ran"

  # __do-refresh itself must never run for an opted-out user via refresh-if-stale;
  # opt-in restores normal refresh behavior.
  notice_in "$sandbox" opt-in >/dev/null
  do_refresh "$sandbox" "$FIXTURE_ROOT/version-ranged.json" 1.0.0
  cache_after="$(cat "$(cache_file_in "$sandbox")")"
  [ "$cache_before" != "$cache_after" ] || fail "FX-NT-010: refresh did not resume after opt-in"
  echo "passed: FX-NT-010-opt-out"
}

# --- FX-NT-011 Concurrent Refresh ------------------------------------------------

fx_nt_011() {
  local sandbox trace cache_file
  sandbox="$(new_sandbox)"
  cache_file="$(cache_file_in "$sandbox")"
  trace="$sandbox/lock-trace.log"
  : > "$trace"

  # Widen the critical section so two invocations launched back-to-back are
  # forced to genuinely overlap, instead of hoping process scheduling alone
  # creates a race.
  (
    XDG_CACHE_HOME="$sandbox/cache" XDG_CONFIG_HOME="$sandbox/config" \
      NOTICE_MANIFEST_URL="test-delay-file://$REPO/$FIXTURE_ROOT/valid-single-notice.json" \
      NOTICE_TEST_LOCK_TRACE="$trace" NOTICE_TEST_FETCH_DELAY_MS=400 \
      node "$NOTICE" __do-refresh --version 1.0.0
  ) &
  local p1=$!
  sleep 0.05
  (
    XDG_CACHE_HOME="$sandbox/cache" XDG_CONFIG_HOME="$sandbox/config" \
      NOTICE_MANIFEST_URL="test-delay-file://$REPO/$FIXTURE_ROOT/valid-single-notice.json" \
      NOTICE_TEST_LOCK_TRACE="$trace" NOTICE_TEST_FETCH_DELAY_MS=400 \
      node "$NOTICE" __do-refresh --version 1.0.0
  ) &
  local p2=$!
  wait "$p1" "$p2"

  local acquired skipped
  acquired="$(grep -c '^acquired' "$trace" || true)"
  skipped="$(grep -c '^skipped-held' "$trace" || true)"
  [ "$acquired" = "1" ] || fail "FX-NT-011: expected exactly one acquired refresh, trace: $(cat "$trace")"
  [ "$skipped" = "1" ] || fail "FX-NT-011: expected exactly one skipped-held refresh, trace: $(cat "$trace")"

  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$cache_file" \
    || fail "FX-NT-011: cache is not valid JSON after concurrent refresh"
  echo "passed: FX-NT-011-concurrent-refresh"
}

# --- FX-NT-012 Synthetic Event --------------------------------------------------

fx_nt_012() {
  local sandbox cache_file state_file
  sandbox="$(new_sandbox)"
  cache_file="$(cache_file_in "$sandbox")"
  state_file="$(state_file_in "$sandbox")"

  require_file "scripts/prompt-routing-hook.mjs"
  local task_json
  task_json='{"prompt":"add a notice check to the login flow"}'
  printf '%s' "$task_json" | \
    XDG_CACHE_HOME="$sandbox/cache" XDG_CONFIG_HOME="$sandbox/config" \
    node scripts/prompt-routing-hook.mjs --format=claude-json >/dev/null

  [ -f "$cache_file" ] && fail "FX-NT-012: Synthetic/Suggestion path created a Notice cache file"
  [ -f "$state_file" ] && fail "FX-NT-012: Synthetic/Suggestion path created a Notice state file"

  if ! grep -q 'work-start.sh.*from this suggestion' scripts/prompt-routing-hook.mjs; then
    fail "FX-NT-012: expected prompt-routing-hook.mjs to still refuse to invoke Work-start itself"
  fi
  if grep -q 'notice.mjs' scripts/prompt-routing-hook.mjs; then
    fail "FX-NT-012: prompt-routing-hook.mjs must never reference notice.mjs"
  fi
  echo "passed: FX-NT-012-synthetic-event"
}

# --- work-start.sh driven fixtures (013 / 014 / 015) -----------------------------

# manifest_rel is required (not optional): every fixture-driven work-start.sh
# run must point NOTICE_MANIFEST_URL at a local fixture file. Without this,
# work-start.sh's own end-of-run refresh-if-stale would spawn a real
# background fetch against the default https:// URL; that detached child can
# hold the refresh lock for up to the hard timeout and silently starve a
# later synchronous do_refresh() call in the same sandbox.
run_work_start_capturing_artifact() {
  local sandbox="$1"
  local task="$2"
  local version="$3"
  local manifest_rel="$4"
  [ -n "$manifest_rel" ] || fail "run_work_start_capturing_artifact requires manifest_rel (no real network in fixtures)"
  local out artifact
  out="$(XDG_CACHE_HOME="$sandbox/cache" XDG_CONFIG_HOME="$sandbox/config" \
    NOTICE_MANIFEST_URL="$(manifest_url "$manifest_rel")" \
    TASK="$task" bash scripts/work-start.sh 2>&1)" || fail "work-start.sh exited non-zero for: $task"
  artifact="$(printf '%s\n' "$out" | sed -n 's/^work-start artifact created: //p')"
  [ -n "$artifact" ] || fail "could not parse artifact path for: $task"
  case "$artifact" in
    .oh-my-ai/work-start/*) ;;
    *) fail "unsafe artifact path: $artifact" ;;
  esac
  cleanup_paths+=("$artifact")
  printf '%s\n%s' "$artifact" "$out"
}

# --- FX-NT-013 Artifact Content Invariance --------------------------------------

fx_nt_013() {
  local sandbox result artifact_notice artifact_plain out_notice out_plain
  sandbox="$(new_sandbox)"

  result="$(run_work_start_capturing_artifact "$sandbox" "fx-nt-013 without notice" 1.0.0 "$FIXTURE_ROOT/does-not-exist.json")"
  artifact_plain="$(printf '%s' "$result" | head -1)"

  # That run's own end-of-run refresh-if-stale may have left a detached child
  # still holding the lock; let it clear before the do_refresh() below claims
  # the same lock in the same sandbox.
  wait_for_refresh_lock_clear "$sandbox"
  do_refresh "$sandbox" "$FIXTURE_ROOT/valid-single-notice.json" 1.0.0
  result="$(run_work_start_capturing_artifact "$sandbox" "fx-nt-013 with notice" 1.0.0 "$FIXTURE_ROOT/does-not-exist.json")"
  artifact_notice="$(printf '%s' "$result" | head -1)"
  out_notice="$(printf '%s' "$result" | tail -n +2)"

  case "$out_notice" in
    *"a valid single notice"*) ;;
    *) fail "FX-NT-013: expected the notice text in stdout for the second run" ;;
  esac

  if grep -rli "valid single notice" "$artifact_plain" "$artifact_notice" >/dev/null 2>&1; then
    fail "FX-NT-013: notice text leaked into a Candidate Artifact file"
  fi
  echo "passed: FX-NT-013-artifact-invariance"
}

# --- FX-NT-014 Remote Not Injected / FX-NT-015 Next-run Visibility --------------

fx_nt_014_015() {
  local sandbox result artifact1 out1 artifact2 out2
  sandbox="$(new_sandbox)"

  # Run 1: cache starts empty, so isCacheStale() is true regardless of which
  # manifest the end-of-run refresh-if-stale points at -- pointing it at a
  # nonexistent file only makes that detached child's own fetch fail fast, it
  # does not stop the child from spawning and briefly holding the refresh
  # lock. The Cache-first / Next-run claim under test is about ordering
  # within THIS run's own output, not about racing a background child's
  # completion time.
  result="$(run_work_start_capturing_artifact "$sandbox" "fx-nt-014 first run" 1.0.0 "$FIXTURE_ROOT/does-not-exist.json")"
  artifact1="$(printf '%s' "$result" | head -1)"
  out1="$(printf '%s' "$result" | tail -n +2)"
  case "$out1" in
    *"a valid single notice"*) fail "FX-NT-014: Remote result leaked into the run that triggered the refresh" ;;
  esac

  # Let that leftover detached child release the lock before the deterministic
  # do_refresh() below claims it in the same sandbox.
  wait_for_refresh_lock_clear "$sandbox"

  # Deterministically materialize "the eventual detached refresh completed"
  # instead of racing the real detached child on process-scheduling timing.
  do_refresh "$sandbox" "$FIXTURE_ROOT/valid-single-notice.json" 1.0.0
  [ -s "$(cache_file_in "$sandbox")" ] || fail "FX-NT-014: expected cache to be populated after refresh"

  # Run 2: the now-warm cache is this run's Snapshot; the notice must appear.
  result="$(run_work_start_capturing_artifact "$sandbox" "fx-nt-015 second run" 1.0.0 "$FIXTURE_ROOT/does-not-exist.json")"
  artifact2="$(printf '%s' "$result" | head -1)"
  out2="$(printf '%s' "$result" | tail -n +2)"
  case "$out2" in
    *"a valid single notice"*) ;;
    *) fail "FX-NT-015: expected the notice to appear on the next explicit Work-start run" ;;
  esac

  echo "passed: FX-NT-014-remote-not-injected"
  echo "passed: FX-NT-015-next-run-visibility"
}

# --- run everything ---------------------------------------------------------------

require_file "$NOTICE"
require_file "scripts/work-start.sh"
for m in valid-single-notice version-ranged unsupported-schema invalid bad-action-url max-impressions-one; do
  require_file "$FIXTURE_ROOT/$m.json"
done

fx_nt_001
fx_nt_002
fx_supplementary_action_url_allowlist
fx_nt_003
fx_nt_004
fx_nt_005
fx_nt_006
fx_nt_007
fx_nt_008
fx_nt_009
fx_nt_010
fx_nt_011
fx_nt_012
fx_nt_013
fx_nt_014_015

echo "all Notice fixtures passed"
