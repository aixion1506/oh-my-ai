#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/oh-my-ai-completion-notify.XXXXXX")"
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
mode() { stat -c '%a' "$1"; }
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
  [ -f "$TEMP_ROOT/pids" ] || return 0
  sleep 1
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    if kill -0 "$pid" 2>/dev/null; then
      fail "provider child $pid is still alive"
    fi
  done <"$TEMP_ROOT/pids"
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
assert state['version'] == 2 and state['adapter_version'] == 2
settings=json.loads((h/'.claude/settings.json').read_text()); stop=settings['hooks']['Stop']
assert len(stop) == 2 and sum('oh-my-ai/notifications/adapters/claude' in json.dumps(x) for x in stop) == 1
assert all('matcher' not in x for x in stop if 'oh-my-ai/notifications/adapters/claude' in json.dumps(x))
for path, expected in ((h/'.codex/config.toml',0o600),(h/'.claude/settings.json',0o600),(root,0o700),(root/'state',0o700),(root/'state/completion-notify.json',0o600),(h/'state/oh-my-ai',0o700),(h/'state/oh-my-ai/completion-notify.log',0o600),(root/'dispatcher',0o700)):
    assert stat.S_IMODE(path.stat().st_mode) == expected, (path, oct(stat.S_IMODE(path.stat().st_mode)))
assert list((h/'.codex').glob('config.toml.oh-my-ai-completion-notify.*.bak'))
assert all(stat.S_IMODE(p.stat().st_mode) == 0o600 for p in (h/'.codex').glob('config.toml.oh-my-ai-completion-notify.*.bak'))
assert all(stat.S_IMODE(p.stat().st_mode) == 0o600 for p in (h/'.claude').glob('settings.json.oh-my-ai-completion-notify.*.bak'))
PY
assert_dead_pids
pass "FX-CN-004 three installs preserve first provider, one dispatcher, exact modes, and no child"

runtime="$(runtime_root)"
ln -s "$runtime/dispatcher" "$runtime/self-dispatcher"
python3 - "$(state_path)" "$runtime/self-dispatcher" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['previous_codex_notify']=[sys.argv[2]]; open(p,'w').write(json.dumps(d))
PY
before_invocations="$(grep -c 'dispatcher invoked' "$XDG_STATE_HOME/oh-my-ai/completion-notify.log")"
"$(dispatcher)" '{"type":"agent-turn-complete","cwd":"/repo"}'
sleep 1
after_invocations="$(grep -c 'dispatcher invoked' "$XDG_STATE_HOME/oh-my-ai/completion-notify.log")"
[ "$after_invocations" -eq $((before_invocations + 1)) ] || fail "recursive dispatcher invocation occurred"
assert_dead_pids
pass "FX-CN-005 dispatcher blocks exact and realpath self-invocation"

use_home timeout
seed_settings
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
mac_hang="$TEMP_ROOT/macos-hang"; down_hang="$TEMP_ROOT/downstream-hang"
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$$" >>"$PID_FILE"\nsleep 5\n' >"$mac_hang"
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$$" >>"$PID_FILE"\nsleep 5\n' >"$down_hang"
chmod 700 "$mac_hang" "$down_hang"
python3 - "$(state_path)" "$down_hang" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['previous_codex_notify']=[sys.argv[2]]; open(p,'w').write(json.dumps(d))
PY
started="$(date +%s%N)"
OH_MY_AI_NOTIFY_TIMEOUT=0.2 OH_MY_AI_NOTIFY_MACOS_ADAPTER="$mac_hang" "$(dispatcher)" '{"type":"agent-turn-complete","cwd":"/repo"}'
elapsed=$(( $(date +%s%N) - started ))
[ "$elapsed" -lt 1000000000 ] || fail "dispatcher blocked on a hanging provider"
for _ in $(seq 1 100); do OH_MY_AI_NOTIFY_TIMEOUT=0.2 OH_MY_AI_NOTIFY_MACOS_ADAPTER="$mac_hang" "$(dispatcher)" '{"type":"agent-turn-complete","cwd":"/repo"}'; done
assert_dead_pids
pass "FX-CN-006 macOS/downstream timeout, single-worker cap, and 100 dispatch child cleanup"

rendered="$(OH_MY_AI_NOTIFY_RENDER_ONLY=1 "$REPO/scripts/completion-notify-macos.sh" '{"type":"agent-turn-complete","cwd":"/private/abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz","last-assistant-message":"SECRET=sk-live /Users/alice RPL-123 branch diff terminal"}')"
[ "$rendered" = $'Codex Turn 완료 · abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefgh\n응답이 완료되었습니다. 결과를 확인하세요.' ] || fail "default notification contract leaked assistant content or project normalization changed"
pass "FX-CN-007 fixed body contains zero assistant-summary characters"

use_home rollback
seed_settings
rollback_hash="$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")"
if OH_MY_AI_NOTIFY_TEST_FAIL_AT=after-state "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "injected transaction failure succeeded"; fi
[ "$rollback_hash" = "$(hash_files "$CODEX_DIR/config.toml" "$CLAUDE_DIR/settings.json")" ] || fail "transaction rollback did not restore settings"
[ ! -e "$(runtime_root)" ] || fail "transaction rollback left runtime or state"
pass "FX-CN-008 transaction rollback restores config, state, and runtime"

use_home claude-diverged
seed_settings
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
python3 - "$CLAUDE_DIR/settings.json" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['hooks']['Stop'][-1]['hooks'][0]['command'] += '; user-change'; open(p,'w').write(json.dumps(d))
PY
if "$REPO/scripts/completion-notify.py" uninstall >/dev/null; then fail "modified Claude hook was treated as removable"; fi
grep -q 'user-change' "$CLAUDE_DIR/settings.json" || fail "modified Claude hook was removed"
python3 - "$CODEX_DIR/config.toml" <<'PY'
import sys, tomllib
assert 'notify' not in tomllib.loads(open(sys.argv[1]).read())
PY
pass "FX-CN-009 Claude divergence is preserved while Codex restores independently"

use_home codex-diverged
seed_settings
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
printf 'notify = ["user-owned"]\n' >"$CODEX_DIR/config.toml"
if "$REPO/scripts/completion-notify.py" uninstall >/dev/null; then fail "Codex divergence was treated as fully removed"; fi
grep -q 'user-owned' "$CODEX_DIR/config.toml" || fail "Codex divergence was overwritten"
if grep -q 'oh-my-ai/notifications/adapters/claude' "$CLAUDE_DIR/settings.json"; then fail "exact Claude hook was not removed independently"; fi
pass "FX-CN-010 Codex divergence preserves Codex while Claude cleans independently"

use_home uninstall
seed_settings "\"$fake_downstream\", \"--keep\""
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
"$REPO/scripts/completion-notify.py" uninstall >/dev/null || fail "first uninstall failed"
"$REPO/scripts/completion-notify.py" uninstall >/dev/null || fail "second uninstall was not a no-op success"
python3 - "$CODEX_DIR/config.toml" <<'PY'
import sys, tomllib
assert tomllib.loads(open(sys.argv[1]).read())['notify'][0].endswith('downstream-fast')
PY
[ ! -e "$(state_path)" ] && [ ! -e "$(dispatcher)" ] || fail "successful uninstall retained state or runtime"
pass "FX-CN-011 previous provider restore and repeat uninstall no-op"

use_home managed-without-state
seed_settings "\"$XDG_DATA_HOME/oh-my-ai/notifications/dispatcher\""
if "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "managed notify without state was inferred"; fi
pass "FX-CN-012 managed notify without valid state is NOT VERIFIABLE"

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
