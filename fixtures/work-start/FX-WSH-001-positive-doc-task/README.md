# FX-WSH-001 Positive Documentation Task

This fixture verifies that a clear documentation-only task can produce a Work-start artifact set and a Structured Handoff Candidate without invoking a Worker runtime.

It expects:

- Work-start execution succeeds.
- Existing artifacts remain present.
- `handoff-candidate.md` contains the Lean V1 handoff fields.
- Skill candidates and Project Context references are present as candidates.
- The Return Contract references `templates/result-basic.md`.
