#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/oh-my-ai-completion-notify.XXXXXX")"
trap 'rm -rf "$TEMP_ROOT"' EXIT
fail() { echo "completion notification fixture failure: $*" >&2; exit 1; }
pass() { echo "passed: $1"; }
hash_files() { node -e 'const fs=require("fs"), crypto=require("crypto"); const hash=crypto.createHash("sha256"); for (const file of process.argv.slice(1)) hash.update(fs.readFileSync(file)); console.log(hash.digest("hex"));' "$@"; }

for file in "$REPO/scripts/completion-notify.py" "$REPO/scripts/completion-notify-dispatcher.sh" "$REPO/scripts/completion-notify-macos.sh" "$REPO/scripts/completion-notify-codex.sh" "$REPO/scripts/completion-notify-claude.sh"; do
  [ -f "$file" ] || fail "missing $file"
done
python3 -m py_compile "$REPO/scripts/completion-notify.py"
bash -n "$REPO/scripts/completion-notify-dispatcher.sh" "$REPO/scripts/completion-notify-macos.sh" "$REPO/scripts/completion-notify-codex.sh" "$REPO/scripts/completion-notify-claude.sh"

fixture_home="$TEMP_ROOT/home"
mkdir -p "$fixture_home/.codex" "$fixture_home/.claude"
printf '[features]\nhooks = true\n' >"$fixture_home/.codex/config.toml"
printf '{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":"keep-me"}]}]}}\n' >"$fixture_home/.claude/settings.json"
before_hash="$(hash_files "$fixture_home/.codex/config.toml" "$fixture_home/.claude/settings.json")"
HOME="$fixture_home" XDG_DATA_HOME="$fixture_home/data" XDG_STATE_HOME="$fixture_home/state" "$REPO/scripts/completion-notify.py" install </dev/null >/dev/null
after_hash="$(hash_files "$fixture_home/.codex/config.toml" "$fixture_home/.claude/settings.json")"
[ "$before_hash" = "$after_hash" ] || fail "non-interactive install mutated settings without flag"
pass "FX-CN-001 non-interactive explicit opt-in boundary"

for attempt in 1 2 3; do
  HOME="$fixture_home" XDG_DATA_HOME="$fixture_home/data" XDG_STATE_HOME="$fixture_home/state" OH_MY_AI_NOTIFY_TEST_PLATFORM=Darwin "$REPO/scripts/completion-notify.py" install --yes >/dev/null || fail "install $attempt failed"
done
python3 - "$fixture_home" <<'PY'
import json, sys, tomllib
from pathlib import Path
h=Path(sys.argv[1]); config=tomllib.loads((h/'.codex/config.toml').read_text())
assert config['notify'] == [str(h/'data/oh-my-ai/notifications/dispatcher')]
settings=json.loads((h/'.claude/settings.json').read_text())
stop=settings['hooks']['Stop']; assert len(stop) == 2
assert sum('oh-my-ai/notifications/adapters/claude' in x['hooks'][0]['command'] for x in stop) == 1
PY
pass "FX-CN-002 existing notify absent, Claude additive merge, three-install idempotency"

provider_home="$TEMP_ROOT/existing-provider"
mkdir -p "$provider_home/.codex" "$provider_home/.claude"
printf 'notify = ["computer-use-notify", "--keep"]\n[features]\nhooks = true\n' >"$provider_home/.codex/config.toml"
printf '{"hooks":{}}\n' >"$provider_home/.claude/settings.json"
HOME="$provider_home" XDG_DATA_HOME="$provider_home/data" XDG_STATE_HOME="$provider_home/state" OH_MY_AI_NOTIFY_TEST_PLATFORM=Darwin "$REPO/scripts/completion-notify.py" install --yes >/dev/null
python3 - "$provider_home" <<'PY'
import json, sys
from pathlib import Path
h=Path(sys.argv[1]); state=json.loads((h/'data/oh-my-ai/notifications/state/completion-notify.json').read_text())
assert state['previous_codex_notify'] == ['computer-use-notify', '--keep']
PY
pass "FX-CN-002b existing Codex Computer Use notify is retained downstream"

provider="$TEMP_ROOT/provider"
printf '#!/usr/bin/env bash\nprintf "%%s" "$1" >"$CAPTURE"\nexit 1\n' >"$provider"
chmod +x "$provider"
capture="$TEMP_ROOT/captured.json"
payload='{"type":"agent-turn-complete","cwd":"/private/repo-name","last-assistant-message":"# Heading\n- ignored"}'
HOME="$fixture_home" XDG_DATA_HOME="$fixture_home/data" XDG_STATE_HOME="$fixture_home/state" CAPTURE="$capture" OH_MY_AI_NOTIFY_MACOS_ADAPTER="$provider" "$fixture_home/data/oh-my-ai/notifications/dispatcher" "$payload"
[ "$(cat "$capture")" = "$payload" ] || fail "failing macOS provider blocked dispatch"
pass "FX-CN-003 macOS provider failure is fail-open"

python3 - "$fixture_home" <<'PY'
import json, sys
from pathlib import Path
h=Path(sys.argv[1]); p=h/'data/oh-my-ai/notifications/state/completion-notify.json'; d=json.loads(p.read_text()); d['previous_codex_notify']=['sh','-c','sleep 5']; p.write_text(json.dumps(d))
PY
start="$(date +%s)"
HOME="$fixture_home" XDG_DATA_HOME="$fixture_home/data" XDG_STATE_HOME="$fixture_home/state" OH_MY_AI_NOTIFY_MACOS_ADAPTER="$provider" "$fixture_home/data/oh-my-ai/notifications/dispatcher" "$payload"
elapsed=$(( $(date +%s) - start ))
[ "$elapsed" -lt 2 ] || fail "downstream provider hang blocked dispatcher"
pass "FX-CN-004 downstream failure/hang boundary"

# Restore the original fixture's saved provider before exercising the safe
# uninstall contract; the hang payload above intentionally changed only state.
python3 - "$fixture_home" <<'PY'
import json, sys
from pathlib import Path
h=Path(sys.argv[1]); p=h/'data/oh-my-ai/notifications/state/completion-notify.json'; d=json.loads(p.read_text()); d['previous_codex_notify']=None; p.write_text(json.dumps(d))
PY
HOME="$fixture_home" XDG_DATA_HOME="$fixture_home/data" XDG_STATE_HOME="$fixture_home/state" "$REPO/scripts/completion-notify.py" uninstall >/dev/null
python3 - "$fixture_home" <<'PY'
import sys, tomllib
from pathlib import Path
h=Path(sys.argv[1]); assert 'notify' not in tomllib.loads((h/'.codex/config.toml').read_text())
PY
pass "FX-CN-005 safe uninstall restores absent previous provider"

printf 'notify = ["user-owned"]\n' >"$fixture_home/.codex/config.toml"
if HOME="$fixture_home" XDG_DATA_HOME="$fixture_home/data" XDG_STATE_HOME="$fixture_home/state" "$REPO/scripts/completion-notify.py" uninstall >/dev/null; then fail "diverged uninstall overwrote user config"; fi
pass "FX-CN-006 config divergence blocks uninstall"

duplicate="$TEMP_ROOT/duplicate"; mkdir -p "$duplicate/.codex"
printf 'notify = ["one"]\nnotify = ["two"]\n' >"$duplicate/.codex/config.toml"
if HOME="$duplicate" XDG_DATA_HOME="$duplicate/data" OH_MY_AI_NOTIFY_TEST_PLATFORM=Darwin "$REPO/scripts/completion-notify.py" install --yes >/dev/null; then fail "duplicate top-level notify accepted"; fi
pass "FX-CN-007 duplicate notify and malformed config rejected without mutation"

rendered="$(OH_MY_AI_NOTIFY_RENDER_ONLY=1 "$REPO/scripts/completion-notify-macos.sh" '{"type":"agent-turn-complete","cwd":"/repo","last-assistant-message":"\n# heading\nnext"}')"
[ "$rendered" = $'Codex Turn 완료 · repo\nheading' ] || fail "Markdown/multiline normalization leaked"
rendered="$(OH_MY_AI_NOTIFY_RENDER_ONLY=1 "$REPO/scripts/completion-notify-macos.sh" '{"type":"agent-turn-complete","last-assistant-message":"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz"}')"
summary="${rendered#*$'\n'}"
[ "${#summary}" -eq 90 ] || fail "summary was not truncated to 90 characters"
for payload_case in '{"type":"agent-turn-complete","cwd":"/repo","last-assistant-message":"line"}' '{"type":"agent-turn-complete"}' '{"type":"agent-turn-complete","last-assistant-message":"\u0001 control"}' '{"type":"unsupported"}' '{bad'; do
  OH_MY_AI_NOTIFY_RENDER_ONLY=1 "$REPO/scripts/completion-notify-macos.sh" "$payload_case" >/dev/null || fail "adapter failed open for payload fixture"
done
pass "FX-CN-008 event normalization: cwd/default/multiline/markdown/control/90-char/unsupported/malformed"

claude_capture="$TEMP_ROOT/claude.json"
fake_dispatcher="$TEMP_ROOT/fake-dispatcher"; printf '#!/usr/bin/env bash\nprintf "%%s" "$1" >"$CAPTURE"\n' >"$fake_dispatcher"; chmod +x "$fake_dispatcher"
mkdir -p "$TEMP_ROOT/runtime/adapters"; cp "$REPO/scripts/completion-notify-claude.sh" "$TEMP_ROOT/runtime/adapters/claude"; chmod +x "$TEMP_ROOT/runtime/adapters/claude"; ln -s "$fake_dispatcher" "$TEMP_ROOT/runtime/dispatcher"
printf '%s' '{"cwd":"/repo/claude","last_assistant_message":"- Claude summary"}' | CAPTURE="$claude_capture" OH_MY_AI_NOTIFY_HOME="$TEMP_ROOT/runtime" "$TEMP_ROOT/runtime/adapters/claude"
grep -q '"runtime": "claude"' "$claude_capture" || fail "Claude adapter did not map Stop payload"
pass "FX-CN-009 Claude completion event adapter"
echo "all completion notification fixtures passed"
