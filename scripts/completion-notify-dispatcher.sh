#!/usr/bin/env bash
# Delivery is detached from the agent turn. One bounded supervisor at a time
# owns at most two provider children (macOS plus one legacy Codex downstream)
# and kills their process groups on timeout.
set -u
umask 077
BASE="${OH_MY_AI_NOTIFY_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/oh-my-ai/notifications}"
STATE="$BASE/state/completion-notify.json"
LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/oh-my-ai"
LOG="$LOG_DIR/completion-notify.log"
payload="${1:-}"
provider="${OH_MY_AI_NOTIFY_MACOS_ADAPTER:-$BASE/adapters/macos}"

command -v python3 >/dev/null 2>&1 || exit 0
python3 - "$STATE" "$payload" "$provider" "$BASE/dispatcher" "$BASE/adapters/codex" "${OH_MY_AI_NOTIFY_TIMEOUT:-1}" "$LOG_DIR" "$LOG" "${OH_MY_AI_NOTIFY_SUPERVISOR_PID_FILE:-}" >/dev/null 2>&1 <<'PY'
import fcntl, json, os, signal, stat, subprocess, sys, time

state_path, payload, provider, dispatcher, codex_adapter, raw_timeout, log_dir, log_path, supervisor_pid_file = sys.argv[1:]

def regular_open(path, flags, mode=0o600):
    fd = os.open(path, flags | getattr(os, "O_NOFOLLOW", 0), mode)
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        os.close(fd)
        raise ValueError("not a regular file")
    return fd

def write_log():
    try:
        if os.path.lexists(log_dir):
            if os.path.islink(log_dir) or not os.path.isdir(log_dir):
                return
            os.chmod(log_dir, 0o700)
        else:
            os.makedirs(log_dir, mode=0o700)
            os.chmod(log_dir, 0o700)
        fd = regular_open(log_path, os.O_WRONLY | os.O_APPEND | os.O_CREAT)
        try:
            os.fchmod(fd, 0o600)
            os.write(fd, f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} dispatcher invoked\n".encode())
        finally:
            os.close(fd)
    except Exception:
        pass

def downstream_allowed(raw_payload):
    try:
        event = json.loads(raw_payload)
    except Exception:
        return False
    if not isinstance(event, dict) or event.get("type") != "agent-turn-complete":
        return False
    runtime = event.get("runtime")
    # A missing runtime is Codex's native notify contract. Claude and unknown
    # runtimes may use the macOS provider but must never inherit Codex notify.
    return runtime is None or runtime == "codex"

try:
    timeout = max(0.05, min(float(raw_timeout), 5.0))
except ValueError:
    timeout = 1.0
lock_path = state_path + ".dispatch.lock"
children = []
try:
    os.makedirs(os.path.dirname(lock_path), mode=0o700, exist_ok=True)
    lock_fd = regular_open(lock_path, os.O_RDWR | os.O_CREAT)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(lock_fd)
        raise SystemExit(0)
    os.fchmod(lock_fd, 0o600)
    pid = os.fork()
    if pid:
        os.close(lock_fd)
        raise SystemExit(0)
    try:
        os.setsid()
    except OSError:
        pass
    write_log()
    if supervisor_pid_file:
        try:
            fd = regular_open(supervisor_pid_file, os.O_WRONLY | os.O_APPEND | os.O_CREAT)
            try:
                os.fchmod(fd, 0o600)
                os.write(fd, f"{os.getpid()}\n".encode())
            finally:
                os.close(fd)
        except Exception:
            pass
    try:
        def start(argv):
            try:
                return subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            except Exception:
                return None
        child = start([provider, payload])
        if child:
            children.append(child)
        if downstream_allowed(payload):
            try:
                state_fd = regular_open(state_path, os.O_RDONLY)
                with os.fdopen(state_fd, encoding="utf-8") as source:
                    command = json.load(source).get("previous_codex_notify")
                if isinstance(command, list) and command and all(isinstance(x, str) and x for x in command):
                    candidate = os.path.realpath(command[0])
                    if candidate not in (os.path.realpath(dispatcher), os.path.realpath(codex_adapter)):
                        child = start(command + [payload])
                        if child:
                            children.append(child)
            except Exception:
                pass
        deadline = time.monotonic() + timeout
        while any(child.poll() is None for child in children) and time.monotonic() < deadline:
            time.sleep(0.02)
        for child in children:
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
        grace = time.monotonic() + 0.15
        while any(child.poll() is None for child in children) and time.monotonic() < grace:
            time.sleep(0.01)
        for child in children:
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        for child in children:
            try:
                child.wait(timeout=0.2)
            except Exception:
                pass
    finally:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
        finally:
            os.close(lock_fd)
except Exception:
    pass
PY
exit 0
