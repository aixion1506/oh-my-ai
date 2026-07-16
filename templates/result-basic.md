# Result Basic Template

Use this provider-neutral Markdown template when a Worker returns work results manually.

Result Basic is a manual Markdown Artifact and an Evidence Candidate. It is not canonical truth, automatic completion proof, automatic approval, Apply permission, Merge permission, or Context Promotion permission.

Do not use this template as Managed Result Return, a Result Channel, automatic result storage, automatic result detection, Task/Result Correlation, Completion Detection, Review Queue, Context Import, or Runtime Invocation.

If a field has no content, write `None`. Do not omit required fields.

## Contract Metadata

- `schema_version`: `1.0`
- `artifact_version`: `1`
- `result_ref`: `<result-YYYYMMDD-HHMMSS-short-slug>`
- `source_handoff_ref`: `<handoff_ref from the Structured Handoff Candidate>`
- `execution_status`: `<complete | partial | failed | blocked>`
- `receipt_status`: `received`
- `contract_validation_status`: `not_applicable`
- `parse_status`: `not_applicable`
- `artifact_write_status`: `not_applicable`
- `sensitive_data_status`: `<none_detected | redacted | contains_sensitive_data | unknown>`
- `created_at`: `<YYYY-MM-DDTHH:MM:SSZ>`
- `created_by`: `<worker runtime or person>`
- `review_state`: `not_reviewed`

## Title

`<short result title>`

## Summary

- `<brief outcome summary>`

## Work Performed

- `<what was actually done>`

## Findings

- `<confirmed finding with evidence reference>`
- `<write None if there are no findings>`

## Evidence

- `File`: `<path or None>`
- `Command`: `<command or None>`
- `Validation Result`: `<validation result or None>`
- `Output Fragment`: `<short excerpt or None>`

## Files Read

- `<path>`
- `None`

## Files Changed

- `<path>`
- `None`

## Commands Executed

- `<command>`
- `None`

## Side Effects

- `<side effect>`
- `None`

## Validation Performed

- `<validation that was actually performed>`
- `None`

## Validation Not Performed

- `<validation that was requested or expected but not performed, with reason>`
- `None`

## Validation Results

- `<validation name>`: `<pass | fail | blocked | not_run>` - `<evidence or reason>`
- `None`

## Completion Criteria Results

- `<criterion>`: `<met | unmet | partial | blocked>` - `<evidence or reason>`
- `None`

## Assumptions

- `<assumption that was not confirmed as fact>`
- `None`

## Open Issues

- `<open issue or question>`
- `None`

## Scope Deviations

- `<work or finding outside the handoff scope, with reason>`
- `None`

## Remaining Risks

- `<risk that remains after this work>`
- `None`

## Blocked Reasons

- `<reason the work is blocked>`
- `None`

## Recommended Next Action

- `<recommended next step for the human reviewer>`

## Runtime Context

- `runtime`: `<Codex | Claude | other | unknown>`
- `repository`: `<local path or repo name>`
- `branch`: `<branch or unknown>`
- `commit`: `<commit or unknown>`

## Truthfulness Checklist

- [ ] I did not record commands that were not executed.
- [ ] I did not mark validation as passed unless it was actually performed and passed.
- [ ] I listed unperformed validation under `Validation Not Performed`.
- [ ] I did not list files as read unless they were actually read.
- [ ] I did not list files as changed unless they were actually changed.
- [ ] I listed scope deviations under `Scope Deviations`.
- [ ] I separated assumptions from confirmed findings.
- [ ] I did not hide remaining risks or unresolved issues.

## Human Review Boundary

- Result Basic remains `not_reviewed` until a human reviewer accepts, edits, rejects, or requests changes.
- `execution_status: complete` does not mean Human-approved.
- Human acceptance does not automatically apply repository changes, merge changes, promote context, or create managed task/result state.
