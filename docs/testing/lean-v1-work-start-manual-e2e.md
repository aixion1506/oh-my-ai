# Lean V1 Work-start Manual E2E

Status:

- Procedure Defined: yes
- Repository-local Steps Verified: via `make test-work-start-fixtures`
- Cross-session Worker Step: not performed
- Actual Full Manual E2E: not performed
- Claude Code Runtime Procedure Defined: yes
- Claude Code Full Manual E2E: not performed

This document defines the manual end-to-end procedure for the Lean V1 Local Manual Artifact Workflow.

The workflow is:

```text
Task input
→ Work-start
→ Skill Candidate
→ Project Context reference
→ Structured Handoff Candidate
→ Human Review: choose Direct Handoff / Plan First / Gather Context
→ Manual supplement if needed
→ Handoff Candidate review
→ Manual Copy/Paste
→ Worker execution
→ Result Basic manual return
→ Human Review
```

## Scope

This procedure verifies the manual artifact contract. It does not invoke a Worker automatically, create a Managed Task, link sessions, collect results automatically, apply repository changes, commit, push, or merge.

## Prerequisites

- Repository working tree is clean or any existing changes are intentionally out of scope.
- `make work-start` is available.
- `templates/result-basic.md` exists.
- A separate Worker Session is available for the cross-session step.

## Procedure

| Step | Command | Expected Result | Human Check | Failure Criteria | Evidence |
| ---: | --- | --- | --- | --- | --- |
| 1 | Prepare a task text | A clear task exists | Goal, scope, do-not-touch, and validation are explicit enough for review | Task asks for unreviewed deploy, commit, push, merge, or broad changes without boundaries | Task text |
| 2 | `make work-start TASK="<task>"` | `.oh-my-ai/work-start/<timestamp>-<slug>/` is created | Work-start did not edit tracked files | Command fails or writes outside ignored artifact path | Command output |
| 3 | `ls .oh-my-ai/work-start/<artifact>/` | `sources.md`, `context-gap-report.md`, `context-manifest.yaml`, `starter-prompt.md`, `handoff-candidate.md` exist | Artifact set is complete | Required artifact missing | Directory listing |
| 4 | Inspect `starter-prompt.md` | Skill Candidate section exists | Candidate is treated as a suggestion, not execution | Skill is described as auto-executed | File excerpt |
| 5 | Inspect `handoff-candidate.md` Project Context References | Project Context references or `Needs human review` are present | References are candidates, not confirmed facts | Context is auto-imported or promoted | File excerpt |
| 6 | Inspect `handoff-candidate.md` fields | `handoff_ref`, Goal, Scope, Allowed Actions, Prohibited Actions, Do Not Touch, Validation Required, Expected Output, Completion Criteria, Project Context References, Return Contract exist | Missing information remains marked for Human Review | Required field missing or unknown information is asserted as fact | Field checklist |
| 7 | Inspect `Human Review: Choose the Next Step` | Direct Handoff, Plan First, and Gather Context are all visible and unchecked | User is the selector; no default or system-selected next step exists | A next step is preselected or recommended by the system | Next Step excerpt |
| 8 | Choose one manual path | Reviewer chooses Direct Handoff, Plan First, or Gather Context | Choice is recorded manually with Selected by, Reason, and Unresolved context if useful | Choice triggers automatic planning, connector calls, runtime invocation, or approval | Review note |
| 9 | Human Review edits the Candidate if needed | Candidate remains a reviewed Candidate | Reviewer confirms scope, allowed actions, prohibited actions, validation, and completion criteria | Candidate implies approval before review | Reviewed candidate |
| 10 | Manually copy/paste the Candidate to a Worker Session | Worker receives the reviewed Markdown | No automatic Runtime Invocation or Session Linking is used | Worker is auto-created or auto-invoked | Manual checkpoint note |
| 11 | Worker performs only the reviewed task | Work stays within scope | Worker does not invent extra permissions | Worker commits, pushes, merges, deploys, or changes out-of-scope files without approval | Worker notes |
| 12 | Worker returns using `templates/result-basic.md` | Result Basic headings are preserved | Files read/changed, commands, validation, assumptions, scope deviations, and risks are explicit | Result is not in Result Basic shape | Result Basic Markdown |
| 13 | Review `Validation Not Performed` | Unperformed validation is listed with reasons | No unperformed validation is marked passed | Missing validation is hidden | Result Basic section |
| 14 | Review `Scope Deviations` | Scope deviations are listed or `None` | Out-of-scope work is not hidden | Deviation exists but is omitted | Result Basic section |
| 15 | Review `Remaining Risks` | Remaining risks are listed or `None` | Risks are not hidden | Risk is known but omitted | Result Basic section |
| 16 | Human final review | Result is accepted, edited, rejected, or changes are requested | Result Basic remains evidence until human decision | Result is treated as automatic truth, apply permission, or merge permission | Review note |

## Human Review Next Step Paths

### Direct Handoff Path

Use when the reviewer decides Goal, Scope, allowed actions, prohibited actions, validation, and completion criteria are clear enough.

Steps:

1. Review the Handoff Candidate.
2. Confirm no next step is preselected by the system.
3. Record the reviewer and reason if useful.
4. Manually copy/paste the reviewed Candidate to the Worker Session.

Failure criteria:

- The system selects Direct Handoff automatically.
- The Candidate is treated as approved without Human Review.
- Runtime Invocation, Worker creation, Session Linking, commit, push, merge, or deploy happens automatically.

### Plan First Path

Use when the reviewer decides impact, order, or decomposition should be planned before Worker handoff.

Steps:

1. Create a manual plan or use a Planning Skill.
2. Review the plan.
3. Record a reviewed plan reference in the Handoff Candidate if useful.
4. Update the Candidate manually.
5. Re-run Human Review before copy/paste.

Failure criteria:

- Planning is executed automatically.
- A planning tool is required as the canonical path.
- A plan reference is treated as automatic approval.

### Gather Context Path

Use when the reviewer decides repository-local information is insufficient.

Steps:

1. Review possible external context candidates manually.
2. Check only the sources the user has access to and decides are relevant.
3. Record any reviewed external context manually.
4. Update Task, Project Context reference, or Handoff Candidate manually.
5. Re-run Work-start or re-review the Handoff Candidate as needed.

Failure criteria:

- External context candidates are presented as confirmed facts.
- A connector, external search, or import runs automatically.
- Gather Context is selected automatically.

## V1 Continuation Boundary Scenarios

These scenarios are manual checks. They do not create or run a Worker Session.

### Scenario A — Synthetic Event Suppression

1. Prepare a real User Turn for which Work-start was suggested or explicitly run.
2. Cause the provider to submit a `<task-notification>...</task-notification>` event, such as a background-agent completion notice.
3. Inspect the `UserPromptSubmit` hook result and `.oh-my-ai/work-start/` artifact count.

Expected:

- Work-start Suggestion is not shown again.
- Work-start Runtime is not run again.
- No new Artifact is created.

The repository fixture covers the confirmed `task-notification` marker. The current adapters expose no separate, verified background-completion or tool-result payload marker; do not treat an unverified marker as covered.

### Scenario B — Plan First Continuation

1. Run Work-start and choose Plan First in Human Review.
2. Perform Planning Skill or manual planning.
3. Review and integrate the plan in the Main Session.
4. Confirm with the user before reflecting the plan in the Candidate.

Expected:

- Candidate remains `Needs human review` after reflection.
- Main Session does not implement, commit, push, create a PR, or merge.
- The user is told no Worker Session has been created or run.
- Direct Handoff is presented as a separate explicit choice.
- The approved Candidate must be manually passed to a new Worker Session.

### Scenario C — Gather Context Continuation

1. Choose Gather Context in Human Review.
2. Collect, review, and integrate the required Context in the Main Session.
3. Ask whether to reflect the Context in the Candidate or re-review it.

Expected:

- No automatic Direct Handoff or Worker execution occurs.
- Main Session does not implement.
- Candidate remains `Needs human review` if updated.
- The next manual Direct Handoff and Worker Session transfer steps are explained, then the Main Session stops.

### Scenario D — Regression

Verify in both the Claude Code and Codex CLI adapters:

- Explicit Work-start entry remains normal.
- Natural Work-start Suggestion remains normal for a real User Prompt.
- Declined suppression remains normal for the same real request.
- Consent Boundary remains suggestion-only until explicit entry.

## Repository-local Verification

Run:

```bash
make test-work-start-fixtures
```

This verifies:

- Positive Work-start fixture
- Negative Work-start fixture
- Multi-scope Next Step fixture
- External Context Candidate fixture
- Required Structured Handoff fields
- Human Review boundary
- Direct Handoff / Plan First / Gather Context display
- No default or system-selected next step
- External Context candidates are manual review candidates, not facts
- Manual Copy/Paste wording
- `templates/result-basic.md` Return Contract
- Conservative handling of ambiguous scope and unsafe permissions
- `.oh-my-ai/` artifact ignore behavior
- Synthetic `task-notification` suppression without Artifact creation or suggestion-state mutation
- Plan First and Gather Context Main Session stop boundary in the Work-start Skill

## Cross-session Worker Step

The following steps are not performed by the fixture runner:

- Starting a separate Worker Session
- Pasting the reviewed Candidate into that Worker
- Having the Worker modify files
- Receiving an actual Worker-authored Result Basic
- Human review of a real Worker result

These remain:

```text
Not Performed
Not Verifiable in this session
Requires separate Worker Session
```

## Sample Result Basic Reference

Sample only. Not an actual Worker result.

Use `templates/result-basic.md` and preserve its required headings. In a dry-run or documentation-only manual test, write `None` for sections with no actual content and explicitly list unperformed checks under `Validation Not Performed`.

Do not record commands, file reads, file changes, validation, or scope deviations that did not happen.

## Claude Code Runtime Entry Manual E2E

Status:

- Procedure Defined: yes
- Repository-local Fixture: verified by `make test-work-start-fixtures`
- Claude Code Session: not performed in repository-local fixture
- Full Handoff to Result: not performed

This procedure verifies the P0 Claude Code Runtime Entry without changing the Lean V1 product boundary.

### Preconditions

- Fresh or clean shared install is available.
- `make install-shared` has linked shared skills and Claude settings without overwriting local files.
- Claude Code can discover user skills from `~/.claude/skills`.
- `skills/work-start/SKILL.md` contains `disable-model-invocation: true`.
- `~/.local/bin/oh-my-ai` resolves to this source Repository and `make doctor-strict` reports both Runtimes as configured.

### Installed Public Engine Boundary

Both explicit Skill entries run `"$HOME/.local/bin/oh-my-ai" work-start -- "<single task argument>"` from the Repository where the session started. The `--` separator and exactly one Task argv are required; the entry passes that argv unchanged. The entry resolves `scripts/work-start.sh` from its own installed realpath, but it does not change cwd: the Artifact must be created only at `<current repository>/.oh-my-ai/work-start/...`.

| Runtime | Explicit Skill token | Public Entry input | Required check |
| --- | --- | --- | --- |
| Claude Code | `/work-start <task>` | original `<task>` only | no Engine search under `~/.claude/skills` or the current Repository |
| Codex | `$work-start <task>` | leading `$work-start` removed; remaining task preserved | task-body occurrences of `work-start` remain unchanged |

### Explicit `/work-start` Path

| Step | Action | Expected Result | Failure Criteria | Evidence |
| ---: | --- | --- | --- | --- |
| 1 | Start a new Claude Code session in the repository | Session loads shared settings and skills | Claude starts in safe mode or without skills unintentionally | Session note |
| 2 | Open slash command or skills discovery and find `/work-start` | Work-start entry is discoverable | `/work-start` is missing | Screenshot or note |
| 3 | Enter `/work-start <task>` | Work-start is treated as explicit user entry | Product confirmation is requested again before engine entry | Prompt text |
| 4 | Allow any Runtime-level Shell permission if prompted | installed `"$HOME/.local/bin/oh-my-ai" work-start -- "<single task argument>"` runs through normal Runtime approval | Runtime permission is bypassed, the Skill searches for an Engine, cwd changes to oh-my-ai source, or the Task is split/reconstructed | Permission prompt note |
| 5 | Inspect output | Artifact path and generated files are displayed | Output omits artifact path | Output excerpt |
| 6 | Inspect artifact | `handoff-candidate.md`, `starter-prompt.md`, `context-manifest.yaml`, `sources.md`, `context-gap-report.md` exist | Required artifact missing | Directory listing |
| 7 | Inspect Human Review section | Direct Handoff, Plan First, Gather Context are visible and unchecked | Next Step is auto-selected | Handoff excerpt |

Verify the Artifact is under the Repository where Claude was started, not the oh-my-ai source Repository or `~/.claude/skills/work-start`. The Public Entry resolves the Engine through its own installed realpath while preserving the caller cwd. Re-run `make install-shared` after relocating the source Repository.

### Natural Intent Suggestion Path

| Step | Action | Expected Result | Failure Criteria | Evidence |
| ---: | --- | --- | --- | --- |
| 1 | Start a separate Claude Code session | No Work-start artifact is created at session start | Artifact created before user request | Directory count |
| 2 | Enter a strong Work-start intent, such as `구현 전에 관련 코드와 결정 문서, 영향 범위를 먼저 모아서 다른 세션에 넘길 수 있게 정리해줘.` | oh-my-ai suggests Work-start | No suggestion appears | Hook context or session note |
| 3 | Before accepting, inspect `.oh-my-ai/work-start/` | No new artifact exists | Artifact created during suggestion | Directory count |
| 4 | Choose to run via explicit fallback `/work-start <original task>` | Work-start Engine runs once | Engine runs before explicit follow-up | Output excerpt |
| 5 | Inspect output and artifact | Artifact path and Human Review Next Step are present | Missing artifact path or Next Step | Artifact excerpt |

Native approval UI is not assumed by this procedure. If Claude Code provides a native confirmation control in a future version, record accepted and declined paths separately.

### Skip / Decline Path

| Step | Action | Expected Result | Failure Criteria | Evidence |
| ---: | --- | --- | --- | --- |
| 1 | Start another Claude Code session | Baseline artifact count recorded | Existing artifacts are confused with new artifacts | Directory count |
| 2 | Enter the same strong Work-start intent | Suggestion appears once | Engine runs during suggestion | Hook context or session note |
| 3 | Skip by continuing the original request without `/work-start` | No Work-start Engine invocation | Artifact created after skip | Directory count |
| 4 | Repeat the same request text | Same request is not suggested again | Re-suggestion appears for identical request | Session note |

### Manual Handoff Completion

After an artifact exists, continue with the common Manual E2E procedure:

1. Review the Handoff Candidate.
2. Choose Direct Handoff, Plan First, or Gather Context manually.
3. Manually copy/paste the reviewed Candidate to a Worker Session.
4. Receive Result Basic using `templates/result-basic.md`.
5. Review `Validation Not Performed`, `Scope Deviations`, and `Remaining Risks`.

Do not mark Full Manual E2E as passed unless a separate Claude Code Worker Session actually performs the reviewed task and returns a Result Basic.
