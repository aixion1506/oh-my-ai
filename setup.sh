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
  setup.sh --init-profile --profile <name> [--dry-run]
  setup.sh --install-profile --profile <name> [--dry-run]

Profile onboarding flow:
  1. make init-profile PROFILE=<name>   — scaffold profiles/local/<name>/ from example
  2. edit profiles/local/<name>/        — fill in <placeholder> values
  3. make install-profile PROFILE=<name> — link executable scripts to ~/.local/bin/
  4. make doctor                         — verify install state

Policy:
  - Existing ~/.claude/skills and ~/.agents/skills are never overwritten.
  - Existing settings, hooks, agents, and scripts are skipped unless already managed by this repo.
  - Profiles are opt-in. Use profiles/example for templates and profiles/local/<name> for private local profiles.
  - profiles/local/ is gitignored. Never commit real account values or tokens.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --doctor) MODE="doctor" ;;
    --install-shared) MODE="install-shared" ;;
    --init-profile) MODE="init-profile" ;;
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
  say ""
  if [ -n "${HARNESS_PROFILE:-}" ]; then
    profile_local="$REPO/profiles/local/$HARNESS_PROFILE"
    if [ -d "$profile_local" ]; then
      say "profile: profiles/local/$HARNESS_PROFILE (exists)"
      for f in "$profile_local"/*.sh; do
        [ -f "$f" ] || continue
        script_name="$(basename "$f")"
        path_state "$LOCAL_BIN/$script_name" "$f"
      done
    else
      say "missing: profiles/local/$HARNESS_PROFILE — run: make init-profile PROFILE=$HARNESS_PROFILE"
    fi
  else
    say "hint: set HARNESS_PROFILE=<name> to use a local profile (optional — see profiles/example/)"
  fi
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

init_profile() {
  if [ -z "$PROFILE_NAME" ]; then
    echo "PROFILE is required for init-profile" >&2
    usage >&2
    exit 2
  fi
  dest_dir="$REPO/profiles/local/$PROFILE_NAME"
  if [ -d "$dest_dir" ]; then
    say "skip: profiles/local/$PROFILE_NAME already exists — not overwriting"
    say "      to reinitialize, remove the directory first:"
    say "        rm -rf profiles/local/$PROFILE_NAME"
    return 0
  fi

  src_dir="$REPO/profiles/example"
  say "=== oh-my-ai init-profile: $PROFILE_NAME ==="
  run mkdir -p "$dest_dir"

  if [ -f "$src_dir/PROFILE.md" ]; then
    run cp "$src_dir/PROFILE.md" "$dest_dir/PROFILE.md"
    say "created: profiles/local/$PROFILE_NAME/PROFILE.md"
  fi

  for f in "$src_dir"/*.example; do
    [ -f "$f" ] || continue
    dest_name="$(basename "${f%.example}")"
    run cp "$f" "$dest_dir/$dest_name"
    say "created: profiles/local/$PROFILE_NAME/$dest_name"
  done

  if [ -d "$src_dir/skills" ]; then
    run mkdir -p "$dest_dir/skills"
    for f in "$src_dir/skills"/*.example; do
      [ -f "$f" ] || continue
      dest_name="$(basename "${f%.example}")"
      run cp "$f" "$dest_dir/skills/$dest_name"
      say "created: profiles/local/$PROFILE_NAME/skills/$dest_name"
    done
  fi

  for script in "$dest_dir"/*.sh; do
    [ -f "$script" ] || continue
    run chmod +x "$script"
    say "chmod +x: $(basename "$script")"
  done

  say ""
  say "Next steps:"
  say "  1. Edit profiles/local/$PROFILE_NAME/ — fill in <placeholder> values"
  say "     (commit-helper.sh, push-guard.sh, claude-settings.json)"
  say "  2. Export in your shell: export HARNESS_PROFILE=$PROFILE_NAME"
  say "     (add to ~/.bashrc or ~/.zshrc to persist)"
  say "  3. Run: make install-profile PROFILE=$PROFILE_NAME"
  say "  4. Run: make doctor"
  say ""
  say "profiles/local/ is gitignored. Do not commit real account values or tokens."
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
    echo "  create it first: make init-profile PROFILE=$PROFILE_NAME" >&2
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
  if [ -f "$profile_dir/claude-settings.json" ]; then
    say ""
    say "note: claude-settings.json found — not auto-merged into ~/.claude/settings.json"
    say "      review and merge manually if you want profile-specific permissions or plugins:"
    say "        $profile_dir/claude-settings.json"
  fi
  say ""
  say "Profile scripts linked to ~/.local/bin/. Hooks and settings are NOT auto-enabled."
  say "To use push-guard.sh as a Claude PreToolUse hook, add it to your local settings.json manually."
}

case "$MODE" in
  doctor) doctor ;;
  install-shared) install_shared ;;
  init-profile) init_profile ;;
  install-profile) install_profile ;;
  *) echo "invalid mode: $MODE" >&2; exit 2 ;;
esac
