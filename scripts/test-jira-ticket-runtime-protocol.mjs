#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  CONTRACT_FIELDS,
  applyJiraCreateResult,
  applyJiraPreviewApproval,
  applyJiraSearchResult,
  beginJiraTicketCreateWorkflow,
} from "./lib/jira-ticket-create-workflow.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/jira-ticket/runtime-protocol-fixtures.json", import.meta.url), "utf8"));
const contract = Object.fromEntries(CONTRACT_FIELDS.map((field) => [field, field === "Summary" ? "Runtime protocol ticket" : `Verified ${field}`]));
const metadata = { project: "RPL", issue_type: "Task", assignee: "Park", priority: "High", product: "Dev Harness", repository: "aixion1506/oh-my-ai", area: "Jira Workflow", branch: "feat/RPL-21", pr: "#75", current_head: "4a6f967" };
const capabilities = { "jira.search": { available: true, connection_verified: true }, "jira.create": { available: true, connection_verified: true } };
const runtimeEvidence = { jira_site_origin: "https://jira.example", adapter: "codex" };
const searchNone = { status: "none", tool_call_count: 1 };

function previewState(overrides = {}) {
  let step = beginJiraTicketCreateWorkflow({ runtime: "codex", contract: { ...contract, ...(overrides.contract ?? {}) }, metadata: { ...metadata, ...(overrides.metadata ?? {}) }, capabilities: overrides.capabilities ?? capabilities, runtime_evidence: runtimeEvidence });
  assert.equal(step.required_action?.type, "jira.search_required");
  step = applyJiraSearchResult(step.state, overrides.search ?? searchNone);
  assert.equal(step.required_action?.type, "preview_required");
  return step;
}

function invokeRuntime(input) {
  const cli = spawnSync(process.execPath, ["scripts/oh-my-ai.mjs", "jira-ticket", "--json", JSON.stringify(input)], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  return JSON.parse(cli.stdout);
}
let entry = invokeRuntime({ event: "start", runtime: "codex", contract, metadata, capabilities, runtime_evidence: runtimeEvidence });
assert.equal(entry.required_action.type, "jira.search_required");
entry = invokeRuntime({ event: "search_result", state: entry.state, result: searchNone });
assert.equal(entry.required_action.type, "preview_required");
entry = invokeRuntime({ event: "approval", state: entry.state, approval: { status: "approved", preview_id: entry.state.preview_id } });
assert.equal(entry.required_action.type, "jira.create_required");
entry = invokeRuntime({ event: "create_result", state: entry.state, result: { kind: "created", tool_call_count: 1, key: "RPL-1", url: "https://jira.example/browse/RPL-1", project: "RPL", summary: contract.Summary } });
assert.equal(entry.report.verification_status, "verified");
console.log("passed: canonical-runtime-entry-runs-all-core-stages");

let step = previewState();
let approved = applyJiraPreviewApproval(step.state, { status: "approved", preview_id: step.state.preview_id });
assert.equal(approved.required_action?.type, "jira.create_required");
assert.deepEqual(approved.required_action.request, {
  project: "RPL", issue_type: "Task", summary: "Runtime protocol ticket",
  description: approved.required_action.request.description, assignee: "Park", priority: "High", labels: [],
});
for (const field of CONTRACT_FIELDS) assert.ok(approved.required_action.request.description.includes(`## ${field}\n`), `description missing ${field}`);
console.log("passed: approved-current-preview-emits-one-create-action");

const approvalA = { status: "approved", preview_id: step.state.preview_id };
for (const [name, mutate] of [
  ["contract-stale", (state) => { state.contract.Summary = "Contract B"; }],
  ["metadata-stale", (state) => { state.metadata.priority = "Low"; }],
  ["search-stale", (state) => { state.search = { status: "none", tool_call_count: 1, observed_at: "changed" }; }],
]) {
  step = previewState();
  mutate(step.state);
  const result = applyJiraPreviewApproval(step.state, approvalA);
  assert.equal(result.required_action, null, name);
  assert.equal(result.report.create_attempted, false, name);
  assert.equal(result.report.create_call_count, 0, name);
  assert.equal(result.report.mutation_status, "0", name);
  assert.equal(result.report.verification_status, "not_verifiable", name);
  assert.equal(result.report.allowed_next_step, "현재 Preview를 다시 승인", name);
  console.log(`passed: ${name}`);
}
for (const approval of [{ status: "approved" }, { status: "approved", preview_id: "wrong" }]) {
  step = previewState();
  const result = applyJiraPreviewApproval(step.state, approval);
  assert.equal(result.required_action, null);
  assert.equal(result.report.create_call_count, 0);
  assert.equal(result.report.allowed_next_step, "현재 Preview를 다시 승인");
}
console.log("passed: missing-and-wrong-preview-id");

let searchOnly = beginJiraTicketCreateWorkflow({ runtime: "claude", contract, metadata, capabilities: { "jira.search": { available: true, connection_verified: true }, "jira.create": { available: false, connection_verified: false } }, runtime_evidence: runtimeEvidence });
searchOnly = applyJiraSearchResult(searchOnly.state, { status: "none", tool_call_count: 1 });
assert.equal(searchOnly.report.search_attempted, true);
assert.equal(searchOnly.report.create_call_count, 0);
assert.match(searchOnly.report.allowed_next_step, /Create capability/);
console.log("passed: search-only-reuses-search-before-create-block");
for (const [name, status, duplicate] of [["search-only-exact", "exact_duplicate", "exact"], ["search-only-similar", "similar", "similar"]]) {
  let result = beginJiraTicketCreateWorkflow({ runtime: "claude", contract, metadata, capabilities: { "jira.search": { available: true, connection_verified: true }, "jira.create": { available: false, connection_verified: false } }, runtime_evidence: runtimeEvidence });
  result = applyJiraSearchResult(result.state, { status, tool_call_count: 1, issue: { key: "RPL-20", url: "https://jira.example/browse/RPL-20" } });
  assert.equal(result.report.duplicate_status, duplicate, name);
  assert.equal(result.report.create_call_count, 0, name);
  console.log(`passed: ${name}`);
}
const wrongProject = beginJiraTicketCreateWorkflow({ runtime: "codex", contract, metadata: { ...metadata, project: "ABC" }, capabilities, runtime_evidence: runtimeEvidence });
assert.equal(wrongProject.report.verification_status, "not_verifiable");
assert.equal(wrongProject.report.allowed_next_step, "Project를 RPL로 수정");
console.log("passed: wrong-project-is-not-capability-error");
for (const sentinel of ["Not Verifiable", "not verifiable", "NOT VERIFIABLE", "  Not Verifiable  "]) {
  const result = beginJiraTicketCreateWorkflow({ runtime: "codex", contract, metadata: { ...metadata, assignee: sentinel }, capabilities, runtime_evidence: runtimeEvidence });
  assert.equal(result.report.create_call_count, 0, sentinel);
  assert.deepEqual(result.report.missing_metadata, ["Assignee"], sentinel);
}
console.log("passed: metadata-sentinel-case-insensitive");

const invalidResults = {
  "abc-key": { kind: "created", tool_call_count: 1, key: "ABC-1", url: "https://jira.example/browse/ABC-1", project: "RPL", summary: contract.Summary },
  "url-key-mismatch": { kind: "created", tool_call_count: 1, key: "RPL-1", url: "https://jira.example/browse/RPL-2", project: "RPL", summary: contract.Summary },
  "invalid-key": { kind: "created", tool_call_count: 1, key: "RPL-0", url: "https://jira.example/browse/RPL-0", project: "RPL", summary: contract.Summary },
  "invalid-host": { kind: "created", tool_call_count: 1, key: "RPL-1", url: "https://wrong.example/browse/RPL-1", project: "RPL", summary: contract.Summary },
  "key-only": { kind: "created", tool_call_count: 1, key: "RPL-1", project: "RPL", summary: contract.Summary },
  "url-only": { kind: "created", tool_call_count: 1, url: "https://jira.example/browse/RPL-1", project: "RPL", summary: contract.Summary },
  "summary-mismatch": { kind: "created", tool_call_count: 1, key: "RPL-1", url: "https://jira.example/browse/RPL-1", project: "RPL", summary: "Other" },
  "project-mismatch": { kind: "created", tool_call_count: 1, key: "RPL-1", url: "https://jira.example/browse/RPL-1", project: "ABC", summary: contract.Summary },
};
for (const [name, created] of Object.entries(invalidResults)) {
  step = previewState();
  approved = applyJiraPreviewApproval(step.state, { status: "approved", preview_id: step.state.preview_id });
  const result = applyJiraCreateResult(approved.state, created);
  assert.equal(result.report.mutation_status, "possibly_applied", name);
  assert.equal(result.report.verification_status, "not_verifiable", name);
  assert.equal(result.report.automatic_retry, false, name);
  assert.equal(result.report.actual_issue_key, created.key ?? null, name);
  assert.equal(result.report.actual_issue_url, created.url ?? null, name);
  console.log(`passed: ${name}`);
}
step = previewState();
approved = applyJiraPreviewApproval(step.state, { status: "approved", preview_id: step.state.preview_id });
const verified = applyJiraCreateResult(approved.state, { kind: "created", tool_call_count: 1, key: "RPL-1", url: "https://jira.example/browse/RPL-1", project: "RPL", summary: contract.Summary });
assert.equal(verified.report.mutation_status, "applied");
assert.equal(verified.report.verification_status, "verified");
console.log("passed: verified-issue-identity");

assert.deepEqual(fixture.required_action_types, ["jira.search_required", "preview_required", "jira.create_required"]);
assert.deepEqual(fixture.minor_cases, ["search-only-exact", "search-only-similar", "wrong-project", "metadata-sentinel-case-insensitive"]);
console.log("jira-ticket runtime protocol fixtures passed");
