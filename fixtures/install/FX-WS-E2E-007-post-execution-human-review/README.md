# FX-WS-E2E-007

Validates the installed post-execution boundary: a transformed explicit Task
payload produces no second Work-start Suggestion, no Engine execution, and no
new Artifact only when Repository, Runtime, Session, and normalized Task all
match a marker written by the Engine. Missing Engine or Hook Session IDs fail
open, including concurrent identical Tasks from separate Sessions. The fixture
also covers runtime/task/repository isolation, malformed and expired state,
new explicit invocation, and repository-state symlink rejection.

The fixture verifies CLI/Hook effects and the Skill's output contract. It does
not claim to prove provider UI behavior: Artifact auto-read, automatic Next
Step selection, original-task analysis, response termination, and selected
continuation behavior remain Mac manual release-gate checks.
