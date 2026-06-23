# Codex adapter

This file is generated from the shared oh-my-ai instruction source.

- Source of truth: `instructions/harness.md`
- Regenerate with: `make instructions`
- Do not edit `AGENTS.md` directly. Edit `instructions/harness.md` or this adapter, then regenerate.

## Codex-specific interpretation

- Treat Claude-specific paths and command names as oh-my-ai harness concepts unless a Codex-native equivalent exists.
- `claude/CLAUDE.md` maps to this generated `AGENTS.md` for Codex instruction discovery.
- Claude slash commands are workflow names. In Codex, follow the same intent using available tools and local files.
- Claude hooks/settings remain Claude-specific unless a Codex project config or hook is explicitly added.
