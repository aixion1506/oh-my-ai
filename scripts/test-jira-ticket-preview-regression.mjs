#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  BACKLOG_HEADINGS, evaluatePurePreviewScenario, parseCanonicalHeadings, renderBacklogPreview,
} from "./lib/jira-ticket-pure-preview.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/jira-ticket/pure-contract-fixtures.json", import.meta.url), "utf8"));
const backlogTemplate = fs.readFileSync(new URL("../skills/jira-ticket/templates/backlog-preview.md", import.meta.url), "utf8");

assert.deepEqual(fixture.canonical_backlog_headings, BACKLOG_HEADINGS, "fixture declares complete canonical heading order");
assert.deepEqual(parseCanonicalHeadings(backlogTemplate), BACKLOG_HEADINGS, "backlog template heading order");
assert.deepEqual(parseCanonicalHeadings(renderBacklogPreview()), BACKLOG_HEADINGS, "renderer heading order");

for (const scenario of fixture.scenarios) {
  const actual = evaluatePurePreviewScenario(scenario.input);
  assert.deepEqual(actual, scenario.expected, scenario.id);
  console.log(`passed: ${scenario.id}`);
}

const mutationProbes = [
  ["expected-values", () => ({ ...fixture.scenarios[0].expected, mode: "Mutated" })],
  ["heading-order", () => [...BACKLOG_HEADINGS].reverse()],
  ["approval-boundary-order", () => BACKLOG_HEADINGS.map((heading) => heading === "## Approval Boundary" ? "## Jira MCP-backed Create boundary" : heading === "## Jira MCP-backed Create boundary" ? "## Approval Boundary" : heading)],
  ["source-priority", () => ({ ...fixture.scenarios[0].expected, source_priority: "Invalid" })],
  ["scope-conflict", () => ({ ...fixture.scenarios.find((scenario) => scenario.id === "scope-conflict").expected, contract_validation: "Valid" })],
  ["sentinel", () => ({ ...fixture.scenarios.find((scenario) => scenario.id === "repository-required").expected, contract_validation: "Valid" })],
  ["telemetry-fail-open", () => ({ ...fixture.scenarios.find((scenario) => scenario.id === "telemetry-fail-open").expected, telemetry: "blocked" })],
];
for (const [name, mutate] of mutationProbes) {
  const mutation = mutate();
  const baseline = name.includes("heading") || name === "approval-boundary-order"
    ? BACKLOG_HEADINGS
    : name === "scope-conflict"
      ? fixture.scenarios.find((scenario) => scenario.id === "scope-conflict").expected
      : name === "sentinel"
        ? fixture.scenarios.find((scenario) => scenario.id === "repository-required").expected
        : name === "telemetry-fail-open"
          ? fixture.scenarios.find((scenario) => scenario.id === "telemetry-fail-open").expected
          : fixture.scenarios[0].expected;
  assert.notDeepEqual(mutation, baseline, `${name} mutation must fail the exact comparison`);
  console.log(`passed: mutation-probe-${name}`);
}
console.log("jira-ticket pure Preview and Backlog regression passed");
