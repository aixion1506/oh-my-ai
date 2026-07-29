#!/usr/bin/env bash
# Delivery is detached from the agent turn.  One bounded supervisor at a time
# owns provider children and kills their process groups on timeout.
set -u
umask 077
BASE="${OH_MY_AI_NOTIFY_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/oh-my-ai/notifications}"
STATE="$BASE/state/completion-notify.json"
LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/oh-my-ai"
LOG="$LOG_DIR/completion-notify.log"
payload="${1:-}"
provider="${OH_MY_AI_NOTIFY_MACOS_ADAPTER:-$BASE/adapters/macos}"

command -v python3 >/dev/null 2>&1 || exit 0
python3 - "$STATE" "$payload" "$provider" "$BASE/dispatcher" "${OH_MY_AI_NOTIFY_TIMEOUT:-1}" "$LOG_DIR" "$LOG" >/dev/null 2>&1 <<'PY' &
import fcntl, json, os, signal, stat, subprocess, sys, time

state_path, payload, provider, dispatcher, raw_timeout, log_dir, log_path = sys.argv[1:]

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

write_log()
try:
    timeout = max(0.05, min(float(raw_timeout), 5.0))
except ValueError:
    timeout = 1.0
lock_path = state_path + ".dispatch.lock"
children = []
try:
    os.makedirs(os.path.dirname(lock_path), mode=0o700, exist_ok=True)
    lock_fd = regular_open(lock_path, os.O_RDWR | os.O_CREAT)
    os.fchmod(lock_fd, 0o600)
    with os.fdopen(lock_fd, "a+", encoding="utf-8") as lock:
        os.chmod(lock_path, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit(0)
        def start(argv):
            try:
                return subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            except Exception:
                return None
        child = start([provider, payload])
        if child:
            children.append(child)
        try:
            state_fd = regular_open(state_path, os.O_RDONLY)
            with os.fdopen(state_fd, encoding="utf-8") as source:
                command = json.load(source).get("previous_codex_notify")
            if isinstance(command, list) and command and all(isinstance(x, str) and x for x in command):
                candidate = os.path.realpath(command[0])
                if candidate != os.path.realpath(dispatcher):
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
except Exception:
    pass
PY
exit 0
