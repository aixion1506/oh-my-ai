#!/usr/bin/env python3
"""Optional, local-only completion notification integration.

The repository is the source; install copies only these runtime files into the
user data directory.  No command in this module reads prompt text or writes a
user configuration until `install` has received explicit consent.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import platform
import re
import shutil
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
SAFE_DEFAULT = "응답이 완료되었습니다."


def paths() -> dict[str, Path]:
    home = Path(os.environ.get("HOME", str(Path.home())))
    data = Path(os.environ.get("XDG_DATA_HOME", home / ".local/share")) / "oh-my-ai/notifications"
    return {
        "home": home,
        "data": data,
        "state": data / "state/completion-notify.json",
        "dispatcher": data / "dispatcher",
        "macos": data / "adapters/macos",
        "codex": data / "adapters/codex",
        "claude": data / "adapters/claude",
        "codex_config": Path(os.environ.get("CODEX_DIR", home / ".codex")) / "config.toml",
        "claude_settings": Path(os.environ.get("CLAUDE_DIR", home / ".claude")) / "settings.json",
    }


def say(message: str) -> None:
    print(message)


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.tmp")
    temp.write_text(value, encoding="utf-8")
    os.replace(temp, path)


def backup(path: Path) -> Path | None:
    if not path.exists():
        return None
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    destination = path.with_name(f"{path.name}.oh-my-ai-completion-notify.{stamp}.bak")
    shutil.copy2(path, destination)
    return destination


def command_array(value, label: str) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list) or not value or not all(isinstance(item, str) and item for item in value):
        raise ValueError(f"{label} must be a non-empty TOML string array")
    return value


def parse_toml(path: Path) -> tuple[str, dict]:
    if tomllib is None:
        raise ValueError("Python 3.11+ tomllib is required")
    raw = path.read_text(encoding="utf-8") if path.exists() else ""
    # TOML itself also rejects duplicate keys, but expose the actionable
    # notification-specific diagnosis before parsing the rest of the file.
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


def set_codex_notify(config: Path, command: list[str] | None) -> None:
    raw, parsed = parse_toml(config)
    span = notify_line_span(raw)
    existing = command_array(parsed.get("notify"), "top-level notify")
    if (existing is None) != (span is None):
        raise ValueError("top-level notify structure is ambiguous; refusing to edit")
    replacement = "" if command is None else f"notify = {json.dumps(command, ensure_ascii=False)}\n"
    if span:
        raw = raw[:span[0]] + replacement + raw[span[1]:]
    elif command:
        # A TOML key after the first table header belongs to that table. Put a
        # newly introduced top-level key before all tables without reformatting
        # any user-owned configuration.
        raw = replacement + raw
    atomic_write(config, raw)
    parse_toml(config)


def claude_hook_command(adapter: Path) -> str:
    return f'if [ -x "{adapter}" ]; then "{adapter}"; else cat >/dev/null 2>&1 || :; fi'


def managed_claude_hook(adapter: Path) -> dict:
    return {"matcher": "", "hooks": [{"type": "command", "command": claude_hook_command(adapter)}]}


def is_managed_claude_hook(hook: object) -> bool:
    if not isinstance(hook, dict):
        return False
    for item in hook.get("hooks", []):
        if isinstance(item, dict) and isinstance(item.get("command"), str) and "oh-my-ai/notifications/adapters/claude" in item["command"]:
            return True
    return False


def merge_claude(settings: Path, adapter: Path) -> tuple[dict, bool]:
    data = load_json(settings, {})
    if not isinstance(data, dict) or not isinstance(data.get("hooks", {}), dict):
        raise ValueError("Claude settings must be a JSON object with an optional hooks object")
    hooks = data.setdefault("hooks", {})
    stop = hooks.setdefault("Stop", [])
    if not isinstance(stop, list):
        raise ValueError("Claude Stop hooks must be an array")
    managed = [item for item in stop if is_managed_claude_hook(item)]
    if len(managed) > 1:
        raise ValueError("duplicate oh-my-ai Claude completion hooks")
    if managed:
        return data, False
    stop.append(managed_claude_hook(adapter))
    return data, True


def copy_runtime(p: dict[str, Path]) -> None:
    sources = {"dispatcher": "completion-notify-dispatcher.sh", "macos": "completion-notify-macos.sh", "codex": "completion-notify-codex.sh", "claude": "completion-notify-claude.sh"}
    for key, filename in sources.items():
        source, target = REPO / "scripts" / filename, p[key]
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        target.chmod(target.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def installed_dispatcher_command(p: dict[str, Path]) -> list[str]:
    return [str(p["dispatcher"])]


def read_state(p: dict[str, Path]) -> dict:
    return load_json(p["state"], {})


def preview(p: dict[str, Path]) -> dict:
    raw, parsed = parse_toml(p["codex_config"])
    notify_line_span(raw)
    codex_previous = command_array(parsed.get("notify"), "top-level notify")
    claude = load_json(p["claude_settings"], {})
    if not isinstance(claude, dict):
        raise ValueError("Claude settings must be a JSON object")
    stop = claude.get("hooks", {}).get("Stop", []) if isinstance(claude.get("hooks", {}), dict) else []
    if not isinstance(stop, list):
        raise ValueError("Claude Stop hooks must be an array")
    return {"codex_previous": codex_previous, "claude_managed": sum(is_managed_claude_hook(h) for h in stop), "os": platform.system()}


def install(args: argparse.Namespace) -> int:
    p = paths()
    try:
        info = preview(p)
    except (ValueError, json.JSONDecodeError) as error:
        say(f"completion notify: preview failed; no settings changed: {error}")
        return 1
    say(f"Detected OS: {info['os']}")
    say("Detected Runtime: Codex, Claude Code")
    say(f"Existing notification configuration: Codex notify {'present' if info['codex_previous'] else 'absent'}; Claude managed hook count {info['claude_managed']}")
    say("Configuration Preview: Codex top-level notify → oh-my-ai dispatcher; Claude Stop hook → additive adapter")
    say(f"Backup path: {p['codex_config']}.oh-my-ai-completion-notify.<timestamp>.bak and {p['claude_settings']}.oh-my-ai-completion-notify.<timestamp>.bak")
    approved = args.yes
    if not approved and sys.stdin.isatty() and sys.stdout.isatty():
        approved = input("Codex·Claude Turn 완료 알림을 설정할까요? [Y/n] ").strip().lower() in ("", "y", "yes")
    if not approved:
        say("completion notify: skipped (explicit opt-in required; settings unchanged)")
        return 0
    if os.environ.get("OH_MY_AI_NOTIFY_TEST_PLATFORM", platform.system()) != "Darwin":
        say("completion notify: skipped (macOS notification provider is the only supported provider; settings unchanged)")
        return 0
    state = read_state(p)
    codex_backup = backup(p["codex_config"])
    claude_backup = backup(p["claude_settings"])
    try:
        copy_runtime(p)
        before_raw, before_parsed = parse_toml(p["codex_config"])
        previous = command_array(before_parsed.get("notify"), "top-level notify")
        set_codex_notify(p["codex_config"], installed_dispatcher_command(p))
        claude_data, _ = merge_claude(p["claude_settings"], p["claude"])
        atomic_write(p["claude_settings"], json.dumps(claude_data, ensure_ascii=False, indent=2) + "\n")
        state = {"version": 1, "installed_at": dt.datetime.now(dt.timezone.utc).isoformat(), "dispatcher": str(p["dispatcher"]), "previous_codex_notify": previous, "codex_backup": str(codex_backup) if codex_backup else None, "claude_backup": str(claude_backup) if claude_backup else None}
        atomic_write(p["state"], json.dumps(state, ensure_ascii=False, indent=2) + "\n")
        if test(argparse.Namespace()) != 0:
            raise RuntimeError("synthetic dispatcher test failed")
    except Exception as error:
        if codex_backup:
            shutil.copy2(codex_backup, p["codex_config"])
        elif p["codex_config"].exists():
            p["codex_config"].unlink()
        if claude_backup:
            shutil.copy2(claude_backup, p["claude_settings"])
        elif p["claude_settings"].exists():
            p["claude_settings"].unlink()
        say(f"completion notify: failed and restored backups: {error}")
        return 1
    say("completion notify: installed; Codex config parsed and synthetic event dispatched")
    return 0


def status(_args: argparse.Namespace) -> int:
    p, state = paths(), read_state(paths())
    try:
        _, parsed = parse_toml(p["codex_config"])
        notify = command_array(parsed.get("notify"), "top-level notify")
        codex = "managed" if notify == installed_dispatcher_command(p) else "not-managed"
    except Exception as error:
        codex = f"invalid ({error})"
    say(f"completion notify status: Codex {codex}; dispatcher {'ready' if p['dispatcher'].is_file() and os.access(p['dispatcher'], os.X_OK) else 'missing'}; state {'present' if state else 'absent'}")
    return 0


def test(_args: argparse.Namespace) -> int:
    p = paths()
    if not p["dispatcher"].is_file():
        say("completion notify test: dispatcher missing (install first)")
        return 1
    payload = json.dumps({"type": "agent-turn-complete", "cwd": "/safe/project", "last-assistant-message": "# 안전한 테스트 응답\nsecond line"})
    result = subprocess.run([str(p["dispatcher"]), payload], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=3)
    if result.returncode != 0:
        say("completion notify test: dispatcher failed")
        return 1
    say("completion notify test: synthetic Codex Turn event accepted (macOS delivery is Manual E2E)")
    return 0


def uninstall(_args: argparse.Namespace) -> int:
    p, state = paths(), read_state(paths())
    if not state:
        say("completion notify uninstall: no local state; nothing changed")
        return 0
    try:
        _, parsed = parse_toml(p["codex_config"])
        current = command_array(parsed.get("notify"), "top-level notify")
    except Exception as error:
        say(f"completion notify uninstall: config unreadable; no settings changed: {error}")
        return 1
    expected = installed_dispatcher_command(p)
    if current != expected:
        say("completion notify uninstall: config diverged; no settings changed. Preview: restore the saved previous notify with `make uninstall-completion-notify` after restoring the dispatcher command, or use the recorded backup path.")
        return 1
    previous = state.get("previous_codex_notify")
    if previous is not None and not isinstance(previous, list):
        say("completion notify uninstall: saved previous notify is invalid; no settings changed")
        return 1
    codex_backup = backup(p["codex_config"])
    claude_backup = backup(p["claude_settings"])
    try:
        set_codex_notify(p["codex_config"], previous)
        data = load_json(p["claude_settings"], {})
        stop = data.get("hooks", {}).get("Stop", []) if isinstance(data, dict) and isinstance(data.get("hooks", {}), dict) else None
        if not isinstance(stop, list):
            raise ValueError("Claude Stop hooks are invalid")
        data["hooks"]["Stop"] = [hook for hook in stop if not is_managed_claude_hook(hook)]
        atomic_write(p["claude_settings"], json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    except Exception as error:
        if codex_backup: shutil.copy2(codex_backup, p["codex_config"])
        if claude_backup: shutil.copy2(claude_backup, p["claude_settings"])
        say(f"completion notify uninstall: failed and restored backups: {error}")
        return 1
    say("completion notify uninstall: restored the previous Codex provider and removed only the managed Claude hook")
    return 0


def doctor(_args: argparse.Namespace) -> int:
    p = paths()
    failures = 0
    for label, path in (("dispatcher", p["dispatcher"]), ("macOS adapter", p["macos"]), ("Codex adapter", p["codex"]), ("Claude adapter", p["claude"])):
        ok = path.is_file() and os.access(path, os.X_OK)
        say(f"{label}: {'ready' if ok else 'missing or not executable'}")
        failures += not ok
    try:
        raw, parsed = parse_toml(p["codex_config"])
        notify_line_span(raw)
        command_array(parsed.get("notify"), "top-level notify")
        say("Codex config: parseable; top-level notify is structurally valid")
    except Exception as error:
        say(f"Codex config: invalid ({error})")
        failures += 1
    state = read_state(p)
    previous = state.get("previous_codex_notify") if state else None
    say(f"downstream provider: {'preserved' if previous else 'none'}")
    if p["dispatcher"].is_file() and not test(argparse.Namespace()):
        say("recent log / timeout boundary: synthetic dispatch completed")
    else:
        failures += 1
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    command = sub.add_parser("install"); command.add_argument("--yes", action="store_true"); command.set_defaults(func=install)
    for name, func in (("status", status), ("test", test), ("uninstall", uninstall), ("doctor", doctor)):
        sub.add_parser(name).set_defaults(func=func)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
