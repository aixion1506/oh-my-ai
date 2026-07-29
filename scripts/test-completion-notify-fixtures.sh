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
manifest() { node -e 'const fs=require("fs"), path=require("path"), crypto=require("crypto"); const root=process.argv[1], out=[]; const visit=(p,rel)=>{const st=fs.lstatSync(p,{throwIfNoEntry:false}); if(!st)return; const row={path:rel,type:st.isSymbolicLink()?"symlink":st.isDirectory()?"dir":"file",mode:(st.mode&0o777).toString(8)}; if(st.isSymbolicLink())row.target=fs.readlinkSync(p); if(st.isFile())row.sha256=crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); out.push(row); if(st.isDirectory())for(const n of fs.readdirSync(p).sort())visit(path.join(p,n),path.join(rel,n));}; visit(root,"."); console.log(JSON.stringify(out));' "$HOME"; }
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
assert state['version'] == 2 and state['adapter_version'] == 2
settings=json.loads((h/'.claude/settings.json').read_text()); stop=settings['hooks']['Stop']
assert len(stop) == 2 and sum('oh-my-ai/notifications/adapters/claude' in json.dumps(x) for x in stop) == 1
assert all('matcher' not in x for x in stop if 'oh-my-ai/notifications/adapters/claude' in json.dumps(x))
for path, expected in ((h/'.codex/config.toml',0o600),(h/'.claude/settings.json',0o600),(root,0o700),(root/'state',0o700),(root/'state/completion-notify.json',0o600),(root/'dispatcher',0o700),(root/'adapters/macos',0o700),(root/'adapters/claude',0o700)):
    assert stat.S_IMODE(path.stat().st_mode) == expected, (path, oct(stat.S_IMODE(path.stat().st_mode)))
assert list((h/'.codex').glob('config.toml.oh-my-ai-completion-notify.*.bak'))
assert all(stat.S_IMODE(p.stat().st_mode) == 0o600 for p in (h/'.codex').glob('config.toml.oh-my-ai-completion-notify.*.bak'))
assert all(stat.S_IMODE(p.stat().st_mode) == 0o600 for p in (h/'.claude').glob('settings.json.oh-my-ai-completion-notify.*.bak'))
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
chmod 644 "$CODEX_DIR/config.toml"
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
[ "$(mode "$CODEX_DIR/config.toml")" = 644 ] || fail "existing 0644 config mode was not preserved"
[ "$(mode "$(state_path)")" = 600 ] || fail "new state mode is not private"
python3 - "$(state_path)" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['version']=1; d.pop('adapter_version',None); d.pop('claude_hook',None); d.pop('claude_hook_fingerprint',None); open(p,'w').write(json.dumps(d))
PY
chmod 644 "$(state_path)"
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
[ "$(mode "$(state_path)")" = 600 ] || fail "v1 state migration did not strengthen mode"
pass "FX-CN-004c config mode preservation and private-state migration mode"

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
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$$" >>"$PID_FILE"\nsleep 5\n' >"$mac_hang"
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$$" >>"$PID_FILE"\nsleep 5\n' >"$down_hang"
chmod 700 "$mac_hang" "$down_hang"
python3 - "$(state_path)" "$down_hang" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['previous_codex_notify']=[sys.argv[2]]; open(p,'w').write(json.dumps(d))
PY
: >"$TEMP_ROOT/pids"
: >"$TEMP_ROOT/supervisors"
started="$(date +%s%N)"
OH_MY_AI_NOTIFY_TIMEOUT=1 OH_MY_AI_NOTIFY_MACOS_ADAPTER="$mac_hang" "$(dispatcher)" '{"type":"agent-turn-complete","cwd":"/repo"}'
elapsed=$(( $(date +%s%N) - started ))
[ "$elapsed" -lt 1000000000 ] || fail "dispatcher blocked on a hanging provider"
for _ in $(seq 1 100); do
  OH_MY_AI_NOTIFY_TIMEOUT=1 OH_MY_AI_NOTIFY_MACOS_ADAPTER="$mac_hang" "$(dispatcher)" '{"type":"agent-turn-complete","cwd":"/repo"}' &
done
wait
sleep 0.05
[ "$(grep -cve '^$' "$TEMP_ROOT/supervisors")" -eq 1 ] || fail "100-call burst started more than one concurrent supervisor"
assert_live_pids_at_most "$TEMP_ROOT/pids" provider 2
sleep 3
assert_dead_pids "$TEMP_ROOT/pids" provider
assert_dead_pids "$TEMP_ROOT/supervisors" supervisor
pass "FX-CN-006 macOS/downstream timeout, single-worker cap, and 100 dispatch child cleanup"

rendered="$(OH_MY_AI_NOTIFY_RENDER_ONLY=1 "$REPO/scripts/completion-notify-macos.sh" '{"type":"agent-turn-complete","cwd":"/private/abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz","last-assistant-message":"SECRET=sk-live /Users/alice RPL-123 branch diff terminal"}')"
[ "$rendered" = $'Codex Turn 완료 · abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefgh\n응답이 완료되었습니다. 결과를 확인하세요.' ] || fail "default notification contract leaked assistant content or project normalization changed"
pass "FX-CN-007 fixed body contains zero assistant-summary characters"

use_home privacy
seed_settings
"$REPO/scripts/completion-notify.py" install --yes >/dev/null
fake_mac="$TEMP_ROOT/privacy-mac"; fake_down="$TEMP_ROOT/privacy-down"
printf '#!/usr/bin/env bash\nprintf "%%s" "$1" >"$PRIVACY_MAC"\n' >"$fake_mac"
printf '#!/usr/bin/env bash\nprintf "%%s" "$1" >"$PRIVACY_DOWN"\n' >"$fake_down"
chmod 700 "$fake_mac" "$fake_down"
python3 - "$(state_path)" "$fake_down" <<'PY'
import json, sys
p=sys.argv[1]; d=json.load(open(p)); d['previous_codex_notify']=[sys.argv[2]]; open(p,'w').write(json.dumps(d))
PY
printf '%s' '{"cwd":"/repo/claude","last_assistant_message":"SECRET"}' | PRIVACY_MAC="$TEMP_ROOT/privacy-mac.json" PRIVACY_DOWN="$TEMP_ROOT/privacy-down.json" OH_MY_AI_NOTIFY_MACOS_ADAPTER="$fake_mac" "$(runtime_root)/adapters/claude"
sleep 1
for capture in "$TEMP_ROOT/privacy-mac.json" "$TEMP_ROOT/privacy-down.json"; do
  grep -q SECRET "$capture" && fail "Claude assistant content leaked to provider"
  grep -Eq 'last_assistant_message|last-assistant-message|prompt|transcript|response|output' "$capture" && fail "Claude assistant field leaked to provider"
done
pass "FX-CN-007b Claude event is cwd-only for macOS and downstream providers"

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
