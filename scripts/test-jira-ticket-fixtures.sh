#!/usr/bin/env bash
set -euo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO"

SKILL="skills/jira-ticket/SKILL.md"
CONTRACT="skills/jira-ticket/templates/ticket-contract.md"
PREVIEW="skills/jira-ticket/templates/mcp-create-preview.md"
BACKLOG="skills/jira-ticket/templates/backlog-preview.md"
FIXTURE="fixtures/jira-ticket/pure-contract-fixtures.json"
WORKFLOW_FIXTURE="fixtures/jira-ticket/mcp-create-workflow-fixtures.json"

fail() { echo "jira-ticket fixture failure: $*" >&2; exit 1; }
require_file() { [ -f "$1" ] || fail "missing file: $1"; }
require_text() { rg -q -F -- "$2" "$1" || fail "missing text '$2' in $1"; }

for file in "$SKILL" "$CONTRACT" "$PREVIEW" "$BACKLOG" "$FIXTURE" "$WORKFLOW_FIXTURE"; do
  require_file "$file"
done

for field in \
  "Summary" "Context" "Goal" "Source of Truth" "In Scope" "Out of Scope" \
  "Acceptance Criteria" "Repository" "Base Branch" "Expected Branch Name" \
  "Dependencies" "Verification" "Do Not Touch" "Definition of Done"; do
  require_text "$CONTRACT" "## $field"
  require_text "$PREVIEW" "### $field"
  require_text "$BACKLOG" "### $field"
done

for sentinel in "Decision Required" "Repository Required" "Base Branch Required" "Not Verifiable"; do
  require_text "$SKILL" "$sentinel"
  require_text "$CONTRACT" "$sentinel"
done

for text in \
  "Jira MCP-backed Create Workflow" \
  "Codex·Claude Jira MCP/Plugin" \
  "jira.search" \
  "jira.create" \
  "Create Attempted: false" \
  "exactly once" \
  "Automatic Retry: false" \
  "Product:" \
  "Primary Repository:" \
  "Area:" \
  "Current HEAD:"; do
  require_text "$SKILL" "$text"
done

node - "$FIXTURE" "$WORKFLOW_FIXTURE" <<'NODE'
const fs = require("fs");
const preview = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const workflow = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const legacy = new Set([
  "single-technical-task", "user-feature", "existing-defect", "pre-implementation-research",
  "structural-improvement", "multi-repository-specification", "before-approval",
  "connector-unavailable", "ambiguous-intent", "canonical-source-conflict",
  "repository-required", "blank-or-whitespace-field", "scope-conflict",
  "secret-bearing-input", "before-jira-key",
]);
if (preview.contract !== "jira-ticket-contract-preview-v2" || preview.network || preview.external_write || preview.artifact_write) process.exit(1);
const previewIds = new Set(preview.scenarios.map((scenario) => scenario.id));
if (legacy.size !== previewIds.size || [...legacy].some((id) => !previewIds.has(id))) process.exit(1);
const required = [
  "mcp-unavailable", "search-only", "search-failed", "search-unclear", "exact-duplicate",
  "similar-duplicate", "no-result-before-approval", "non-explicit-positive-is-not-approval", "no-result-approval-rejected", "create-success",
  "actual-key-url-verification", "wrong-project-response", "keyless-success", "create-timeout",
  "response-loss-rerun-finds-duplicate", "single-create-call", "codex-adapter", "claude-adapter",
  "preview-write-evidence-separated", "description-header", "fourteen-field-contract-regression", "missing-create-metadata",
];
const fields = [
  "search_attempted", "search_result", "duplicate_status", "approval_status", "create_attempted",
  "create_call_count", "mutation_status", "actual_issue_key", "actual_issue_url", "verification_status",
  "allowed_next_step",
];
if (workflow.contract !== "jira-ticket-mcp-backed-create-workflow-v1") process.exit(1);
if (required.some((id) => !workflow.scenarios.some((scenario) => scenario.id === id))) process.exit(1);
if (fields.some((field) => !workflow.required_report_fields.includes(field))) process.exit(1);
NODE

node scripts/test-jira-ticket-mcp-create-workflow.mjs
echo "jira-ticket MCP-backed Create Workflow fixtures passed"
