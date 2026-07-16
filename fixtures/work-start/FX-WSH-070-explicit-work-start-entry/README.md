# FX-WSH-070 Explicit Work-start Entry

This fixture verifies the repository-local runtime contract for an explicit
Work-start entry.

It expects:

- The Work-start Engine creates exactly one artifact directory.
- The five required artifact files exist.
- The output reports the generated artifact path and required files.
- The output leaves the Candidate in `Needs human review`.
- The output displays Direct Handoff, Plan First, and Gather Context.
- The output does not continue into implementation or planning language.
