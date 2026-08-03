#!/usr/bin/env python3
"""Optional, local-only completion notification integration.

The installer edits user-owned settings only after explicit consent.  Every
managed write is regular-file only, atomically replaced, and permission scoped
to the invoking user.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import platform
import re
import shlex
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python >= 3.11 is required
    tomllib = None

REPO = Path(__file__).resolve().parent.parent
STATE_VERSION = 3
ADAPTER_VERSION = 2


def paths() -> dict[str, Path]:
    home = Path(os.environ.get("HOME", str(Path.home())))
    data = Path(os.environ.get("XDG_DATA_HOME", home / ".local/share")) / "oh-my-ai/notifications"
    state_root = data / "state"
    log_root = Path(os.environ.get("XDG_STATE_HOME", home / ".local/state")) / "oh-my-ai"
    return {
        "home": home,
        "data": data,
        "state_root": state_root,
        "state": state_root / "completion-notify.json",
        "claude_backup": state_root / "claude-settings.preimage.bak",
        "state_lock": state_root / "completion-notify.json.dispatch.lock",
        "dispatcher": data / "dispatcher",
        "macos": data / "adapters/macos",
        "codex": data / "adapters/codex",
        "claude": data / "adapters/claude",
        "log_root": log_root,
        "log": log_root / "completion-notify.log",
        "codex_config": Path(os.environ.get("CODEX_DIR", home / ".codex")) / "config.toml",
        "claude_settings": Path(os.environ.get("CLAUDE_DIR", home / ".claude")) / "settings.json",
    }


def say(message: str) -> None:
    print(message)


def reject_symlink(path: Path, label: str) -> None:
    if path.is_symlink():
        raise ValueError(f"{label} is a symlink; refusing to follow it")


def read_regular_bytes(path: Path, label: str) -> bytes | None:
    if not path.exists() and not path.is_symlink():
        return None
    reject_symlink(path, label)
    info = path.stat()
    if not stat.S_ISREG(info.st_mode):
        raise ValueError(f"{label} is not a regular file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        with os.fdopen(fd, "rb", closefd=False) as source:
            return source.read()
    finally:
        os.close(fd)


def ensure_dir(path: Path, created_dirs: list[Path], enforce_mode: bool = False) -> None:
    if path.exists() or path.is_symlink():
        reject_symlink(path, str(path))
        if not path.is_dir():
            raise ValueError(f"{path} is not a directory")
        if enforce_mode:
            os.chmod(path, 0o700)
        return
    parent = path.parent
    if parent != path:
        ensure_dir(parent, created_dirs)
    path.mkdir(mode=0o700)
    os.chmod(path, 0o700)
    created_dirs.append(path)


def fsync_directory(path: Path) -> None:
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def atomic_write(path: Path, value: str | bytes, created_dirs: list[Path], default_mode: int = 0o600, preserve_existing_mode: bool = False) -> None:
    """Replace one regular file without predictable temporary names."""
    reject_symlink(path, str(path))
    ensure_dir(path.parent, created_dirs)
    existing = path.stat().st_mode if path.exists() else None
    destination_mode = stat.S_IMODE(existing) if preserve_existing_mode and existing is not None else default_mode
    payload = value.encode("utf-8") if isinstance(value, str) else value
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temp = Path(temp_name)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as destination:
            destination.write(payload)
            destination.flush()
            os.fsync(destination.fileno())
        os.replace(temp, path)
        os.chmod(path, destination_mode)
        fsync_directory(path.parent)
    except Exception:
        try:
            temp.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def backup(path: Path, created_dirs: list[Path]) -> Path | None:
    content = read_regular_bytes(path, str(path))
    if content is None:
        return None
    ensure_dir(path.parent, created_dirs)
    fd, name = tempfile.mkstemp(prefix=f"{path.name}.oh-my-ai-completion-notify.", suffix=".bak", dir=path.parent)
    destination = Path(name)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as target:
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        os.chmod(destination, 0o600)
        fsync_directory(path.parent)
        return destination
    except Exception:
        try:
            destination.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def command_array(value, label: str) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list) or not value or not all(isinstance(item, str) and item for item in value):
        raise ValueError(f"{label} must be a non-empty TOML string array")
    return value


def parse_toml(path: Path) -> tuple[str, dict]:
    if tomllib is None:
        raise ValueError("Python 3.11+ tomllib is required")
    raw_bytes = read_regular_bytes(path, "Codex config")
    raw = raw_bytes.decode("utf-8") if raw_bytes is not None else ""
    notify_line_span(raw)
    try:
        return raw, tomllib.loads(raw or "")
    except tomllib.TOMLDecodeError as error:
        raise ValueError(f"Codex config is not valid TOML: {error}") from error


def notify_line_span(raw: str) -> tuple[int, int] | None:
    """Find one physical top-level `notify` assignment without rewriting TOML."""
    table_seen = False
    found = None
    offset = 0
    for line in raw.splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("["):
            table_seen = True
        if not table_seen and re.match(r"^\s*notify\s*=", line):
            if found is not None:
                raise ValueError("duplicate top-level notify assignments")
            if not line.rstrip().endswith("]"):
                raise ValueError("multi-line top-level notify cannot be safely replaced")
            found = (offset, offset + len(line))
        offset += len(line)
    return found


def set_codex_notify(config: Path, command: list[str] | None, created_dirs: list[Path]) -> None:
    raw, parsed = parse_toml(config)
    span = notify_line_span(raw)
    existing = command_array(parsed.get("notify"), "top-level notify")
    if (existing is None) != (span is None):
        raise ValueError("top-level notify structure is ambiguous; refusing to edit")
    replacement = "" if command is None else f"notify = {json.dumps(command, ensure_ascii=False)}\n"
    if span:
        raw = raw[:span[0]] + replacement + raw[span[1]:]
    elif command:
        raw = replacement + raw
    atomic_write(config, raw, created_dirs, preserve_existing_mode=True)
    parse_toml(config)


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def fingerprint(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def claude_hook_command(adapter: Path) -> str:
    quoted_adapter = shlex.quote(str(adapter))
    return f"if [ -x {quoted_adapter} ]; then {quoted_adapter}; else cat >/dev/null 2>&1 || :; fi"


def managed_claude_hook(adapter: Path) -> dict:
    return {"hooks": [{"type": "command", "command": claude_hook_command(adapter)}]}


def contains_managed_adapter(hook: object) -> bool:
    return isinstance(hook, dict) and "oh-my-ai/notifications/adapters/claude" in canonical_json(hook)


def load_json(path: Path, default):
    raw = read_regular_bytes(path, str(path))
    return default if raw is None else json.loads(raw.decode("utf-8"))


def load_claude(settings: Path) -> tuple[dict, list]:
    data = load_json(settings, {})
    if not isinstance(data, dict) or not isinstance(data.get("hooks", {}), dict):
        raise ValueError("Claude settings must be a JSON object with an optional hooks object")
    hooks = data.setdefault("hooks", {})
    stop = hooks.setdefault("Stop", [])
    if not isinstance(stop, list):
        raise ValueError("Claude Stop hooks must be an array")
    return data, stop


def merge_claude(settings: Path, expected: dict, created_dirs: list[Path]) -> bool:
    data, stop = load_claude(settings)
    exact = [hook for hook in stop if hook == expected]
    similar = [hook for hook in stop if contains_managed_adapter(hook) and hook != expected]
    if len(exact) > 1:
        raise ValueError("duplicate exact oh-my-ai Claude completion hooks")
    if similar:
        raise ValueError("existing Claude completion hook diverged; refusing to replace it")
    if exact:
        return False
    stop.append(expected)
    atomic_write(settings, json.dumps(data, ensure_ascii=False, indent=2) + "\n", created_dirs, preserve_existing_mode=True)
    return True


def copy_runtime(p: dict[str, Path], created_dirs: list[Path]) -> None:
    ensure_dir(p["data"], created_dirs, enforce_mode=True)
    ensure_dir(p["state_root"], created_dirs, enforce_mode=True)
    for key, filename in {"dispatcher": "completion-notify-dispatcher.sh", "macos": "completion-notify-macos.sh", "codex": "completion-notify-codex.sh", "claude": "completion-notify-claude.sh"}.items():
        source = REPO / "scripts" / filename
        content = source.read_bytes()
        atomic_write(p[key], content, created_dirs, default_mode=0o700)
        os.chmod(p[key], 0o700)


def installed_dispatcher_command(p: dict[str, Path]) -> list[str]:
    return [str(p["dispatcher"])]


def dispatcher_realpath(p: dict[str, Path]) -> str:
    return os.path.realpath(p["dispatcher"])


def managed_provider_realpaths(p: dict[str, Path]) -> set[str]:
    return {os.path.realpath(path) for path in (p["dispatcher"], p["codex"])}


def is_managed_provider_path(p: dict[str, Path], value: str) -> bool:
    expanded = os.path.expanduser(value)
    absolute = os.path.abspath(os.path.normpath(expanded))
    return absolute in {os.path.abspath(os.path.normpath(str(p["dispatcher"]))), os.path.abspath(os.path.normpath(str(p["codex"])))} or os.path.realpath(absolute) in managed_provider_realpaths(p)


def validate_previous_codex_notify(p: dict[str, Path], previous: list[str] | None) -> None:
    if previous is None:
        return
    command_array(previous, "saved previous notify")
    if is_managed_provider_path(p, previous[0]):
        raise ValueError("saved previous notify points to a managed provider")


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def claude_restore_metadata(p: dict[str, Path], original: bytes | None, mode: int | None, postimage: bytes) -> dict:
    if original is not None:
        atomic_write(p["claude_backup"], original, [], default_mode=0o600)
    return {
        "existed": original is not None,
        "backup_path": str(p["claude_backup"]) if original is not None else None,
        "preimage_digest": digest(original) if original is not None else None,
        "preimage_mode": mode,
        "postimage_digest": digest(postimage),
    }


def state_from_install(p: dict[str, Path], previous: list[str] | None, hook: dict, restore: dict | None = None) -> dict:
    validate_previous_codex_notify(p, previous)
    return {
        "version": STATE_VERSION,
        "adapter_version": ADAPTER_VERSION,
        "installed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "dispatcher": str(p["dispatcher"]),
        "dispatcher_realpath": dispatcher_realpath(p),
        "previous_codex_notify": previous,
        "claude_hook": hook,
        "claude_hook_fingerprint": fingerprint(hook),
        "claude_restore": restore,
    }


def read_state(p: dict[str, Path]) -> tuple[dict | None, bool]:
    raw = read_regular_bytes(p["state"], "completion notification state")
    if raw is None:
        return None, False
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f"completion notification state is invalid: {error}") from error
    if not isinstance(value, dict):
        raise ValueError("completion notification state must be a JSON object")
    return value, True


def validate_state(p: dict[str, Path], state: dict) -> tuple[dict, bool]:
    if stat.S_IMODE(p["state"].stat().st_mode) != 0o600:
        raise ValueError("completion notification state mode is not private")
    previous = state.get("previous_codex_notify")
    validate_previous_codex_notify(p, previous)
    if state.get("dispatcher") != str(p["dispatcher"]) or state.get("dispatcher_realpath", dispatcher_realpath(p)) != dispatcher_realpath(p):
        raise ValueError("saved dispatcher identity does not match this installation")
    hook = state.get("claude_hook")
    if state.get("version") != STATE_VERSION or state.get("adapter_version") != ADAPTER_VERSION:
        raise ValueError("completion notification state version is unsupported")
    if not isinstance(hook, dict) or state.get("claude_hook_fingerprint") != fingerprint(hook):
        raise ValueError("saved Claude hook identity is invalid")
    restore = state.get("claude_restore")
    if not isinstance(restore, dict) or not isinstance(restore.get("existed"), bool) or not isinstance(restore.get("postimage_digest"), str):
        raise ValueError("saved Claude restore boundary is invalid")
    if restore["existed"]:
        if restore.get("backup_path") != str(p["claude_backup"]) or not isinstance(restore.get("preimage_digest"), str) or not isinstance(restore.get("preimage_mode"), int):
            raise ValueError("saved Claude preimage ownership is invalid")
        backup_bytes = read_regular_bytes(p["claude_backup"], "Claude settings preimage backup")
        if backup_bytes is None or stat.S_IMODE(p["claude_backup"].stat().st_mode) != 0o600 or digest(backup_bytes) != restore["preimage_digest"]:
            raise ValueError("saved Claude preimage backup is invalid")
    elif restore.get("backup_path") is not None or restore.get("preimage_digest") is not None or restore.get("preimage_mode") is not None:
        raise ValueError("saved absent Claude settings boundary is invalid")
    return state, False


def capture(paths_to_capture: list[Path]) -> dict[Path, tuple[bytes, int] | None]:
    result: dict[Path, tuple[bytes, int] | None] = {}
    for path in paths_to_capture:
        content = read_regular_bytes(path, str(path))
        result[path] = None if content is None else (content, stat.S_IMODE(path.stat().st_mode))
    return result


def restore(snapshot: dict[Path, tuple[bytes, int] | None], created_dirs: list[Path], created_backups: list[Path]) -> None:
    for path, prior in snapshot.items():
        try:
            if prior is None:
                if path.exists() or path.is_symlink():
                    reject_symlink(path, str(path))
                    path.unlink()
            else:
                content, mode = prior
                atomic_write(path, content, created_dirs, default_mode=mode)
                os.chmod(path, mode)
        except OSError:
            pass
    for path in created_backups:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
    for directory in reversed(created_dirs):
        try:
            directory.rmdir()
        except OSError:
            pass


def preview(p: dict[str, Path]) -> dict:
    raw, parsed = parse_toml(p["codex_config"])
    notify_line_span(raw)
    codex_previous = command_array(parsed.get("notify"), "top-level notify")
    _, stop = load_claude(p["claude_settings"])
    return {"codex_previous": codex_previous, "claude_stop_count": len(stop), "os": platform.system()}


def install(args: argparse.Namespace) -> int:
    p = paths()
    try:
        info = preview(p)
    except (ValueError, json.JSONDecodeError) as error:
        say(f"completion notify: preview failed; no settings changed: {error}")
        return 1
    say(f"Detected OS: {info['os']}")
    say("Detected Runtime: Codex, Claude Code")
    say(f"Existing notification configuration: Codex notify {'present' if info['codex_previous'] else 'absent'}; Claude Stop hook count {info['claude_stop_count']}")
    say("Configuration Preview: Codex top-level notify → oh-my-ai dispatcher; Claude Stop hook → additive adapter")
    say(f"Backup path: {p['codex_config']}.oh-my-ai-completion-notify.*.bak and {p['claude_settings']}.oh-my-ai-completion-notify.*.bak")
    approved = args.yes
    if not approved and sys.stdin.isatty() and sys.stdout.isatty():
        approved = input("Codex·Claude Turn 완료 알림을 설정할까요? [Y/n] ").strip().lower() in ("", "y", "yes")
    if not approved:
        say("completion notify: skipped (explicit opt-in required; settings unchanged)")
        return 0
    if os.environ.get("OH_MY_AI_NOTIFY_TEST_PLATFORM", platform.system()) != "Darwin":
        say("completion notify: skipped (macOS notification provider is the only supported provider; settings unchanged)")
        return 0
    current = info["codex_previous"]
    expected_dispatcher = installed_dispatcher_command(p)
    try:
        saved, state_exists = read_state(p)
        if current == expected_dispatcher:
            if not state_exists:
                raise ValueError("NOT VERIFIABLE: managed Codex notify has no saved state")
            assert saved is not None
            state, migrate_state = validate_state(p, saved)
            previous = state["previous_codex_notify"]
        else:
            if state_exists:
                raise ValueError("NOT VERIFIABLE: saved state exists but Codex notify is not managed")
            previous = current
            state = state_from_install(p, previous, managed_claude_hook(p["claude"]))
            migrate_state = True
        hook = state["claude_hook"]
        if not isinstance(hook, dict) or state.get("claude_hook_fingerprint") != fingerprint(hook):
            raise ValueError("NOT VERIFIABLE: saved Claude hook identity is invalid")
    except (AssertionError, ValueError, json.JSONDecodeError) as error:
        say(f"completion notify: install not verifiable; settings unchanged: {error}")
        return 1

    created_dirs: list[Path] = []
    managed_files = [p["codex_config"], p["claude_settings"], p["state"], p["claude_backup"], p["state_lock"], p["log"], p["dispatcher"], p["macos"], p["codex"], p["claude"]]
    try:
        snapshot = capture(managed_files)
        copy_runtime(p, created_dirs)
        if os.environ.get("OH_MY_AI_NOTIFY_TEST_FAIL_AT") == "after-runtime":
            raise RuntimeError("injected transaction failure")
        if current != expected_dispatcher:
            set_codex_notify(p["codex_config"], expected_dispatcher, created_dirs)
        if os.environ.get("OH_MY_AI_NOTIFY_TEST_FAIL_AT") == "after-config":
            raise RuntimeError("injected transaction failure")
        original_claude = read_regular_bytes(p["claude_settings"], "Claude settings")
        original_claude_mode = stat.S_IMODE(p["claude_settings"].stat().st_mode) if original_claude is not None else None
        merge_claude(p["claude_settings"], hook, created_dirs)
        if migrate_state:
            state["claude_restore"] = claude_restore_metadata(
                p, original_claude, original_claude_mode,
                read_regular_bytes(p["claude_settings"], "managed Claude settings") or b"",
            )
            atomic_write(p["state"], json.dumps(state, ensure_ascii=False, indent=2) + "\n", created_dirs)
        if os.environ.get("OH_MY_AI_NOTIFY_TEST_FAIL_AT") == "after-state":
            raise RuntimeError("injected transaction failure")
        if test(argparse.Namespace()) != 0:
            raise RuntimeError("synthetic dispatcher test failed")
        if os.environ.get("OH_MY_AI_NOTIFY_TEST_FAIL_AT") in ("after-self-test", "after-log", "after-lock"):
            raise RuntimeError("injected transaction failure")
    except Exception as error:
        restore(snapshot, created_dirs, [])
        say(f"completion notify: failed and restored the installation transaction: {error}")
        return 1
    say("completion notify: installed; Codex config parsed and synthetic event dispatched")
    return 0


def status(_args: argparse.Namespace) -> int:
    p = paths()
    try:
        _, parsed = parse_toml(p["codex_config"])
        notify = command_array(parsed.get("notify"), "top-level notify")
        codex = "managed" if notify == installed_dispatcher_command(p) else "not-managed"
        state, present = read_state(p)
        if present:
            assert state is not None
            validate_state(p, state)
        state_label = "present" if present else "absent"
    except Exception as error:
        codex, state_label = f"invalid ({error})", "unknown"
    say(f"completion notify status: Codex {codex}; dispatcher {'ready' if p['dispatcher'].is_file() and os.access(p['dispatcher'], os.X_OK) else 'missing'}; state {state_label}")
    return 0


def test(_args: argparse.Namespace) -> int:
    p = paths()
    if not p["dispatcher"].is_file():
        say("completion notify test: dispatcher missing (install first)")
        return 1
    payload = json.dumps({"type": "agent-turn-complete", "cwd": "/safe/project"})
    try:
        with tempfile.TemporaryDirectory(prefix="oh-my-ai-completion-notify-self-test.") as root:
            fixture = Path(root) / "notifications"
            (fixture / "adapters").mkdir(parents=True, mode=0o700)
            adapter = fixture / "adapters/macos"
            atomic_write(adapter, "#!/usr/bin/env bash\nexit 0\n", [], default_mode=0o700)
            os.chmod(adapter, 0o700)
            result = subprocess.run([str(p["dispatcher"]), payload], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=2, env={**os.environ, "OH_MY_AI_NOTIFY_HOME": str(fixture), "XDG_STATE_HOME": str(Path(root) / "state")})
    except subprocess.TimeoutExpired:
        say("completion notify test: dispatcher timeout")
        return 1
    if result.returncode != 0:
        say("completion notify test: dispatcher failed")
        return 1
    say("completion notify test: synthetic Codex Turn event accepted (macOS delivery is Manual E2E)")
    return 0


class ActiveDispatcherLock(Exception):
    """A live supervisor owns the notification lock."""


def acquire_dispatch_lock(p: dict[str, Path], created_dirs: list[Path]) -> int:
    """Acquire the stable dispatch inode without changing a competing lock."""
    ensure_dir(p["state_root"], created_dirs)
    lock = p["state_lock"]
    reject_symlink(lock, str(lock))
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError("dispatcher lock is not a regular file")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ActiveDispatcherLock from error
        os.fchmod(fd, 0o600)
        return fd
    except Exception:
        os.close(fd)
        raise


def release_dispatch_lock(fd: int) -> None:
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)


def remove_held_dispatch_lock(p: dict[str, Path], fd: int) -> bool:
    """Remove only the stable lock inode currently held by this uninstall."""
    lock = p["state_lock"]
    try:
        if lock.is_symlink():
            return False
        current = os.lstat(lock)
        held = os.fstat(fd)
        if not stat.S_ISREG(current.st_mode) or (current.st_dev, current.st_ino) != (held.st_dev, held.st_ino):
            return False
        lock.unlink()
        return True
    except OSError:
        return False


def remove_runtime(p: dict[str, Path]) -> bool:
    complete = True
    for path in (p["dispatcher"], p["macos"], p["codex"], p["claude"], p["state"], p["log"]):
        if path.exists() or path.is_symlink():
            if path.is_symlink():
                complete = False
                continue
            try:
                path.unlink()
            except OSError:
                complete = False
    return complete


def remove_empty_managed_dirs(p: dict[str, Path]) -> None:
    for directory in (p["state_root"], p["data"] / "adapters", p["data"], p["log_root"]):
        try:
            directory.rmdir()
        except OSError:
            pass


def require_safe_optional_file(path: Path, label: str) -> None:
    """Reject links and non-regular managed artifacts before uninstall writes."""
    if path.exists() or path.is_symlink():
        read_regular_bytes(path, label)


def validate_uninstall_preflight(p: dict[str, Path], state: dict) -> None:
    """Prove every managed surface is removable before changing any surface."""
    restore = state["claude_restore"]
    current_claude = read_regular_bytes(p["claude_settings"], "Claude settings")
    if current_claude is None or digest(current_claude) != restore["postimage_digest"]:
        raise ValueError(f"Claude settings changed after install; backup retained at {restore.get('backup_path')}")

    _, parsed = parse_toml(p["codex_config"])
    if command_array(parsed.get("notify"), "top-level notify") != installed_dispatcher_command(p):
        raise ValueError("Codex notify changed after install; state and backup retained for manual recovery")

    for key, filename in {"dispatcher": "completion-notify-dispatcher.sh", "macos": "completion-notify-macos.sh", "codex": "completion-notify-codex.sh", "claude": "completion-notify-claude.sh"}.items():
        installed = read_regular_bytes(p[key], f"managed {key} runtime")
        if installed is None or digest(installed) != digest((REPO / "scripts" / filename).read_bytes()):
            raise ValueError(f"managed {key} runtime is missing or changed")
        if not os.access(p[key], os.X_OK):
            raise ValueError(f"managed {key} runtime is not executable")
    for key, label in (("log", "managed completion log"), ("state_lock", "dispatcher lock")):
        require_safe_optional_file(p[key], label)
    for directory in (p["data"], p["state_root"], p["data"] / "adapters"):
        reject_symlink(directory, str(directory))
        if not directory.is_dir():
            raise ValueError(f"managed directory is not a directory: {directory}")


def unlink_managed(path: Path, label: str) -> None:
    if path.exists() or path.is_symlink():
        reject_symlink(path, label)
        if not path.is_file():
            raise ValueError(f"{label} is not a regular file")
        path.unlink()


def uninstall(_args: argparse.Namespace) -> int:
    p = paths()
    try:
        state, present = read_state(p)
        if not present:
            _, parsed = parse_toml(p["codex_config"])
            notify = command_array(parsed.get("notify"), "top-level notify")
            data, stop = load_claude(p["claude_settings"])
            managed_hook = any(contains_managed_adapter(hook) for hook in stop)
            runtime_artifact = any(path.exists() or path.is_symlink() for path in (p["data"], p["dispatcher"], p["macos"], p["codex"], p["claude"], p["state_lock"], p["log"]))
            if notify == installed_dispatcher_command(p) or notify == [str(p["codex"])] or managed_hook or runtime_artifact:
                raise ValueError("PARTIAL_INSTALLATION: managed artifacts exist without state")
            say("completion notify uninstall: already absent; nothing changed")
            return 0
        assert state is not None
        state, _ = validate_state(p, state)
    except (AssertionError, ValueError, json.JSONDecodeError) as error:
        say(f"completion notify uninstall: state not verifiable; no settings changed: {error}")
        return 1

    # This is deliberately one preflight: independent restore leaves an
    # unrecoverable mixed lifecycle when another user-owned surface diverged.
    try:
        validate_uninstall_preflight(p, state)
    except ValueError as error:
        say(f"completion notify uninstall: state not verifiable; no settings changed: {error}")
        return 1

    created_dirs: list[Path] = []
    managed_files = [p["codex_config"], p["claude_settings"], p["state"], p["claude_backup"], p["state_lock"], p["log"], p["dispatcher"], p["macos"], p["codex"], p["claude"]]
    snapshot = capture(managed_files)
    try:
        lock_fd = acquire_dispatch_lock(p, created_dirs)
    except ActiveDispatcherLock:
        say("completion notify uninstall: active dispatcher owns the lock; nothing changed")
        return 1
    except (OSError, ValueError) as error:
        say(f"completion notify uninstall: lock not verifiable; no settings changed: {error}")
        return 1

    try:
        set_codex_notify(p["codex_config"], state["previous_codex_notify"], created_dirs)
        restore = state["claude_restore"]
        if restore["existed"]:
            backup_bytes = read_regular_bytes(p["claude_backup"], "Claude settings preimage backup")
            assert backup_bytes is not None
            atomic_write(p["claude_settings"], backup_bytes, created_dirs, default_mode=restore["preimage_mode"])
            os.chmod(p["claude_settings"], restore["preimage_mode"])
        else:
            unlink_managed(p["claude_settings"], "Claude settings")
        for key, label in (("claude_backup", "Claude settings preimage backup"), ("dispatcher", "dispatcher"), ("macos", "macOS adapter"), ("codex", "Codex adapter"), ("claude", "Claude adapter"), ("state", "completion notification state"), ("log", "managed completion log")):
            unlink_managed(p[key], label)
        if not remove_held_dispatch_lock(p, lock_fd):
            raise ValueError("dispatcher lock changed during uninstall")
        remove_empty_managed_dirs(p)
        say("completion notify uninstall: Codex restored; Claude preimage restored byte-exact; local runtime removed")
        return 0
    except Exception as error:
        restore(snapshot, created_dirs, [])
        say(f"completion notify uninstall: failed and restored the uninstall transaction; manual recovery required: {error}")
        return 1
    finally:
        release_dispatch_lock(lock_fd)


def doctor(_args: argparse.Namespace) -> int:
    p = paths()
    failures = 0
    for label, path in (("dispatcher", p["dispatcher"]), ("macOS adapter", p["macos"]), ("Codex adapter", p["codex"]), ("Claude adapter", p["claude"])):
        ok = path.is_file() and not path.is_symlink() and os.access(path, os.X_OK)
        say(f"{label}: {'ready' if ok else 'missing or unsafe'}")
        failures += not ok
    try:
        _, parsed = parse_toml(p["codex_config"])
        command_array(parsed.get("notify"), "top-level notify")
        state, present = read_state(p)
        if present:
            assert state is not None
            validate_state(p, state)
        say("Codex config and local state: structurally valid")
    except Exception as error:
        say(f"Codex config or local state: invalid ({error})")
        failures += 1
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    command = sub.add_parser("install")
    command.add_argument("--yes", action="store_true")
    command.set_defaults(func=install)
    for name, func in (("status", status), ("test", test), ("uninstall", uninstall), ("doctor", doctor)):
        sub.add_parser(name).set_defaults(func=func)
    args = parser.parse_args()
    if sys.version_info < (3, 11) or tomllib is None:
        print(
            "completion notify requires Python 3.11 or newer; "
            "run make with PYTHON=/path/to/python3.11",
            file=sys.stderr,
        )
        return 2
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
