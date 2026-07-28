#!/usr/bin/env bash
set -euo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO"

SKILL="skills/jira-work/SKILL.md"
DESCRIPTOR="skills/jira-work/agents/openai.yaml"
REPORT="skills/jira-work/templates/ticket-gate-report.md"
EXISTING="skills/jira-work/templates/existing-work-status.md"
FIXTURE="fixtures/jira-work/pure-contract-fixtures.json"

fail() {
  echo "jira-work fixture failure: $*" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "missing file: $1"
}

require_text() {
  local file="$1"
  local text="$2"
  rg -q -F -- "$text" "$file" || fail "missing text '$text' in $file"
}

for file in "$SKILL" "$DESCRIPTOR" "$REPORT" "$EXISTING" "$FIXTURE"; do
  require_file "$file"
done

require_text "$DESCRIPTOR" "allow_implicit_invocation: false"
require_text "$SKILL" "explicit-only"
require_text "$SKILL" '$jira-work <ISSUE-KEY>'

for field in \
  "Summary" "Context" "Goal" "Source of Truth" "In Scope" "Out of Scope" \
  "Acceptance Criteria" "Repository" "Base Branch" "Expected Branch Name" \
  "Dependencies" "Verification" "Do Not Touch" "Definition of Done"; do
  require_text "$SKILL" "$field"
  require_text "$REPORT" "$field"
done

for sentinel in "Decision Required" "Repository Required" "Base Branch Required" "Not Verifiable"; do
  require_text "$SKILL" "$sentinel"
  require_text "$REPORT" "$sentinel"
done

for source in \
  "Accepted Decision" \
  "Canonical Repository Product and Architecture Documents" \
  "Confluence Specification" \
  "Jira Ticket" \
  "Handoff Candidate" \
  "Current Conversation"; do
  require_text "$SKILL" "$source"
  require_text "$REPORT" "$source"
done

for status in READY BLOCKED NOT_VERIFIABLE ALREADY_IN_PROGRESS ALREADY_MERGED CONFLICTED; do
  require_text "$SKILL" "$status"
  require_text "$REPORT" "$status"
done

for state in "A. New Branch and PR absent" "B. Normal Local and Remote Issue Branch" \
  "C. Local-only Branch" "D. Remote-only Branch" "E. Open Draft PR" \
  "F. Local and Remote Divergence" "G. Merge complete" \
  "H. Branch collision with another Issue Key or PR"; do
  require_text "$EXISTING" "$state"
done

for text in \
  "feat/<ISSUE-KEY>-<slug>" \
  "chore/<ISSUE-KEY>-<slug>" \
  "fix/<ISSUE-KEY>-<slug>" \
  "docs/<ISSUE-KEY>-<slug>" \
  "refactor/<ISSUE-KEY>-<slug>" \
  "research/<ISSUE-KEY>-<slug>" \
  "ASCII lowercase" \
  "Unknown Custom Issue Type" \
  "suggest-only" \
  "patch-with-approval" \
  "auto-apply" \
  "Mutation 0" \
  "Merge" \
  "Release"; do
  require_text "$SKILL" "$text"
done

require_text "$SKILL" '[ -x "$HOME/.local/bin/harness-event" ]'
require_text "$SKILL" "--skill jira-work"
require_text "$SKILL" "|| true"
require_text "$SKILL" "Issue Key, Summary, Ticket content를 Telemetry에 기록하지 않는다"

for capability in \
  "Jira Ticket Connector Read" "Git Preflight" "Branch Creation" \
  "Implementation" "Verification Execution" "Commit and Push" "Draft PR" \
  "Jira Comment and Transition"; do
  require_text "$REPORT" "$capability"
done

require_text "$SKILL" "Jira Description"
require_text "$SKILL" "Raw Transcript"
require_text "$SKILL" "Credential"
require_text "$SKILL" "Cloud ID"
require_text "$SKILL" "Account ID"

node - "$FIXTURE" <<'NODE'
const fs = require("fs");
const fixture = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const required = [
  "valid-ticket-contract", "missing-repository", "missing-base-branch",
  "decision-required", "not-verifiable-source", "canonical-jira-conflict",
  "multiple-repositories", "blocking-dependency", "scope-conflict",
  "acceptance-verification-conflict", "existing-normal-branch",
  "local-only-branch", "remote-only-branch", "local-remote-divergence",
  "existing-draft-pr", "already-merged", "unknown-custom-issue-type",
  "ambiguous-intent", "suggest-only", "patch-with-approval",
  "auto-apply-without-runtime", "telemetry-binary-missing",
  "telemetry-execution-failure",
];
if (fixture.contract !== "jira-work-pure-contract-gate-v1") process.exit(1);
if (fixture.network || fixture.git_mutation || fixture.jira_write || fixture.artifact_write) process.exit(1);
const ids = new Set(fixture.scenarios.map((scenario) => scenario.id));
if (required.some((id) => !ids.has(id))) process.exit(1);
NODE

echo "jira-work pure contract fixtures passed"
