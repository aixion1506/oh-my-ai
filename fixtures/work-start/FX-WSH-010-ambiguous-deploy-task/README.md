# FX-WSH-010 Ambiguous Deploy Task

This fixture verifies that an incomplete or over-broad task still produces a conservative Structured Handoff Candidate.

It expects:

- Work-start execution succeeds.
- Unknown scope and validation details stay marked for Human Review.
- The Candidate does not create commit, push, merge, deployment, or runtime execution permission.
- The Candidate keeps the Result Basic return contract.
