# Development Harness Implementation Sequence

This sequence defines planned implementation steps after the Step 1 repo
alignment baseline. Step numbers are planned work units, not GitHub PR
numbers.

No step should treat planning documents as implementation evidence. Each step
must verify actual repository files before claiming completion.

## Step 2: Skill Metadata Schema and Skill Index Alignment

Purpose:

- Align the actual skill metadata/index shape with the public source-of-truth
  baseline.

Includes:

- Decide whether to extend the existing `metadata.routing` schema or introduce
  a compatibility layer.
- Define how `category`, `scope`, forbidden outputs, and confirmation
  requirements map onto the current index.
- Decide how `work-start` and `release-note` enter routing.

Does not include:

- Hook behavior changes.
- Work-start artifact behavior changes.
- Fixture runner implementation.

Prerequisites:

- Step 1 documents exist and identify the current schema gap.

Completion criteria:

- The expected skill index schema is documented and implemented.
- Existing indexed skills still render deterministically.
- Non-indexed core skills have an explicit inclusion or exclusion decision.

Gate to next step:

- `skills/skill-index.json` can be regenerated from source metadata without
  drift or unsupported fields.

## Step 3: Routing Fixture Regression

Purpose:

- Add regression coverage before changing routing behavior.

Includes:

- Fixture definitions for read-only, no-file, work-start, handoff,
  release-note, PR distinction, ambiguous request, and safety cases.
- A local runner that reports pass/fail.

Does not include:

- Changing prompt routing hook behavior.
- Adding new runtime side effects.

Prerequisites:

- Step 2 schema/index expectations are stable.

Completion criteria:

- Fixture runner exists.
- Critical safety fixtures fail when expected fields are missing.
- Existing behavior is captured honestly, including known failures.

Gate to next step:

- Fixture runner can be executed locally and produces deterministic output.

## Step 4: Hook Contract Verifier and Output Safety Minimum

Purpose:

- Verify hook input/output contracts and block obvious unsafe output shapes.

Includes:

- Missing index case.
- Broken index case.
- No-match case.
- Valid output case.
- Minimal checks for `forbidden_actions`, `next_safe_step`, and explicit user
  constraints.

Does not include:

- Full hook rewrite.
- Work-start script changes.
- Release-note or handoff behavior changes.

Prerequisites:

- Step 3 fixtures exist.

Completion criteria:

- Hook contract verifier exists.
- Output safety checks cover read-only and no-file constraints.
- Fixture results identify any remaining expected failures.

Gate to next step:

- Hook/output safety minimum can run without modifying repository source files
  or generated outputs.

## Step 5: Generated Artifact and Source File Safety

Purpose:

- Prevent generated artifacts from being confused with source files.

Includes:

- Define allowed artifact locations.
- Enforce read-only and no-file behavior.
- Add guardrails around source file writes and generated output writes.

Does not include:

- Prompt routing feature expansion.
- Work-start feature expansion.
- Release-note content changes.

Prerequisites:

- Step 4 verifier identifies unsafe output and action boundaries.

Completion criteria:

- Artifact/source boundary is enforced by tests or verifiers.
- Read-only requests do not suggest or perform writes.
- No-file requests stay in response text only.

Gate to next step:

- Artifact safety checks pass for the critical fixture set.

## Step 6: Prompt Routing Hook and Work-Start Routing Stabilization

Purpose:

- Stabilize runtime routing behavior after schema, fixtures, and safety gates
  exist.

Includes:

- Remove or explicitly gate prompt routing hook file-write side effects.
- Produce structured routing output.
- Ensure work-start routing respects read-only and no-file constraints.
- Separate candidate suggestion from artifact generation.

Does not include:

- Release-note workflow rewrite.
- Handoff workflow rewrite.
- Doctor/install overhaul.

Prerequisites:

- Step 5 artifact/source safety gate passes.

Completion criteria:

- Prompt routing hook no longer writes files unless explicitly allowed by a
  documented gate.
- Work-start candidate routing can run without artifact generation.
- Artifact generation requires an explicit path through the safety boundary.

Gate to next step:

- Critical routing and work-start fixtures pass.

## Step 7: Release-Note and Handoff Skill Alignment

Purpose:

- Align release-note and handoff behavior with the same routing, artifact, and
  confirmation boundaries.

Includes:

- Decide index inclusion for `release-note`.
- Confirm handoff scope and artifact behavior.
- Ensure release-note and handoff outputs do not imply PR creation, deployment,
  or implementation completion.

Does not include:

- Jira/Confluence connector expansion.
- PR creation automation.
- Cloud sync or team workspace features.

Prerequisites:

- Step 6 routing and artifact boundaries are stable.

Completion criteria:

- Release-note and handoff routing behavior is explicit.
- Artifact save behavior is gated.
- Safety fixtures for release-note and handoff pass.

Gate to next step:

- Release-note and handoff can be routed without source file writes or
  unconfirmed external actions.

## Step 8: Doctor and Install Verification

Purpose:

- Make local installation and harness health checks reflect the aligned
  contracts.

Includes:

- Verify generated instruction drift.
- Verify skill index drift.
- Verify hook installation state.
- Verify fixture/verifier availability.
- Keep automatic repair out of doctor mode.

Does not include:

- Destructive cleanup.
- Automatic profile promotion.
- Cloud checks.

Prerequisites:

- Step 7 completes core workflow alignment.

Completion criteria:

- `make doctor` or equivalent diagnostics report harness health without
  modifying files.
- Install flow remains non-destructive.
- Drift and missing verifier states are visible to the user.

Gate to completion:

- A clean local install can verify instruction rendering, skill index, hooks,
  and safety fixture availability.
