#!/usr/bin/env bash
set -euo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO"

SKILL="skills/jira-ticket/SKILL.md"
CONTRACT="skills/jira-ticket/templates/ticket-contract.md"
BACKLOG="skills/jira-ticket/templates/backlog-preview.md"
FIXTURE="fixtures/jira-ticket/pure-contract-fixtures.json"

fail() {
  echo "jira-ticket fixture failure: $*" >&2
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

require_file "$SKILL"
require_file "$CONTRACT"
require_file "$BACKLOG"
require_file "$FIXTURE"

for field in \
  "Summary" "Context" "Goal" "Source of Truth" "In Scope" "Out of Scope" \
  "Acceptance Criteria" "Repository" "Base Branch" "Expected Branch Name" \
  "Dependencies" "Verification" "Do Not Touch" "Definition of Done"; do
  require_text "$CONTRACT" "## $field"
  require_text "$BACKLOG" "### $field"
done

for sentinel in "Decision Required" "Repository Required" "Base Branch Required" "Not Verifiable"; do
  require_text "$SKILL" "$sentinel"
  require_text "$CONTRACT" "$sentinel"
done

for source in \
  "Accepted Decision" \
  "Canonical Repository Product and Architecture Documents" \
  "Confluence Specification" \
  "Explicit User Request" \
  "Handoff Candidate" \
  "Current Conversation"; do
  require_text "$SKILL" "$source"
  require_text "$BACKLOG" "$source"
done

for text in \
  "Contract Validation Failure" \
  "External Write Status:" \
  "Unavailable in this implementation phase" \
  "이 구성으로 Jira에 생성할까요?" \
  "Jira, Atlassian Connector, Confluence Connector" \
  "branch, code, commit, push, PR" \
  "credential, secret, Cloud ID, account ID" \
  "<ISSUE-KEY>"; do
  require_text "$SKILL" "$text"
done

for heading in \
  "## Source Status" \
  "## Mode" \
  "## Epic Candidate" \
  "## Child Ticket Index Summary" \
  "## Complete Child Ticket Contracts" \
  "## External Write Status" \
  "## Approval Boundary"; do
  require_text "$BACKLOG" "$heading"
done

require_text "$BACKLOG" "does not replace a"
require_text "$BACKLOG" "complete Child Ticket Contract"
require_text "$BACKLOG" "Contracts must be Valid"
require_text "$BACKLOG" "do not show the Jira creation approval"

external_line="$(rg -n -m 1 '^## External Write Status$' "$BACKLOG" | cut -d: -f1)"
approval_line="$(rg -n -m 1 '^## Approval Boundary$' "$BACKLOG" | cut -d: -f1)"
[ -n "$external_line" ] || fail "missing External Write Status heading"
[ -n "$approval_line" ] || fail "missing Approval Boundary heading"
[ "$external_line" -lt "$approval_line" ] \
  || fail "External Write Status must appear before Approval Boundary"

skill_external_line="$(rg -n -m 1 -F 'External Write Status:' "$SKILL" | cut -d: -f1)"
skill_approval_line="$(rg -n -m 1 -F '이 구성으로 Jira에 생성할까요?' "$SKILL" | cut -d: -f1)"
[ -n "$skill_external_line" ] || fail "missing Skill External Write Status workflow"
[ -n "$skill_approval_line" ] || fail "missing Skill approval question workflow"
[ "$skill_external_line" -lt "$skill_approval_line" ] \
  || fail "Skill must show External Write Status before the approval question"

require_text "$SKILL" '[ -x "$HOME/.local/bin/harness-event" ]'
require_text "$SKILL" "|| true"
require_text "$SKILL" "Binary가 없거나 실행이 실패해도 Preview를 계속한다"

node - "$FIXTURE" <<'NODE'
const fs = require("fs");
const fixture = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const required = [
  "single-technical-task",
  "user-feature",
  "existing-defect",
  "pre-implementation-research",
  "structural-improvement",
  "multi-repository-specification",
  "before-approval",
  "connector-unavailable",
  "ambiguous-intent",
  "canonical-source-conflict",
  "repository-required",
  "blank-or-whitespace-field",
  "scope-conflict",
  "secret-bearing-input",
  "before-jira-key",
];
if (fixture.contract !== "jira-ticket-pure-contract-preview-v1") process.exit(1);
if (fixture.network || fixture.external_write || fixture.artifact_write) process.exit(1);
const ids = new Set(fixture.scenarios.map((scenario) => scenario.id));
if (required.some((id) => !ids.has(id))) process.exit(1);
if (fixture.scenarios.some((scenario) => /token|credential|cloud id|account id/i.test(JSON.stringify(scenario)))) process.exit(1);
NODE

echo "jira-ticket pure contract fixtures passed"
