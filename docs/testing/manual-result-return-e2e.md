# Manual Result Return E2E

Status:

- Procedure Defined: yes
- Repository-local Steps Verified: yes, via an actual run recorded below
- Result Basic authored and validated: yes (`scripts/validate-result-basic.mjs`)
- Cross-process / cross-human-session Worker step: not performed
- Actual Full Manual E2E (separate physical Worker session): not performed

This document is a companion to [`lean-v1-work-start-manual-e2e.md`](lean-v1-work-start-manual-e2e.md), scoped specifically to the Result Return half of the flow: Direct Handoff selection through Human Review of a returned Result Basic.

```text
Explicit Work-start
→ Handoff Candidate
→ Human Review
→ Direct Handoff selected
→ Manual Worker transfer
→ Worker performs the reviewed task
→ Result Basic authored
→ Manual return to Main Session
→ Human Review
→ Confirmed / Unverified / Validation status checked
```

## Scope

This run verifies the manual Result Return contract inside a single continuous session, with the Human Review and Worker roles performed sequentially by the same reviewer for the purpose of recording real, reproducible Evidence. It does not prove a genuinely separate physical Worker session (a different process, machine, or person) — that gap remains open and is called out explicitly in Step 10 below.

Boundaries preserved throughout:

- No Worker Session was automatically created.
- No Result was automatically collected.
- No Result was automatically approved.
- The Result stayed a self-report Evidence Candidate until an explicit Human Review acceptance decision was recorded.

## Prerequisites

- `make work-start` available.
- `templates/result-basic.md` exists.
- `scripts/validate-result-basic.mjs` exists (added in this PR).

## Real Run — 2026-07-21

| Step | Command / Action | Actual Output / Evidence |
| ---: | --- | --- |
| 1 | Prepare a safe, read-only Fixture Task | `TASK="Verify all fixture manifest JSON files under fixtures/notice/manifests parse as valid JSON and report which ones succeed"` — read-only, no repository mutation, unambiguous validation criteria |
| 2 | `TASK="..." make work-start` | `work-start artifact created: .oh-my-ai/work-start/20260721T001635Z-verify-all-fixture-manifest-json-files-under-fix` |
| 3 | Inspect artifact directory | `context-manifest.yaml`, `handoff-candidate.md`, `starter-prompt.md`, `sources.md`, `context-gap-report.md` all present |
| 4 | Inspect `handoff-candidate.md` Human Review section | `Direct Handoff`, `Plan First`, `Gather Context` all present, all unchecked, `Candidate state before selection: Needs human review.` |
| 5 | Human Review selects Direct Handoff | Edited `handoff-candidate.md`: `- [x] Direct Handoff`, `Selected by: Human Reviewer (E2E fixture run)`, `Reason: Task is read-only, scope and validation are unambiguous.` |
| 6 | Manual transfer to Worker | Reviewed Candidate content used as the Worker's task input (no automatic invocation) |
| 7 | Worker performs the reviewed task | `for f in fixtures/notice/manifests/*.json; do node -e "JSON.parse(...)" "$f" && echo VALID \|\| echo INVALID; done` → 5x `VALID`, 1x `INVALID` (`invalid.json`, an intentional negative fixture) |
| 8 | Worker authors Result Basic | `.oh-my-ai/work-start/20260721T001635Z-.../result-basic.md`, following `templates/result-basic.md` headings exactly |
| 9 | Structural validation | `node scripts/validate-result-basic.mjs .oh-my-ai/work-start/20260721T001635Z-.../result-basic.md` → `valid: ...` |
| 10 | Manual return to Main Session | Same session read the file back; a genuinely separate process/session was not used for this run — this is the one procedural gap this E2E does not close |
| 11 | Human Review of the returned Result | Confirmed `Validation Performed` (JSON.parse per file) vs `Validation Not Performed` (schema-level check, explicitly out of scope) are correctly separated; confirmed `Scope Deviations: None` is accurate (no out-of-scope edits were made); confirmed `Remaining Risks: None` is accurate for a read-only check |
| 12 | Human Review decision | `review_state` changed from `not_reviewed` to `accepted` in the Result Basic file |

## Confirmed / Unverified / Validation Status Check

This is the step the task spec calls out explicitly (§5): confirm the returned Result correctly separates what was actually verified from what was not.

| Category | What the Result claims | Checked against |
|---|---|---|
| Confirmed (Findings) | 5 of 6 manifest fixture files parse as valid JSON; 1 does not | Re-ran `node -e "JSON.parse(...)"` independently during Human Review; output matched the Result exactly |
| Unverified (Validation Not Performed) | Schema-level validation (schema_version, notice field shapes) was not performed | Correct — the reviewed Handoff scoped this task to JSON syntax only; schema validation is separately covered by `scripts/test-notice-fixtures.sh` |
| Validation Performed vs claimed complete | `execution_status: complete` requires at least one real Validation Performed entry (enforced by `validate-result-basic.mjs`) | The file has 6 concrete per-file validation results, not a vague summary |
| No hidden failure | `invalid.json` failing to parse was reported as a Finding, not omitted or silently excluded from the file list | Confirmed present in Findings and Validation Results |

No Confirmed Fact in this Result was asserted without a Command or File evidence reference attached.

## What This Run Does Not Prove

- **Cross-process Worker isolation.** A real Worker Session (different Claude Code/Codex process, or a different person) copy/pasting the Candidate and returning a Result independently has not been performed in this repository. The Handoff Candidate → Result Basic contract shape has been exercised faithfully, but the "Manual Copy/Paste across a session boundary" step is procedurally identical whether or not the two sides are the same continuous session — this run cannot distinguish "the format survives copy/paste" from "the format survives an actually different session," and does not claim to.
- **A Worker with actual disagreement or partial failure.** This fixture task succeeded cleanly; `docs/testing/manual-result-return-e2e.md` does not itself exercise a Worker returning a `partial`, `failed`, or `blocked` Result under Human Review — those states are covered structurally by `fixtures/result/FX-RS-good-*.md` and `scripts/test-result-fixtures.sh`, but not by a live end-to-end run in this document.

## Related

- [`lean-v1-work-start-manual-e2e.md`](lean-v1-work-start-manual-e2e.md) — Work-start through Handoff Candidate half of the same flow
- `templates/result-basic.md` — the template followed by Step 8
- `scripts/validate-result-basic.mjs` — the validator used in Step 9
- `fixtures/result/` — static positive/negative fixtures for the 7 Result Basic Completion Criteria categories
