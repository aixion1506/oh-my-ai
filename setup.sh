#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
CODEX_DIR="${CODEX_DIR:-$HOME/.codex}"
AGENT_DIR="${AGENT_DIR:-$HOME/.agents}"
LOCAL_BIN="${LOCAL_BIN:-$HOME/.local/bin}"
MODE="install-shared"
PROFILE_NAME="${PROFILE:-}"
DRY_RUN=0

usage() {
  cat <<'EOF'
usage:
  setup.sh --doctor
  setup.sh --install-shared [--dry-run]
  setup.sh --install-profile --profile <name> [--dry-run]

Policy:
  - Existing ~/.claude/skills and ~/.agents/skills are never overwritten.
  - Existing settings, hooks, agents, and scripts are skipped unless already managed by this repo.
  - Profiles are opt-in. Use profiles/example for templates and profiles/local/<name> for private local profiles.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --doctor) MODE="doctor" ;;
    --install-shared) MODE="install-shared" ;;
    --install-profile) MODE="install-profile" ;;
    --profile) shift; PROFILE_NAME="${1:-}" ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    say "DRY-RUN: $*"
  else
    "$@"
  fi
}

same_link() {
  [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ]
}

path_state() {
  path="$1"
  target="${2:-}"
  if [ -L "$path" ]; then
    link="$(readlink "$path")"
    if [ -n "$target" ] && [ "$link" = "$target" ]; then
      say "managed: $path -> $link"
    else
      say "exists-symlink: $path -> $link"
    fi
  elif [ -e "$path" ]; then
    say "exists-local: $path"
  else
    say "missing: $path"
  fi
}

safe_link() {
  src="$1"
  dest="$2"
  label="${3:-$dest}"
  if same_link "$dest" "$src"; then
    say "ok: $label already managed"
    return 0
  fi
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    say "skip: $label exists; not overwriting ($dest)"
    say "      manual options: keep as-is, back it up yourself, or merge/link intentionally"
    return 0
  fi
  run mkdir -p "$(dirname "$dest")"
  run ln -s "$src" "$dest"
  say "linked: $label -> $src"
}

doctor() {
  say "=== oh-my-ai doctor (read-only) ==="
  path_state "$CLAUDE_DIR/CLAUDE.md" "$REPO/claude/CLAUDE.md"
  path_state "$CLAUDE_DIR/settings.json" "$REPO/claude/settings.json"
  path_state "$CLAUDE_DIR/skills" "$REPO/skills"
  path_state "$CLAUDE_DIR/agents" "$REPO/claude/agents"
  path_state "$CODEX_DIR/AGENTS.md" "$REPO/AGENTS.md"
  path_state "$AGENT_DIR/skills" "$REPO/skills"
  path_state "$LOCAL_BIN/harness-event" "$REPO/scripts/harness-event.mjs"
  say ""
  say "If a path says exists-local or exists-symlink, install-shared will skip it."
}

install_shared() {
  say "=== oh-my-ai install-shared (non-destructive) ==="
  "$REPO/scripts/render-instructions.sh"
  run mkdir -p "$CLAUDE_DIR" "$CODEX_DIR" "$AGENT_DIR" "$LOCAL_BIN"

  safe_link "$REPO/claude/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md" "Claude instruction"
  safe_link "$REPO/claude/settings.json" "$CLAUDE_DIR/settings.json" "Claude shared settings"
  safe_link "$REPO/AGENTS.md" "$CODEX_DIR/AGENTS.md" "Codex instruction"
  safe_link "$REPO/scripts/harness-event.mjs" "$LOCAL_BIN/harness-event" "harness-event"
  safe_link "$REPO/skills" "$CLAUDE_DIR/skills" "Claude shared skills"
  safe_link "$REPO/skills" "$AGENT_DIR/skills" "Codex shared skills"
  safe_link "$REPO/claude/agents" "$CLAUDE_DIR/agents" "Claude shared agents"

  say "=== done: existing user files were skipped, not overwritten ==="
}

install_profile() {
  if [ -z "$PROFILE_NAME" ]; then
    echo "PROFILE is required for install-profile" >&2
    usage >&2
    exit 2
  fi
  profile_dir="$REPO/profiles/local/$PROFILE_NAME"
  if [ ! -d "$profile_dir" ]; then
    profile_dir="$REPO/profiles/$PROFILE_NAME"
  fi
  if [ ! -d "$profile_dir" ]; then
    echo "profile not found: $PROFILE_NAME" >&2
    echo "looked in: $REPO/profiles/local/$PROFILE_NAME and $REPO/profiles/$PROFILE_NAME" >&2
    exit 1
  fi

  say "=== oh-my-ai install-profile: $PROFILE_NAME (opt-in, non-destructive) ==="
  if [ -f "$profile_dir/PROFILE.md" ]; then
    say "profile doc: $profile_dir/PROFILE.md"
  fi
  run mkdir -p "$LOCAL_BIN"
  found=0
  for f in "$profile_dir"/*; do
    [ -f "$f" ] || continue
    [ "$(basename "$f")" != "PROFILE.md" ] || continue
    [ -x "$f" ] || continue
    found=1
    safe_link "$f" "$LOCAL_BIN/$(basename "$f")" "profile script $(basename "$f")"
  done
  if [ "$found" -eq 0 ]; then
    say "no executable profile scripts to install"
  fi
  say "Profile hooks/settings are not auto-enabled. Merge them manually if needed."
}

case "$MODE" in
  doctor) doctor ;;
  install-shared) install_shared ;;
  install-profile) install_profile ;;
  *) echo "invalid mode: $MODE" >&2; exit 2 ;;
esac
