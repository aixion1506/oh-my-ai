# Lean V1 Work-start Manual E2E

Status:

- Procedure Defined: yes
- Repository-local Steps Verified: via `make test-work-start-fixtures`
- Cross-session Worker Step: not performed
- Actual Full Manual E2E: not performed

This document defines the manual end-to-end procedure for the Lean V1 Local Manual Artifact Workflow.

The workflow is:

```text
Task input
→ Work-start
→ Skill Candidate
→ Project Context reference
→ Structured Handoff Candidate
→ Human Review
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
| 7 | Human Review edits the Candidate if needed | Candidate is ready to copy | Reviewer confirms scope, allowed actions, prohibited actions, validation, and completion criteria | Candidate implies approval before review | Reviewed candidate |
| 8 | Manually copy/paste the Candidate to a Worker Session | Worker receives the reviewed Markdown | No automatic Runtime Invocation or Session Linking is used | Worker is auto-created or auto-invoked | Manual checkpoint note |
| 9 | Worker performs only the reviewed task | Work stays within scope | Worker does not invent extra permissions | Worker commits, pushes, merges, deploys, or changes out-of-scope files without approval | Worker notes |
| 10 | Worker returns using `templates/result-basic.md` | Result Basic headings are preserved | Files read/changed, commands, validation, assumptions, scope deviations, and risks are explicit | Result is not in Result Basic shape | Result Basic Markdown |
| 11 | Review `Validation Not Performed` | Unperformed validation is listed with reasons | No unperformed validation is marked passed | Missing validation is hidden | Result Basic section |
| 12 | Review `Scope Deviations` | Scope deviations are listed or `None` | Out-of-scope work is not hidden | Deviation exists but is omitted | Result Basic section |
| 13 | Review `Remaining Risks` | Remaining risks are listed or `None` | Risks are not hidden | Risk is known but omitted | Result Basic section |
| 14 | Human final review | Result is accepted, edited, rejected, or changes are requested | Result Basic remains evidence until human decision | Result is treated as automatic truth, apply permission, or merge permission | Review note |

## Repository-local Verification

Run:

```bash
make test-work-start-fixtures
```

This verifies:

- Positive Work-start fixture
- Negative Work-start fixture
- Required Structured Handoff fields
- Human Review boundary
- Manual Copy/Paste wording
- `templates/result-basic.md` Return Contract
- Conservative handling of ambiguous scope and unsafe permissions
- `.oh-my-ai/` artifact ignore behavior

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
