#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
# Strip any trailing slash from the temp base: macOS $TMPDIR ends in "/", which
# would produce a double-slash TEMP_ROOT. The installer normalizes managed paths,
# so a double slash would make the fixture's reconstructed paths diverge from the
# recorded managed values (breaks the FX-CN-010 convergence comparison).
TEMP_BASE="${TMPDIR:-/tmp}"
TEMP_ROOT="$(mktemp -d "${TEMP_BASE%/}/oh-my-ai-completion-notify.XXXXXX")"
SOURCE_STATUS="$(git -C "$REPO" status --porcelain)"
export HOME="$TEMP_ROOT/home"
export XDG_DATA_HOME="$HOME/data"
export XDG_STATE_HOME="$HOME/state"
export CODEX_DIR="$HOME/.codex"
export CLAUDE_DIR="$HOME/.claude"
export PYTHONDONTWRITEBYTECODE=1
export OH_MY_AI_NOTIFY_TEST_PLATFORM=Darwin

fail() { echo "completion notification fixture failure: $*" >&2; exit 1; }
pass() { echo "passed: $1"; }
hash_files() { node -e 'const fs=require("fs"), crypto=require("crypto"); const hash=crypto.createHash("sha256"); for (const file of process.argv.slice(1)) hash.update(fs.readFileSync(file)); console.log(hash.digest("hex"));' "$@"; }
manifest() { node -e 'const fs=require("fs"), path=require("path"), crypto=require("crypto"); const root=process.argv[1], out=[]; const visit=(p,rel)=>{const st=fs.lstatSync(p,{throwIfNoEntry:false}); if(!st)return; const row={path:rel,type:st.isSymbolicLink()?"symlink":st.isDirectory()?"dir":"file",mode:(st.mode&0o777).toString(8)}; if(st.isSymbolicLink())row.target=fs.readlinkSync(p); if(st.isFile())row.sha256=crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); out.push(row); if(st.isDirectory())for(const n of fs.readdirSync(p).sort())visit(path.join(p,n),path.join(rel,n));}; visit(root,"."); console.log(JSON.stringify(out));' "$HOME"; }
# Portable file-mode probe: BSD stat lacks GNU `stat -c`, so resolve the mode
# via Python. Uses os.lstat (never follows symlinks) and always prints 4-digit
# octal so Linux and macOS agree byte-for-byte.
mode() {
  python3 - "$1" <<'PY'
import os
import stat
import sys

print(f"{stat.S_IMODE(os.lstat(sys.argv[1]).st_mode):04o}")
PY
}
state_path() { printf '%s\n' "$XDG_DATA_HOME/oh-my-ai/notifications/state/completion-notify.json"; }
runtime_root() { printf '%s\n' "$XDG_DATA_HOME/oh-my-ai/notifications"; }
dispatcher() { printf '%s\n' "$(runtime_root)/dispatcher"; }

cleanup() {
  if [ -f "$TEMP_ROOT/pids" ]; then
    while IFS= read -r pid; do
      [ -n "$pid" ] || continue
      args="$(ps -o args= -p "$pid" 2>/dev/null || true)"
      case "$args" in
        *"$TEMP_ROOT"*)
          kill -TERM -- "-$pid" 2>/dev/null || true
          kill -KILL -- "-$pid" 2>/dev/null || true
          ;;
      esac
    done <"$TEMP_ROOT/pids"
  fi
  rm -rf "$TEMP_ROOT"
  [ "$(git -C "$REPO" status --porcelain)" = "$SOURCE_STATUS" ] || {
    echo "completion notification fixture changed the source tree" >&2
    exit 1
  }
}
trap cleanup EXIT

case "$HOME:$XDG_DATA_HOME:$XDG_STATE_HOME:$CODEX_DIR:$CLAUDE_DIR" in
  "$TEMP_ROOT"/*:"$TEMP_ROOT"/*:"$TEMP_ROOT"/*:"$TEMP_ROOT"/*:"$TEMP_ROOT"/*) ;;
  *) fail "fixture requires a disposable HOME and XDG directories" ;;
esac

for file in "$REPO/scripts/completion-notify.py" "$REPO/scripts/completion-notify-dispatcher.sh" "$REPO/scripts/completion-notify-macos.sh" "$REPO/scripts/completion-notify-codex.sh" "$REPO/scripts/completion-notify-claude.sh"; do
  [ -f "$file" ] || fail "missing $file"
done
PYTHONPYCACHEPREFIX="$TEMP_ROOT/pycache" python3 -m py_compile "$REPO/scripts/completion-notify.py"
bash -n "$REPO/scripts/completion-notify-dispatcher.sh" "$REPO/scripts/completion-notify-macos.sh" "$REPO/scripts/completion-notify-codex.sh" "$REPO/scripts/completion-notify-claude.sh"

use_home() {
  local name="$1"
  export HOME="$TEMP_ROOT/$name/home"
  export XDG_DATA_HOME="$HOME/data"
  export XDG_STATE_HOME="$HOME/state"
  export CODEX_DIR="$HOME/.codex"
  export CLAUDE_DIR="$HOME/.claude"
  export OH_MY_AI_NOTIFY_SUPERVISOR_PID_FILE="$TEMP_ROOT/supervisors"
  mkdir -p "$CODEX_DIR" "$CLAUDE_DIR"
}

seed_settings() {
  local notify="${1:-}"
  if [ -n "$notify" ]; then
    printf 'notify = [%s]\n[features]\nhooks = true\n' "$notify" >"$CODEX_DIR/config.toml"
  else
    printf '[features]\nhooks = true\n' >"$CODEX_DIR/config.toml"
  fi
  printf '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"keep-me"}]}]}}\n' >"$CLAUDE_DIR/settings.json"
  chmod 600 "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json"
}

assert_dead_pids() {
  local file="$1" label="$2"
  [ -f "$file" ] || return 0
  sleep 1
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    if kill -0 "$pid" 2>/dev/null; then
      fail "$label $pid is still alive"
    fi
  done <"$file"
}

assert_live_pids_at_most() {
  local file="$1" label="$2" maximum="$3" live=0 pid
  [ -f "$file" ] || return 0
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    status="$(ps -o stat= -p "$pid" 2>/dev/null || true)"
    if [ -n "$status" ] && [[ "$status" != *Z* ]]; then
      live=$((live + 1))
    fi
  done <"$file"
  [ "$live" -le "$maximum" ] || fail "$label has $live live processes; maximum is $maximum"
}

live_pid_count() {
  local file="$1" live=0 pid status
  [ -f "$file" ] || { printf 0; return; }
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    status="$(ps -o stat= -p "$pid" 2>/dev/null || true)"
    [ -z "$status" ] || [[ "$status" == *Z* ]] || live=$((live + 1))
  done <"$file"
  printf '%s' "$live"
}

sample_maxima() {
  local current
  current="$(live_pid_count "$TEMP_ROOT/supervisors")"; [ "$current" -le "$max_supervisor" ] || max_supervisor="$current"
  current="$(live_pid_count "$TEMP_ROOT/macos-pids")"; [ "$current" -le "$max_macos" ] || max_macos="$current"
  current="$(live_pid_count "$TEMP_ROOT/downstream-pids")"; [ "$current" -le "$max_downstream" ] || max_downstream="$current"
}

use_home boundary
seed_settings
before_hash="$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")"
"$REPO/scripts/completion-notify.py" install </dev/null >/dev/null
[ "$before_hash" = "$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")" ] || fail "non-interactive install mutated settings without opt-in"
make -C "$REPO" install-completion-notify </dev/null >/dev/null
[ "$before_hash" = "$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")" ] || fail "standalone make target mutated settings without opt-in"
pass "FX-CN-001 non-interactive explicit opt-in boundary, including standalone Make target"

if OH_MY_AI_NOTIFY_TEST_PLATFORM=Linux "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then :; else fail "unsupported OS explicit opt-in failed instead of safely skipping"; fi
[ "$before_hash" = "$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")" ] || fail "unsupported OS opt-in mutated settings"
pass "FX-CN-001b unsupported OS/headless explicit opt-in safe skip"

use_home malformed
seed_settings
printf 'notify = ["unterminated"\n' >"$CODEX_DIR/config.toml"
malformed_hash="$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")"
if "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "malformed TOML accepted"; fi
[ "$malformed_hash" = "$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")" ] || fail "malformed TOML mutated settings"
printf 'notify = ["one"]\nnotify = ["two"]\n' >"$CODEX_DIR/config.toml"
duplicate_hash="$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")"
if "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "duplicate notify accepted"; fi
[ "$duplicate_hash" = "$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")" ] || fail "duplicate notify mutated settings"
pass "FX-CN-002 malformed TOML and duplicate notify reject before mutation"

use_home symlink
seed_settings
victim="$TEMP_ROOT/symlink-victim"; printf 'unchanged' >"$victim"
rm "$CODEX_DIR/config.toml"
ln -s "$victim" "$CODEX_DIR/config.toml"
ln -s "$victim" "$CODEX_DIR/.config.toml.tmp"
if "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "symlinked config accepted"; fi
[ "$(cat "$victim")" = "unchanged" ] || fail "config or fixed temp symlink was followed"
pass "FX-CN-003 config symlink and fixed-temp symlink are rejected without overwrite"

for provider_kind in dispatcher codex; do
  use_home "self-initial-$provider_kind"
  managed="$(runtime_root)/$provider_kind"
  [ "$provider_kind" != codex ] || managed="$(runtime_root)/adapters/codex"
  seed_settings "\"$managed\""
  before_hash="$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")"
  if "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "managed $provider_kind initial provider was accepted"; fi
  [ "$before_hash" = "$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")" ] || fail "managed $provider_kind initial provider mutated config"
  [ ! -e "$(state_path)" ] || fail "managed $provider_kind initial provider wrote state"
done
for provider_kind in dispatcher codex; do
  use_home "self-alias-$provider_kind"
  mkdir -p "$(runtime_root)"
  managed="$(runtime_root)/$provider_kind"
  [ "$provider_kind" != codex ] || { mkdir -p "$(runtime_root)/adapters"; managed="$(runtime_root)/adapters/codex"; }
  ln -s "$managed" "$(runtime_root)/alias"
  seed_settings "\"$(runtime_root)/alias\""
  before_hash="$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")"
  if "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "managed $provider_kind alias was accepted"; fi
  [ "$before_hash" = "$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")" ] || fail "managed $provider_kind alias mutated config"
  [ ! -e "$(state_path)" ] || fail "managed $provider_kind alias wrote state"
done
pass "FX-CN-003b exact and realpath managed providers reject before state mutation"

use_home install
fake_downstream="$TEMP_ROOT/downstream-fast"
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$$" >>"$PID_FILE"\nexit 0\n' >"$fake_downstream"
chmod 700 "$fake_downstream"
export PID_FILE="$TEMP_ROOT/pids"
seed_settings "\"$fake_downstream\", \"--keep\""
for attempt in 1 2 3; do
  "$REPO/scripts/completion-notify.py" install --yes >/dev/null || fail "install $attempt failed"
done
python3 - "$HOME" "$fake_downstream" <<'PY'
import json, os, stat, sys, tomllib
from pathlib import Path
h, provider = Path(sys.argv[1]), sys.argv[2]
root=h/'data/oh-my-ai/notifications'; state=json.loads((root/'state/completion-notify.json').read_text())
config=tomllib.loads((h/'.codex/config.toml').read_text())
assert config['notify'] == [str(root/'dispatcher')]
assert state['previous_codex_notify'] == [provider, '--keep']
assert state['version'] == 3 and state['adapter_version'] == 2
assert state['claude_restore']['existed'] is True
settings=json.loads((h/'.claude/settings.json').read_text()); stop=settings['hooks']['Stop']
assert len(stop) == 2 and sum('oh-my-ai/notifications/adapters/claude' in json.dumps(x) for x in stop) == 1
assert all('matcher' not in x for x in stop if 'oh-my-ai/notifications/adapters/claude' in json.dumps(x))
for path, expected in ((h/'.codex/config.toml',0o600),(h/'.claude/settings.json',0o600),(root,0o700),(root/'state',0o700),(root/'state/completion-notify.json',0o600),(root/'dispatcher',0o700),(root/'adapters/macos',0o700),(root/'adapters/claude',0o700)):
    assert stat.S_IMODE(path.stat().st_mode) == expected, (path, oct(stat.S_IMODE(path.stat().st_mode)))
backup=root/'state/claude-settings.preimage.bak'
assert backup.is_file() and stat.S_IMODE(backup.stat().st_mode) == 0o600
assert not list((h/'.codex').glob('config.toml.oh-my-ai-completion-notify.*.bak'))
assert not list((h/'.claude').glob('settings.json.oh-my-ai-completion-notify.*.bak'))
PY
[ ! -e "$XDG_STATE_HOME/oh-my-ai/completion-notify.log" ] || fail "install self-test created a production log"
[ ! -e "$(state_path).dispatch.lock" ] || fail "install self-test created a production lock"
assert_dead_pids "$TEMP_ROOT/pids" provider
assert_dead_pids "$TEMP_ROOT/supervisors" supervisor
pass "FX-CN-004 three installs preserve first provider, one dispatcher, exact modes, and no child"

for provider_kind in dispatcher codex; do
  use_home "self-state-$provider_kind"
  seed_settings "\"$fake_downstream\""
  "$REPO/scripts/completion-notify.py" install --yes >/dev/null
  managed="$(runtime_root)/$provider_kind"
  [ "$provider_kind" != codex ] || managed="$(runtime_root)/adapters/codex"
  python3 - "$(state_path)" "$managed" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['previous_codex_notify']=[sys.argv[2]]; open(p,'w').write(json.dumps(d))
PY
  before_hash="$(hash_files "$CODEX_DIR/config.toml" "$(state_path)")"
  if "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "direct self-reference state was accepted"; fi
  [ "$before_hash" = "$(hash_files "$CODEX_DIR/config.toml" "$(state_path)")" ] || fail "direct self-reference state mutated"
done
for provider_kind in dispatcher codex; do
  use_home "self-state-alias-$provider_kind"
  seed_settings "\"$fake_downstream\""
  "$REPO/scripts/completion-notify.py" install --yes >/dev/null
  managed="$(runtime_root)/$provider_kind"
  [ "$provider_kind" != codex ] || managed="$(runtime_root)/adapters/codex"
  ln -s "$managed" "$(runtime_root)/state-alias"
  python3 - "$(state_path)" "$(runtime_root)/state-alias" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['previous_codex_notify']=[sys.argv[2]]; open(p,'w').write(json.dumps(d))
PY
  before_hash="$(hash_files "$CODEX_DIR/config.toml" "$(state_path)")"
  if "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "alias self-reference state was accepted"; fi
  [ "$before_hash" = "$(hash_files "$CODEX_DIR/config.toml" "$(state_path)")" ] || fail "alias self-reference state mutated"
done
pass "FX-CN-004b existing direct and alias self-reference state is NOT VERIFIABLE"

use_home modes
seed_settings
cp "$CLAUDE_DIR/settings.json" "$TEMP_ROOT/modes-claude.before"
chmod 644 "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json"
chmod 644 "$TEMP_ROOT/modes-claude.before"
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
[ "$(mode "$CODEX_DIR/config.toml")" = 0644 ] || fail "existing 0644 Codex config mode was not preserved"
[ "$(mode "$CLAUDE_DIR/settings.json")" = 0644 ] || fail "existing 0644 Claude settings mode was not preserved"
[ "$(mode "$(state_path)")" = 0600 ] || fail "new state mode is not private"
chmod 644 "$(state_path)"
if "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "state mode weakening was accepted"; fi
chmod 600 "$(state_path)"
"$REPO/scripts/completion-notify.py" uninstall >/dev/null || fail "0644 mode uninstall failed"
[ "$(mode "$CODEX_DIR/config.toml")" = 0644 ] || fail "uninstall changed existing Codex config mode"
[ "$(mode "$CLAUDE_DIR/settings.json")" = 0644 ] || fail "uninstall changed existing Claude settings mode"
cmp -s "$TEMP_ROOT/modes-claude.before" "$CLAUDE_DIR/settings.json" || fail "0644 Claude settings bytes were not restored"

use_home new-modes
rm -f "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json"
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
[ "$(mode "$CODEX_DIR/config.toml")" = 0600 ] || fail "new Codex config mode is not private"
[ "$(mode "$CLAUDE_DIR/settings.json")" = 0600 ] || fail "new Claude settings mode is not private"
pass "FX-CN-004c both user configs preserve modes while new configs and state stay private"

for shape in compact pretty; do
  use_home "claude-preimage-$shape"
  seed_settings
  if [ "$shape" = pretty ]; then
    printf '{\n  "hooks": {\n    "Stop": [\n      {"hooks": [{"type": "command", "command": "keep-me"}]}\n    ]\n  }\n}\n' >"$CLAUDE_DIR/settings.json"
  fi
  chmod 600 "$CLAUDE_DIR/settings.json"
  cp "$CLAUDE_DIR/settings.json" "$TEMP_ROOT/$shape.before"
  "$REPO/scripts/completion-notify.py" install --yes >/dev/null
  "$REPO/scripts/completion-notify.py" uninstall >/dev/null || fail "$shape Claude uninstall failed"
  cmp -s "$TEMP_ROOT/$shape.before" "$CLAUDE_DIR/settings.json" || fail "$shape Claude preimage bytes changed"
  [ "$(mode "$CLAUDE_DIR/settings.json")" = 0600 ] || fail "$shape Claude preimage mode changed"
done
use_home claude-absent
seed_settings
rm "$CLAUDE_DIR/settings.json"
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
[ -f "$CLAUDE_DIR/settings.json" ] || fail "missing Claude settings was not created"
"$REPO/scripts/completion-notify.py" uninstall >/dev/null || fail "missing Claude settings uninstall failed"
[ ! -e "$CLAUDE_DIR/settings.json" ] || fail "originally absent Claude settings was retained"
pass "FX-CN-004d Claude preimage bytes/modes and absent-file boundary restore exactly"

use_home claude-user-change
seed_settings
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
printf '{"hooks":{"Stop":[]},"user_change":"preserve"}\n' >"$CLAUDE_DIR/settings.json"
chmod 644 "$CLAUDE_DIR/settings.json"
changed_manifest="$(manifest)"
if "$REPO/scripts/completion-notify.py" uninstall >/dev/null; then fail "changed Claude settings uninstall succeeded"; fi
[ "$changed_manifest" = "$(manifest)" ] || fail "changed Claude settings uninstall mutated another artifact"
[ -f "$(state_path | sed 's/completion-notify.json$/claude-settings.preimage.bak/')" ] || fail "changed Claude settings removed managed backup"
pass "FX-CN-004e changed Claude settings fail closed with zero mutation and retained backup"

runtime="$(runtime_root)"
ln -s "$runtime/dispatcher" "$runtime/self-dispatcher"
python3 - "$(state_path)" "$runtime/self-dispatcher" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['previous_codex_notify']=[sys.argv[2]]; open(p,'w').write(json.dumps(d))
PY
before_invocations="$(grep -c 'dispatcher invoked' "$XDG_STATE_HOME/oh-my-ai/completion-notify.log" 2>/dev/null || printf 0)"
"$(dispatcher)" '{"type":"agent-turn-complete","cwd":"/repo"}'
sleep 1
after_invocations="$(grep -c 'dispatcher invoked' "$XDG_STATE_HOME/oh-my-ai/completion-notify.log")"
[ "$after_invocations" -eq $((before_invocations + 1)) ] || fail "recursive dispatcher invocation occurred"
assert_dead_pids "$TEMP_ROOT/pids" provider
assert_dead_pids "$TEMP_ROOT/supervisors" supervisor
pass "FX-CN-005 dispatcher blocks exact and realpath self-invocation"

use_home timeout
seed_settings
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
mac_hang="$TEMP_ROOT/macos-hang"; down_hang="$TEMP_ROOT/downstream-hang"
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$$" >>"$MAC_PID_FILE"\nsleep 5\n' >"$mac_hang"
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$$" >>"$DOWN_PID_FILE"\nsleep 5\n' >"$down_hang"
chmod 700 "$mac_hang" "$down_hang"
python3 - "$(state_path)" "$down_hang" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['previous_codex_notify']=[sys.argv[2]]; open(p,'w').write(json.dumps(d))
PY
: >"$TEMP_ROOT/macos-pids"
: >"$TEMP_ROOT/downstream-pids"
: >"$TEMP_ROOT/supervisors"
export MAC_PID_FILE="$TEMP_ROOT/macos-pids"
export DOWN_PID_FILE="$TEMP_ROOT/downstream-pids"
# An unlocked, old lock is reusable. The stable flock, not its age or inode
# replacement, decides which concurrent dispatcher becomes supervisor.
: >"$(state_path).dispatch.lock"
# Age the lock 2 days back. BSD touch cannot parse GNU `touch -d '2 days ago'`,
# so set the mtime via Python for identical Linux/macOS behavior.
python3 - "$(state_path).dispatch.lock" <<'PY'
import os
import sys
import time

when = time.time() - 2 * 86400
os.utime(sys.argv[1], (when, when))
PY
gate="$TEMP_ROOT/dispatch-release"
ready_root="$TEMP_ROOT/dispatch-ready"; mkdir -p "$ready_root"
for worker in $(seq 1 20); do
  ( : >"$ready_root/$worker"; while [ ! -e "$gate" ]; do sleep 0.01; done; OH_MY_AI_NOTIFY_TIMEOUT=1 OH_MY_AI_NOTIFY_MACOS_ADAPTER="$mac_hang" "$(dispatcher)" '{"type":"agent-turn-complete","cwd":"/repo"}') &
done
for _ in $(seq 1 500); do
  [ "$(find "$ready_root" -type f | wc -l)" -eq 20 ] && break
  sleep 0.01
done
[ "$(find "$ready_root" -type f | wc -l)" -eq 20 ] || fail "20-worker barrier did not reach ready state"
ready_count="$(find "$ready_root" -type f | wc -l)"
release_at="$(date +%s%N)"
: >"$gate"
max_supervisor=0; max_macos=0; max_downstream=0
while [ "$(jobs -pr | wc -l)" -gt 0 ]; do sample_maxima; sleep 0.01; done
wait
sample_maxima
[ "$max_supervisor" -eq 1 ] || fail "measured max_live_supervisor=$max_supervisor (expected 1)"
[ "$max_macos" -le 1 ] || fail "measured max_live_macos_provider=$max_macos (expected <=1)"
[ "$max_downstream" -le 1 ] || fail "measured max_live_codex_downstream=$max_downstream (expected <=1)"
printf 'ready_count=%s\nrelease_at=%s\nmax_live_supervisor=%s\nmax_live_macos_provider=%s\nmax_live_codex_downstream=%s\n' "$ready_count" "$release_at" "$max_supervisor" "$max_macos" "$max_downstream"
for _ in $(seq 1 100); do OH_MY_AI_NOTIFY_TIMEOUT=1 OH_MY_AI_NOTIFY_MACOS_ADAPTER="$mac_hang" "$(dispatcher)" '{"type":"agent-turn-complete","cwd":"/repo"}' & done
wait
sleep 3
assert_dead_pids "$TEMP_ROOT/macos-pids" macOS-provider
assert_dead_pids "$TEMP_ROOT/downstream-pids" codex-downstream
assert_dead_pids "$TEMP_ROOT/supervisors" supervisor
final_supervisor="$(live_pid_count "$TEMP_ROOT/supervisors")"; final_macos="$(live_pid_count "$TEMP_ROOT/macos-pids")"; final_downstream="$(live_pid_count "$TEMP_ROOT/downstream-pids")"
[ "$final_supervisor" -eq 0 ] && [ "$final_macos" -eq 0 ] && [ "$final_downstream" -eq 0 ] || fail "child processes remained after burst"
printf 'final_live_supervisor=%s\nfinal_live_macos_provider=%s\nfinal_live_codex_downstream=%s\nrecursive_dispatcher=0\n' "$final_supervisor" "$final_macos" "$final_downstream"
pass "FX-CN-006 stable flock barrier race and 100-call burst cap every child"

use_home lock-active
seed_settings
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
lock_path="$(state_path).dispatch.lock"
: >"$lock_path"
python3 - "$lock_path" <<'PY' &
import fcntl, sys, time
with open(sys.argv[1], 'r+') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    time.sleep(2)
PY
lock_holder=$!
sleep 0.1
before_manifest="$(manifest)"
if "$REPO/scripts/completion-notify.py" uninstall >/dev/null; then fail "uninstall ignored an active dispatcher lock"; fi
[ "$before_manifest" = "$(manifest)" ] || fail "active dispatcher lock allowed uninstall mutation"
wait "$lock_holder"
"$REPO/scripts/completion-notify.py" uninstall >/dev/null || fail "uninstall did not recover after lock release"
pass "FX-CN-006b active flock blocks uninstall without mutation"

use_home lock-symlink
seed_settings
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
lock_path="$(state_path).dispatch.lock"; victim="$TEMP_ROOT/lock-victim"; fake_mac="$TEMP_ROOT/lock-symlink-mac"
printf 'unchanged\n' >"$victim"
rm -f "$lock_path"
ln -s "$victim" "$lock_path"
printf '#!/usr/bin/env bash\nprintf invoked >"$LOCK_SYMLINK_PROVIDER"\n' >"$fake_mac"
chmod 700 "$fake_mac"
LOCK_SYMLINK_PROVIDER="$TEMP_ROOT/lock-symlink-provider" OH_MY_AI_NOTIFY_MACOS_ADAPTER="$fake_mac" "$(dispatcher)" '{"type":"agent-turn-complete","cwd":"/repo"}'
sleep 0.2
[ "$(cat "$victim")" = unchanged ] || fail "dispatcher followed a lock symlink"
[ ! -e "$TEMP_ROOT/lock-symlink-provider" ] || fail "lock symlink started a provider"
pass "FX-CN-006c lock symlink fails open without provider execution"

rendered="$(OH_MY_AI_NOTIFY_RENDER_ONLY=1 "$REPO/scripts/completion-notify-macos.sh" '{"type":"agent-turn-complete","cwd":"/private/abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz","last-assistant-message":"SECRET=sk-live /Users/alice RPL-123 branch diff terminal"}')"
[ "$rendered" = $'Codex Turn 완료 · abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefgh\n응답이 완료되었습니다. 결과를 확인하세요.' ] || fail "default notification contract leaked assistant content or project normalization changed"
pass "FX-CN-007 fixed body contains zero assistant-summary characters"

use_home privacy
fake_mac="$TEMP_ROOT/privacy-mac"; fake_down="$TEMP_ROOT/privacy-down"
printf '#!/usr/bin/env bash\npython3 - "$PRIVACY_MAC" "$1" <<"PY"\nimport datetime,json,os,sys\npayload=json.loads(sys.argv[2]); print(json.dumps({"invocation_id":f"mac-{os.getpid()}","pid":os.getpid(),"runtime":payload.get("runtime","codex"),"payload":payload,"timestamp":datetime.datetime.now(datetime.timezone.utc).isoformat()}), file=open(sys.argv[1],"a"))\nPY\n' >"$fake_mac"
printf '#!/usr/bin/env bash\npython3 - "$PRIVACY_DOWN" "$1" <<"PY"\nimport datetime,json,os,sys\npayload=json.loads(sys.argv[2]); print(json.dumps({"invocation_id":f"down-{os.getpid()}","pid":os.getpid(),"runtime":payload.get("runtime","codex"),"payload":payload,"timestamp":datetime.datetime.now(datetime.timezone.utc).isoformat()}), file=open(sys.argv[1],"a"))\nPY\n' >"$fake_down"
chmod 700 "$fake_mac" "$fake_down"
seed_settings "\"$fake_down\""
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
privacy_stdout="$TEMP_ROOT/privacy.stdout"; privacy_stderr="$TEMP_ROOT/privacy.stderr"
printf '%s' '{"cwd":"/tmp/claude","last_assistant_message":"MARKER-last","last-assistant-message":"MARKER-kebab","prompt":"MARKER-prompt","transcript":"MARKER-transcript","response":"MARKER-response","output":"MARKER-output","result":"MARKER-result"}' | PRIVACY_MAC="$TEMP_ROOT/privacy-mac.jsonl" PRIVACY_DOWN="$TEMP_ROOT/privacy-down.jsonl" OH_MY_AI_NOTIFY_MACOS_ADAPTER="$fake_mac" "$(runtime_root)/adapters/claude" >"$privacy_stdout" 2>"$privacy_stderr"
sleep 1
[ -f "$TEMP_ROOT/privacy-mac.jsonl" ] || fail "Claude event did not reach macOS provider"
[ "$(grep -cve '^$' "$TEMP_ROOT/privacy-mac.jsonl")" -eq 1 ] || fail "Claude event called macOS provider more than once"
[ ! -e "$TEMP_ROOT/privacy-down.jsonl" ] || fail "Claude event created a Codex downstream provider"
python3 - "$TEMP_ROOT/privacy-mac.jsonl" <<'PY'
import json, sys
rows=[json.loads(line) for line in open(sys.argv[1]) if line.strip()]
assert len(rows) == 1 and rows[0]["pid"] > 0 and rows[0]["runtime"] == "claude", rows
assert rows[0]["payload"] == {"type":"agent-turn-complete","runtime":"claude","cwd":"/tmp/claude"}, rows
PY
grep -R -I -E 'MARKER-|last_assistant_message|last-assistant-message|"prompt"|"transcript"|"response"|"output"|"result"' "$TEMP_ROOT/privacy" "$TEMP_ROOT/privacy-mac.jsonl" "$TEMP_ROOT/privacy.stdout" "$TEMP_ROOT/privacy.stderr" 2>/dev/null && fail "privacy marker leaked to fixture surface"
PRIVACY_MAC="$TEMP_ROOT/privacy-mac.jsonl" PRIVACY_DOWN="$TEMP_ROOT/privacy-down.jsonl" OH_MY_AI_NOTIFY_MACOS_ADAPTER="$fake_mac" "$(dispatcher)" '{"type":"agent-turn-complete","runtime":"unknown","cwd":"/repo/unknown"}'
sleep 1
[ ! -e "$TEMP_ROOT/privacy-down.jsonl" ] || fail "unknown runtime created a Codex downstream provider"
PRIVACY_MAC="$TEMP_ROOT/privacy-mac.jsonl" PRIVACY_DOWN="$TEMP_ROOT/privacy-down.jsonl" OH_MY_AI_NOTIFY_MACOS_ADAPTER="$fake_mac" "$(dispatcher)" '{"type":"agent-turn-complete","cwd":"/repo/codex"}'
sleep 1
[ "$(grep -cve '^$' "$TEMP_ROOT/privacy-mac.jsonl")" -eq 3 ] || fail "runtime provider invocation count is not exact"
[ -f "$TEMP_ROOT/privacy-down.jsonl" ] && [ "$(grep -cve '^$' "$TEMP_ROOT/privacy-down.jsonl")" -eq 1 ] || fail "native Codex downstream invocation/PID count is not exact"
python3 - "$TEMP_ROOT/privacy-mac.jsonl" "$TEMP_ROOT/privacy-down.jsonl" <<'PY'
import json,sys
mac=[json.loads(x) for x in open(sys.argv[1]) if x.strip()]; down=[json.loads(x) for x in open(sys.argv[2]) if x.strip()]
assert [x['runtime'] for x in mac] == ['claude','unknown','codex'], mac
assert len({x['pid'] for x in mac}) >= 1 and down[0]['pid'] > 0 and down[0]['runtime'] == 'codex' and down[0]['payload']['cwd'] == '/repo/codex', (mac,down)
PY
find "$TEMP_ROOT" -type f -print0 | xargs -0 grep -I -E 'MARKER-|last_assistant_message|last-assistant-message|"prompt"|"transcript"|"response"|"output"|"result"' -l 2>/dev/null | grep -q . && fail "privacy marker leaked to a fixture regular-file surface"
pass "FX-CN-007b Claude exact payload and unknown runtime never reach Codex downstream"

for stage in after-runtime after-config after-state after-self-test after-log after-lock; do
  use_home "rollback-$stage"
  seed_settings
  rollback_manifest="$(manifest)"
  if OH_MY_AI_NOTIFY_TEST_FAIL_AT="$stage" "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "injected $stage transaction failure succeeded"; fi
  [ "$rollback_manifest" = "$(manifest)" ] || fail "transaction rollback left an artifact after $stage"
done
pass "FX-CN-008 transaction rollback restores exact filesystem manifests at every boundary"

use_home claude-diverged
seed_settings
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
python3 - "$CLAUDE_DIR/settings.json" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['hooks']['Stop'][-1]['hooks'][0]['command'] += '; user-change'; open(p,'w').write(json.dumps(d))
PY
claude_diverged_manifest="$(manifest)"
if "$REPO/scripts/completion-notify.py" uninstall >/dev/null; then fail "modified Claude hook was treated as removable"; fi
[ "$claude_diverged_manifest" = "$(manifest)" ] || fail "Claude divergence changed the managed transaction manifest"
grep -q 'user-change' "$CLAUDE_DIR/settings.json" || fail "modified Claude hook was removed"
grep -q 'oh-my-ai/notifications/dispatcher' "$CODEX_DIR/config.toml" || fail "Claude divergence mutated Codex configuration"
pass "FX-CN-009 Claude divergence fails closed without independent runtime mutation"

use_home codex-diverged
seed_settings
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
printf 'notify = ["user-owned"]\n' >"$CODEX_DIR/config.toml"
codex_diverged_manifest="$(manifest)"
if "$REPO/scripts/completion-notify.py" uninstall >/dev/null; then fail "Codex divergence was treated as fully removed"; fi
[ "$codex_diverged_manifest" = "$(manifest)" ] || fail "Codex divergence partially restored another surface"
grep -q 'user-owned' "$CODEX_DIR/config.toml" || fail "Codex divergence was overwritten"
grep -q 'oh-my-ai/notifications/adapters/claude' "$CLAUDE_DIR/settings.json" || fail "Codex divergence removed Claude state"
python3 - "$CODEX_DIR/config.toml" "$(dispatcher)" <<'PY'
import json,sys
open(sys.argv[1],'w').write('notify = '+json.dumps([sys.argv[2]])+'\n')
PY
"$REPO/scripts/completion-notify.py" uninstall >/dev/null || fail "Codex convergence did not permit atomic cleanup"
"$REPO/scripts/completion-notify.py" uninstall >/dev/null || fail "post-cleanup uninstall was not idempotent"
pass "FX-CN-010 Codex divergence preserves the complete transaction until convergence"

use_home uninstall
seed_settings "\"$fake_downstream\", \"--keep\""
mkdir -p "$XDG_DATA_HOME/oh-my-ai" "$XDG_STATE_HOME/oh-my-ai"
chmod 700 "$XDG_DATA_HOME" "$XDG_DATA_HOME/oh-my-ai" "$XDG_STATE_HOME" "$XDG_STATE_HOME/oh-my-ai"
printf 'keep this unrelated log\n' >"$XDG_STATE_HOME/oh-my-ai/other-oh-my-ai.log"
cp "$XDG_STATE_HOME/oh-my-ai/other-oh-my-ai.log" "$TEMP_ROOT/uninstall-other-log.before"
other_log_hash="$(hash_files "$XDG_STATE_HOME/oh-my-ai/other-oh-my-ai.log")"
other_log_mode="$(mode "$XDG_STATE_HOME/oh-my-ai/other-oh-my-ai.log")"
cp "$CODEX_DIR/config.toml" "$TEMP_ROOT/uninstall-codex.before"; cp "$CLAUDE_DIR/settings.json" "$TEMP_ROOT/uninstall-claude.before"
pre_install_manifest="$(manifest)"
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
"$(dispatcher)" '{"type":"agent-turn-complete","cwd":"/repo/uninstall"}'
sleep 1
[ -f "$XDG_STATE_HOME/oh-my-ai/completion-notify.log" ] || fail "production dispatch did not create its log"
"$REPO/scripts/completion-notify.py" uninstall >/dev/null || fail "first uninstall failed"
if ! [ "$pre_install_manifest" = "$(manifest)" ]; then
  first_uninstall_manifest="$(manifest)"
  diff -u <(printf '%s\n' "$pre_install_manifest") <(printf '%s\n' "$first_uninstall_manifest") >&2 || true
  fail "first uninstall did not restore the pre-install filesystem manifest"
fi
before_second_uninstall="$(manifest)"
second_uninstall_output="$("$REPO/scripts/completion-notify.py" uninstall)" || fail "second uninstall was not a no-op success"
[ "$before_second_uninstall" = "$(manifest)" ] || fail "second uninstall changed the filesystem manifest"
case "$second_uninstall_output" in *"already absent"*) ;; *) fail "second uninstall did not report already absent";; esac
python3 - "$CODEX_DIR/config.toml" <<'PY'
import sys, tomllib
assert tomllib.loads(open(sys.argv[1]).read())['notify'][0].endswith('downstream-fast')
PY
[ ! -e "$(runtime_root)" ] && [ ! -e "$(state_path)" ] && [ ! -e "$(dispatcher)" ] && [ ! -e "$(runtime_root)/adapters/macos" ] && [ ! -e "$(runtime_root)/adapters/codex" ] && [ ! -e "$(runtime_root)/adapters/claude" ] && [ ! -e "$(state_path).dispatch.lock" ] && [ ! -e "$(state_path | sed 's/completion-notify.json$/claude-settings.preimage.bak/')" ] || fail "successful uninstall retained state, runtime, adapter, backup, or lock"
[ ! -e "$XDG_STATE_HOME/oh-my-ai/completion-notify.log" ] || fail "successful uninstall retained managed log"
cmp -s "$TEMP_ROOT/uninstall-other-log.before" "$XDG_STATE_HOME/oh-my-ai/other-oh-my-ai.log" || fail "uninstall changed unrelated log bytes"
[ "$(hash_files "$XDG_STATE_HOME/oh-my-ai/other-oh-my-ai.log")" = "$other_log_hash" ] || fail "uninstall changed an unrelated oh-my-ai log"
[ "$(mode "$XDG_STATE_HOME/oh-my-ai/other-oh-my-ai.log")" = "$other_log_mode" ] || fail "uninstall changed unrelated log mode"
cmp -s "$TEMP_ROOT/uninstall-codex.before" "$CODEX_DIR/config.toml" || fail "Codex config was not byte-exact after uninstall"
cmp -s "$TEMP_ROOT/uninstall-claude.before" "$CLAUDE_DIR/settings.json" || fail "Claude settings were not byte-exact after uninstall"
pass "FX-CN-011 dispatch/uninstall full manifest removes only managed artifacts and repeats as a no-op"

use_home managed-without-state
seed_settings "\"$XDG_DATA_HOME/oh-my-ai/notifications/dispatcher\""
if "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "managed notify without state was inferred"; fi
pass "FX-CN-012 managed notify without valid state is NOT VERIFIABLE"

for partial in config hook runtime config-runtime log-lock; do
  use_home "partial-$partial"
  seed_settings
  "$REPO/scripts/completion-notify.py" install --yes >/dev/null
  case "$partial" in
    config)
      rm -rf "$(runtime_root)"; python3 - "$CLAUDE_DIR/settings.json" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['hooks']['Stop']=d['hooks']['Stop'][:1]; open(p,'w').write(json.dumps(d))
PY
      ;;
    hook)
      python3 - "$CODEX_DIR/config.toml" <<'PY'
import sys
open(sys.argv[1],'w').write('[features]\nhooks = true\n')
PY
      rm -rf "$(runtime_root)"
      ;;
    runtime)
      python3 - "$CODEX_DIR/config.toml" <<'PY'
import sys
open(sys.argv[1],'w').write('[features]\nhooks = true\n')
PY
      python3 - "$CLAUDE_DIR/settings.json" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['hooks']['Stop']=d['hooks']['Stop'][:1]; open(p,'w').write(json.dumps(d))
PY
      ;;
    config-runtime)
      python3 - "$CLAUDE_DIR/settings.json" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['hooks']['Stop']=d['hooks']['Stop'][:1]; open(p,'w').write(json.dumps(d))
PY
      ;;
    log-lock)
      python3 - "$CODEX_DIR/config.toml" <<'PY'
import sys
open(sys.argv[1],'w').write('[features]\nhooks = true\n')
PY
      python3 - "$CLAUDE_DIR/settings.json" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['hooks']['Stop']=d['hooks']['Stop'][:1]; open(p,'w').write(json.dumps(d))
PY
      rm -rf "$(runtime_root)"
      mkdir -p "$XDG_STATE_HOME/oh-my-ai" "$(runtime_root)/state"
      : >"$XDG_STATE_HOME/oh-my-ai/completion-notify.log"; : >"$(state_path).dispatch.lock"
      ;;
  esac
  rm -f "$(state_path)"
  before_manifest="$(manifest)"
  if "$REPO/scripts/completion-notify.py" uninstall >/dev/null; then fail "partial $partial uninstall claimed success"; fi
  [ "$before_manifest" = "$(manifest)" ] || fail "partial $partial uninstall mutated artifacts"
done
use_home partial-absent
seed_settings
"$REPO/scripts/completion-notify.py" uninstall >/dev/null || fail "fully absent uninstall was not no-op success"
pass "FX-CN-012b state-less partial installs fail closed while absent is no-op"

claude_capture="$TEMP_ROOT/claude.json"
fake_dispatcher="$TEMP_ROOT/fake-dispatcher"
printf '#!/usr/bin/env bash\nprintf "%%s" "$1" >"$CLAUDE_CAPTURE"\n' >"$fake_dispatcher"
chmod 700 "$fake_dispatcher"
mkdir -p "$TEMP_ROOT/runtime/adapters"
cp "$REPO/scripts/completion-notify-claude.sh" "$TEMP_ROOT/runtime/adapters/claude"
chmod 700 "$TEMP_ROOT/runtime/adapters/claude"
ln -s "$fake_dispatcher" "$TEMP_ROOT/runtime/dispatcher"
printf '%s' '{"cwd":"/repo/claude","last_assistant_message":"untrusted summary"}' | CLAUDE_CAPTURE="$claude_capture" OH_MY_AI_NOTIFY_HOME="$TEMP_ROOT/runtime" "$TEMP_ROOT/runtime/adapters/claude"
grep -q '"runtime": "claude"' "$claude_capture" || fail "Claude Stop payload was not structurally mapped"
find "$REPO/scripts" -maxdepth 2 -type f -path '*/__pycache__/*' | grep -q . && fail "fixture created source-tree pycache"
pass "FX-CN-013 Claude Stop mapping and source-tree pycache boundary"
echo "all completion notification fixtures passed"
