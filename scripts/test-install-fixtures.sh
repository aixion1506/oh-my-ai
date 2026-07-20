#!/usr/bin/env bash
set -euo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO"

FIXTURE_ROOT="fixtures/install"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/oh-my-ai-install-fixtures.XXXXXX")"

cleanup() {
  [ "${KEEP_INSTALL_FIXTURE_ARTIFACTS:-}" = "1" ] || rm -rf -- "$TEMP_ROOT"
}
trap cleanup EXIT

fail() {
  echo "fixture failure: $*" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "missing file: $1"
}

require_fixed() {
  local text="$1"
  local value="$2"
  printf '%s\n' "$value" | grep -q -F -- "$text" || fail "missing text '$text'"
}

clone_fixture_repo() {
  local name="$1"
  local clone="$TEMP_ROOT/$name/repo"

  mkdir -p "$(dirname "$clone")"
  git clone --quiet --local "$REPO" "$clone"

  # Let the runner validate the current working tree before its changes are committed.
  if ! git diff --quiet HEAD -- setup.sh Makefile; then
    git diff --binary HEAD -- setup.sh Makefile | git -C "$clone" apply
  fi
  printf '%s\n' "$clone"
}

run_setup() {
  local clone="$1"
  local home_dir="$2"
  shift 2
  env \
    HOME="$home_dir" \
    CLAUDE_DIR="$home_dir/.claude" \
    CODEX_DIR="$home_dir/.codex" \
    AGENT_DIR="$home_dir/.agents" \
    LOCAL_BIN="$home_dir/.local/bin" \
    "$clone/setup.sh" "$@"
}

assert_link() {
  local path="$1"
  local target="$2"
  [ -L "$path" ] || fail "expected symlink: $path"
  [ "$(readlink "$path")" = "$target" ] || fail "unexpected symlink target for $path"
  [ -e "$path" ] || fail "dangling symlink after install: $path"
}

assert_shared_links() {
  local clone="$1"
  local home_dir="$2"

  assert_link "$home_dir/.claude/CLAUDE.md" "$clone/claude/CLAUDE.md"
  assert_link "$home_dir/.claude/settings.json" "$clone/claude/settings.json"
  assert_link "$home_dir/.claude/skills" "$clone/skills"
  [ ! -L "$home_dir/.claude/agents" ] || fail "install created a link for a missing Claude agents source"
  assert_link "$home_dir/.codex/AGENTS.md" "$clone/AGENTS.md"
  assert_link "$home_dir/.codex/hooks.json" "$clone/codex/hooks.json"
  assert_link "$home_dir/.agents/skills" "$clone/skills"
  assert_link "$home_dir/.local/bin/oh-my-ai" "$clone/scripts/oh-my-ai.mjs"
  assert_link "$home_dir/.local/bin/harness-event" "$clone/scripts/harness-event.mjs"
}

link_manifest() {
  local home_dir="$1"
  find "$home_dir" -type l -printf '%p -> %l\n' | sort
}

check_fixture_metadata() {
  local fixture="$1"
  require_file "$fixture/fixture.yaml"
  require_file "$fixture/README.md"
}

check_fresh_install() {
  local fixture="$FIXTURE_ROOT/FX-INS-001-fresh-install"
  local clone home_dir dry_run_output doctor_output
  local before after

  check_fixture_metadata "$fixture"
  clone="$(clone_fixture_repo fresh-install)"
  home_dir="$TEMP_ROOT/fresh-install/home"
  before="$(sha256sum "$clone/CLAUDE.md" "$clone/claude/CLAUDE.md" "$clone/AGENTS.md" "$clone/MINE.md")"
  dry_run_output="$(run_setup "$clone" "$home_dir" --install-shared --dry-run)"
  after="$(sha256sum "$clone/CLAUDE.md" "$clone/claude/CLAUDE.md" "$clone/AGENTS.md" "$clone/MINE.md")"

  [ "$before" = "$after" ] || fail "dry-run changed generated repository instructions"
  [ ! -e "$home_dir/.claude" ] && [ ! -e "$home_dir/.codex" ] && [ ! -e "$home_dir/.agents" ] && [ ! -e "$home_dir/.local" ] \
    || fail "dry-run created a user configuration path"
  require_fixed "DRY-RUN: $clone/scripts/render-instructions.sh" "$dry_run_output"

  run_setup "$clone" "$home_dir" --install-shared >/dev/null
  assert_shared_links "$clone" "$home_dir"
  doctor_output="$(run_setup "$clone" "$home_dir" --doctor --strict)"
  if printf '%s\n' "$doctor_output" | grep -q -E '^dangling:'; then
    fail "healthy fresh install reported a dangling symlink"
  fi

  echo "passed: FX-INS-001 fresh-install"
}

check_reinstall_idempotency() {
  local fixture="$FIXTURE_ROOT/FX-INS-010-reinstall-idempotency"
  local clone home_dir before after output

  check_fixture_metadata "$fixture"
  clone="$(clone_fixture_repo reinstall-idempotency)"
  home_dir="$TEMP_ROOT/reinstall-idempotency/home"
  run_setup "$clone" "$home_dir" --install-shared >/dev/null
  before="$(link_manifest "$home_dir")"
  output="$(run_setup "$clone" "$home_dir" --install-shared)"
  after="$(link_manifest "$home_dir")"

  [ "$before" = "$after" ] || fail "reinstall changed managed symlinks"
  require_fixed "already managed" "$output"
  assert_shared_links "$clone" "$home_dir"

  echo "passed: FX-INS-010 reinstall-idempotency"
}

check_healthy_doctor() {
  local fixture="$FIXTURE_ROOT/FX-INS-020-healthy-doctor"
  local clone home_dir output

  check_fixture_metadata "$fixture"
  clone="$(clone_fixture_repo healthy-doctor)"
  home_dir="$TEMP_ROOT/healthy-doctor/home"
  run_setup "$clone" "$home_dir" --install-shared >/dev/null
  output="$(run_setup "$clone" "$home_dir" --doctor --strict)"

  require_fixed "=== oh-my-ai doctor (read-only) ===" "$output"
  if printf '%s\n' "$output" | grep -q -E '^dangling:'; then
    fail "healthy doctor reported a dangling symlink"
  fi

  echo "passed: FX-INS-020 healthy-doctor"
}

check_broken_install() {
  local fixture="$FIXTURE_ROOT/FX-INS-030-broken-install"
  local clone home_dir default_output strict_output strict_status

  check_fixture_metadata "$fixture"
  clone="$(clone_fixture_repo broken-install)"
  home_dir="$TEMP_ROOT/broken-install/home"
  run_setup "$clone" "$home_dir" --install-shared >/dev/null

  rm -rf -- "$clone/skills"
  rm -f -- "$clone/claude/CLAUDE.md"

  default_output="$(run_setup "$clone" "$home_dir" --doctor)"
  require_fixed "dangling: $home_dir/.claude/CLAUDE.md" "$default_output"
  require_fixed "dangling: $home_dir/.claude/skills" "$default_output"
  require_fixed "dangling: $home_dir/.agents/skills" "$default_output"

  set +e
  strict_output="$(run_setup "$clone" "$home_dir" --doctor --strict 2>&1)"
  strict_status=$?
  set -e
  [ "$strict_status" -eq 1 ] || fail "strict doctor exit code was $strict_status, expected 1"
  require_fixed "dangling: $home_dir/.claude/CLAUDE.md" "$strict_output"

  echo "passed: FX-INS-030 broken-install"
}

doctor_strict_status() {
  local clone="$1"
  local home_dir="$2"
  local status
  set +e
  run_setup "$clone" "$home_dir" --doctor --strict >/dev/null 2>&1
  status=$?
  set -e
  printf '%s' "$status"
}

# Doctor guidance is only useful if following it literally clears strict failure.
# Case A: managed source still exists -> install-shared can relink.
# Case B: managed source is gone      -> install-shared skips, so it must tell the
#         user to remove the dangling link instead.
check_dangling_link_recovery() {
  local fixture="$FIXTURE_ROOT/FX-INS-040-dangling-link-recovery"
  local clone home_dir output link_path

  check_fixture_metadata "$fixture"
  clone="$(clone_fixture_repo dangling-link-recovery)"
  home_dir="$TEMP_ROOT/dangling-link-recovery/home"
  run_setup "$clone" "$home_dir" --install-shared >/dev/null

  # --- Case A: source present, link broken by repointing it at a missing path.
  link_path="$home_dir/.claude/CLAUDE.md"
  rm -f -- "$link_path"
  ln -s "$clone/claude/CLAUDE.md.missing" "$link_path"

  output="$(run_setup "$clone" "$home_dir" --doctor)"
  require_fixed "dangling: $link_path" "$output"
  require_fixed "source exists; run: make install-shared to relink" "$output"
  [ "$(doctor_strict_status "$clone" "$home_dir")" = "1" ] || fail "case A: strict doctor did not fail on dangling link"

  # Follow the printed guidance.
  run_setup "$clone" "$home_dir" --install-shared >/dev/null
  [ "$(doctor_strict_status "$clone" "$home_dir")" = "0" ] \
    || fail "case A: strict doctor still fails after following install-shared guidance"

  # --- Case B: source itself removed, so install-shared cannot help.
  # Use a static managed source: install-shared re-renders generated instruction
  # files and needs skills/ to build its index, so neither can express "source gone".
  link_path="$home_dir/.codex/hooks.json"
  rm -f -- "$clone/codex/hooks.json"

  output="$(run_setup "$clone" "$home_dir" --doctor)"
  require_fixed "dangling: $link_path" "$output"
  require_fixed "source $clone/codex/hooks.json is also missing" "$output"
  require_fixed "to clear it: rm '$link_path'" "$output"
  if printf '%s\n' "$output" | grep -q -E "source exists; run: make install-shared to relink"; then
    fail "case B: doctor recommended install-shared although the source is missing"
  fi
  [ "$(doctor_strict_status "$clone" "$home_dir")" = "1" ] || fail "case B: strict doctor did not fail on dangling link"

  # Following install-shared must NOT be enough here; the link is still dangling.
  run_setup "$clone" "$home_dir" --install-shared >/dev/null
  [ "$(doctor_strict_status "$clone" "$home_dir")" = "1" ] \
    || fail "case B: expected install-shared to be insufficient while the source is missing"

  # Follow the printed guidance instead.
  rm -- "$link_path"
  [ "$(doctor_strict_status "$clone" "$home_dir")" = "0" ] \
    || fail "case B: strict doctor still fails after removing the dangling link as instructed"

  echo "passed: FX-INS-040 dangling-link-recovery"
}

require_file "setup.sh"
require_file "Makefile"
for fixture in "$FIXTURE_ROOT"/FX-INS-*; do
  [ -d "$fixture" ] || fail "no install fixtures found"
  check_fixture_metadata "$fixture"
done

check_fresh_install
check_reinstall_idempotency
check_healthy_doctor
check_broken_install
check_dangling_link_recovery

echo "all install fixtures passed"
