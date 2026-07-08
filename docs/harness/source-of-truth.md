# Development Harness Source of Truth

This document defines the public-safe source-of-truth boundary for the
development harness work in this repository.

It is an operational summary, not a copy of private planning documents.
Implementation status must be judged from repository files, not from roadmap
or planning notes.

## Source-of-Truth Order

Use this order when implementation plans, local notes, and repository files
disagree:

1. Actual repository state
2. Public-safe harness documents under `docs/harness/`
3. Source instruction files under `instructions/`
4. Skill source files under `skills/*/SKILL.md`
5. Local/private planning documents

Planning documents can guide decisions, but they do not prove that a feature
exists in the repository.

## Public vs Private Boundary

The repository can contain public-safe operational summaries:

- Actual repository file maps
- Current implementation status
- Known gaps and unresolved issues
- Implementation sequence and gates
- Source/generated artifact boundaries

The repository should not contain raw internal planning documents:

- Detailed roadmap drafts
- Business strategy or commercialization notes
- Internal contract drafts copied verbatim
- MVP planning notes copied in full
- Private product decisions

Local/private planning sources such as `dev-harness-latest-docs/` remain local
planning material unless a public-safe summary is intentionally written.

## Generated Instruction Chain

The generated instruction chain exists and is source-controlled through source
files, not by directly editing generated outputs.

Source files:

- `instructions/harness.md`
- `instructions/mine.md`
- `instructions/adapters/claude.md`
- `instructions/adapters/codex.md`
- `skills/*/SKILL.md` metadata
- `scripts/render-instructions.sh`
- `scripts/render-skill-index.mjs`

Generated outputs:

- `CLAUDE.md`
- `claude/CLAUDE.md`
- `AGENTS.md`
- `MINE.md`
- `skills/skill-index.json`

Generated outputs must not be edited directly. Change source files and render
them through the existing instruction pipeline.

## Planning Is Not Implementation

Any document that describes a future contract, fixture, verifier, guard, or
workflow is a plan until matching repository files exist.

Current implementation claims must cite actual files such as scripts, skills,
hooks, setup files, generated instruction outputs, or tests. If no matching
file exists, the feature is not implemented.

## Step 1 Baseline

This Step 1 alignment work creates a public baseline only. It does not change
runtime behavior, hook behavior, skill routing, generated outputs, or install
logic.
