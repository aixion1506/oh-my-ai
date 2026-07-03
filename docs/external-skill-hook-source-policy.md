# External Skill / Hook Source Policy

## Purpose

Define how oh-my-ai treats external skill and hook bundles before importing them into the harness.

The v1 MVP is policy-only. It does not implement an external source registry, vendor publish automation,
multi-source skill index generation, hook conflict checking, or vendor update commands.

## Background

Superpowers exposed a boundary problem: copying an external bundle directly into `skills/` makes vendor
skills look the same as core oh-my-ai skills. The same problem will repeat when local-only skills,
project-specific skills, or other vendor bundles appear.

The harness needs a clear boundary between:

- source material kept for reference or later publishing
- runtime shared skills exposed to agents
- hook behavior explicitly owned by oh-my-ai

## Source Layers

### core

`core` is the set of skills, hooks, scripts, and instructions directly owned by oh-my-ai.

Core skills are the current runtime shared skills in v1. They live under `skills/` and are installed
through the existing shared install flow.

Core hooks are the hook behavior intentionally owned by this repo, such as `codex/hooks.json`,
`claude/settings.json`, and scripts they call.

### local

`local` is user-machine or account-specific material.

Examples:

- private skills tied to a personal workflow
- account-specific hook settings
- local scripts under `profiles/local/`
- uncommitted runtime configuration under a user's home directory

Local material must not be promoted into core by accident. Local material must not be committed into the
public core repo unless intentionally generalized.

### project

`project` is material owned by a specific target repository or work domain.

Examples:

- a project `AGENTS.md`
- project-only skills
- repo-specific hook behavior
- `docs/context/` files describing a project or branch

Project material should stay with the project unless it is intentionally generalized into core. Project
material must not be committed into the public core repo unless intentionally generalized.

### vendor

`vendor` is external source material, such as Superpowers or another skill/hook bundle.

Vendor material is not core. It may be kept as source/reference material, and individual skills may later
be published into runtime shared skills through an explicit process. v1 does not implement that process.

## v1 MVP Principles

### Policy only

v1 documents boundaries and decisions only. It does not create:

- an external source registry
- vendor publish automation
- a multi-source `skill-index.json` generator
- a hook conflict checker
- a vendor update command

### Runtime shared skills are core-only

In v1, committed `skills/` entries are treated as oh-my-ai-owned runtime shared skills.

Vendor source must not be copied directly into `skills/` as if it were core. If a vendor skill is later
promoted, the promotion must be explicit and must record source, version, and license.

### Vendor source and runtime output are separate

Vendor source material and runtime shared skills are different concerns.

Vendor source answers:

- where did this bundle come from?
- what version was reviewed?
- what license applies?
- what hooks, docs, tests, assets, and plugin manifests came with it?

Runtime shared skills answer:

- what skills are actually exposed to agents?
- what names do they use?
- who owns their maintenance?
- what metadata drives discovery and routing?

### External hooks are disabled by default

External hooks are not enabled automatically.

Hooks can mutate session context, inject instructions, run commands, and overlap with existing oh-my-ai
hook behavior. Because of that, vendor hooks must be treated as disabled source material until reviewed.

### Hooks are never auto-merged

External hook files must not be merged automatically into:

- `codex/hooks.json`
- `claude/settings.json`
- `scripts/prompt-routing-hook.mjs`
- any future oh-my-ai hook dispatcher

If an external hook is useful, analyze the behavior and manually absorb the intent into oh-my-ai's own
hook structure. The imported behavior must have one clear owner.

### Skill name conflicts fail closed

If a vendor, local, or project skill wants to use a name that already exists in core, the import or publish
must fail. It must not overwrite the existing skill.

Resolution options are explicit:

- choose a different published name
- intentionally replace the core skill in a dedicated change
- keep the vendor skill as reference-only

### Source, version, and license are required

Any external source considered for promotion must record:

- source identifier
- upstream version or commit
- license
- reviewed date
- imported or promoted scope
- rationale for anything intentionally excluded

## Superpowers Example

Superpowers is a vendor source candidate, not a core source.

For Superpowers:

- its bundled skills may contain publish candidates.
- hooks are disabled by default.
- docs, tests, assets, and plugin manifests are reference material.
- nothing from the bundle is copied into runtime shared skills without an explicit promotion decision.

Superpowers hooks overlap with oh-my-ai prompt-routing and session hook behavior. They may inject session
instructions or enforce skill usage at the same lifecycle points already handled by oh-my-ai. Therefore,
they must not be enabled or merged automatically.

If a Superpowers skill is later promoted, its source, version, and license must be recorded. If a
Superpowers hook behavior is later useful, copy the behavior concept into oh-my-ai's hook flow rather than
installing the vendor hook as-is.

## Version Roadmap

### v1

Policy only.

- define source layers
- define disabled-by-default hook posture
- define no-auto-merge rule
- define no-overwrite conflict posture
- define source/version/license recording requirement
- use Superpowers only as an example

### v1.5

Manual source tracking.

Possible scope:

- draft `external-sources/*.yaml` manifest format
- allow vendor source storage under a documented location
- define manual publish steps
- add smoke checks for source/version/license and publish candidates

v1.5 still does not require automatic hook merging or multi-source skill index generation.

### v2

Automated registry and validation.

Possible scope:

- source registry implementation
- multi-source skill index generation
- hook conflict checker
- vendor update command
- publish and unpublish commands
- source priority validation

## Non-goals

This v1 policy does not:

- import Superpowers
- apply any Superpowers stash
- create `vendors/`
- create `external-sources/`
- modify `skills/`
- modify hook settings
- modify setup or install behavior
- change `skill-index.json` generation
- define a full manifest schema
