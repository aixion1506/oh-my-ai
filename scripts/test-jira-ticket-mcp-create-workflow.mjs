#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { createFakeJiraMcpAdapter } from "./lib/jira-ticket-fake-mcp-adapter.mjs";
import { CONTRACT_FIELDS, runJiraTicketCreateWorkflow } from "./lib/jira-ticket-create-workflow.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/jira-ticket/mcp-create-workflow-fixtures.json", import.meta.url), "utf8"));
const contract = Object.fromEntries(CONTRACT_FIELDS.map((field) => [field, field === "Summary" ? "MCP-backed Jira Create Workflow" : `Verified ${field}`]));
const metadata = {
  project: "RPL",
  product: "Dev Harness",
  repository: "aixion1506/oh-my-ai",
  area: "Jira Workflow",
  assignee: "Park",
  priority: "High",
  branch: "feat/RPL-21-jira-ticket-mcp-create",
  current_head: "7f83663b6c3e129a2f52d179741d3d4385d1c292",
  issue_type: "Task",
  labels: ["jira-workflow"],
};
const readyCapabilities = {
  "jira.search": { available: true, connection_verified: true },
  "jira.create": { available: true, connection_verified: true },
};

for (const scenario of fixture.scenarios) {
  let searchCalls = 0;
  let createCalls = 0;
  let createRequest = null;
  const adapter = createFakeJiraMcpAdapter({
    runtime: scenario.runtime ?? "codex",
    capabilities: scenario.capabilities === "ready" ? readyCapabilities : scenario.capabilities,
    runtime_evidence: { jira_site_origin: "https://jira.example" },
    search: () => {
      searchCalls += 1;
      if (scenario.search === "throw") throw new Error("fixture search failure");
      return scenario.search;
    },
    create: (request) => {
      createCalls += 1;
      createRequest = request;
      if (scenario.create === "throw") throw new Error("fixture create timeout");
      return scenario.create;
    },
  });
  const runContract = scenario.contract === "invalid" ? { ...contract, Goal: "Not Verifiable" } : contract;
  const runMetadata = { ...metadata, ...(scenario.metadata_overrides ?? {}) };
  const approval = scenario.approval === "explicit_current_preview" ? { status: "approved", current: true } : scenario.approval;
  const report = await runJiraTicketCreateWorkflow({ adapter, contract: runContract, metadata: runMetadata, approval });
  for (const field of fixture.required_report_fields) {
    const expected = field === "automatic_retry" ? (scenario.expected[field] ?? false) : scenario.expected[field];
    assert.deepEqual(report[field], expected, `${scenario.id}: ${field}`);
  }
  if (scenario.missing_metadata) {
    assert.deepEqual(report.missing_metadata, scenario.missing_metadata, `${scenario.id}: missing metadata`);
  }
  assert.equal(searchCalls, scenario.expected.search_attempted ? 1 : 0, `${scenario.id}: search call count`);
  assert.equal(createCalls, scenario.expected.create_call_count, `${scenario.id}: create call count`);
  if (scenario.evidence === "separated") {
    assert.ok(report.preview_evidence.length > 0 && report.write_evidence.length > 0, `${scenario.id}: evidence must be separated`);
    assert.ok(report.preview_evidence.every((value) => !value.includes("Create requested")), `${scenario.id}: preview must not claim a write`);
  }
  if (scenario.description_header) {
    for (const line of ["Product: Dev Harness", "Primary Repository: aixion1506/oh-my-ai", "Area: Jira Workflow", "Assignee: Park", "Priority: High", "Branch: feat/RPL-21-jira-ticket-mcp-create", "PR: Not created", "Current HEAD: 7f83663b6c3e129a2f52d179741d3d4385d1c292"]) {
      assert.ok(createRequest.description.startsWith(line) || createRequest.description.includes(`\n${line}`), `${scenario.id}: ${line}`);
    }
  }
  console.log(`passed: ${scenario.id}`);
}

console.log("jira-ticket MCP-backed Create Workflow fixtures passed");
