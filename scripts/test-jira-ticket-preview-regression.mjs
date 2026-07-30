#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  APPROVAL_BOUNDARY_CONTRACT, BACKLOG_HEADINGS, evaluatePurePreviewScenario,
  parseApprovalBoundaryContract, parseCanonicalHeadings, renderBacklogPreview,
  validateApprovalBoundaryContract,
} from "./lib/jira-ticket-pure-preview.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/jira-ticket/pure-contract-fixtures.json", import.meta.url), "utf8"));
const backlogTemplate = fs.readFileSync(new URL("../skills/jira-ticket/templates/backlog-preview.md", import.meta.url), "utf8");

assert.deepEqual(fixture.canonical_backlog_headings, BACKLOG_HEADINGS, "fixture declares complete canonical heading order");
assert.deepEqual(parseCanonicalHeadings(backlogTemplate), BACKLOG_HEADINGS, "backlog template heading order");
assert.deepEqual(parseCanonicalHeadings(renderBacklogPreview()), BACKLOG_HEADINGS, "renderer heading order");
assert.deepEqual(parseApprovalBoundaryContract(backlogTemplate), APPROVAL_BOUNDARY_CONTRACT, "Approval Boundary parser extracts the complete safety contract");
assert.deepEqual(validateApprovalBoundaryContract(backlogTemplate), APPROVAL_BOUNDARY_CONTRACT, "Approval Boundary safety contract is valid");

for (const scenario of fixture.scenarios) {
  const actual = evaluatePurePreviewScenario(scenario.input);
  assert.deepEqual(actual, scenario.expected, scenario.id);
  console.log(`passed: ${scenario.id}`);
}

function replaceOnce(markdown, target, replacement) {
  assert.ok(markdown.includes(target), `mutation target is present: ${target}`);
  return markdown.replace(target, replacement);
}

const approvalBoundaryMutations = [
  ["approval-boundary-body-deleted", (markdown) => replaceOnce(markdown, markdown.match(/^## Approval Boundary\n[\s\S]*$/m)[0], "## Approval Boundary\n")],
  ["child-preview-deleted", (markdown) => replaceOnce(markdown, "- **Child Ticket Preview:** Each Child Ticket requires a separate Single Ticket Create Preview.\n", "")],
  ["child-approval-deleted", (markdown) => replaceOnce(markdown, "- **Child Ticket Approval:** Each Child Ticket requires a separate explicit current-preview approval.\n", "")],
  ["group-approval-deleted", (markdown) => replaceOnce(markdown, "- **Group Approval:** Group Approval must not authorize multiple Jira Create calls.\n", "")],
  ["virtual-issue-key-deleted", (markdown) => replaceOnce(markdown, "- **Virtual Issue Key:** Do not create a virtual Issue Key before an actual Jira Create result.\n", "")],
  ["virtual-issue-url-deleted", (markdown) => replaceOnce(markdown, "- **Virtual Issue URL:** Do not create a virtual Issue URL before an actual Jira Create result.\n", "")],
  ["external-writes-deleted", (markdown) => replaceOnce(markdown, "- **External Writes:** Backlog Preview must not perform a Jira Write or a Confluence Write.\n", "")],
  ["local-git-mutations-deleted", (markdown) => replaceOnce(markdown, "- **Local Git Mutations:** Backlog Preview must not create a branch, change code, commit, push, or create a PR.\n", "")],
  ["approval-boundary-arbitrary-body", (markdown) => replaceOnce(markdown, markdown.match(/^## Approval Boundary\n[\s\S]*$/m)[0], "## Approval Boundary\n\nMUTATED APPROVAL BODY\n")],
];
for (const [name, mutate] of approvalBoundaryMutations) {
  const mutatedTemplate = mutate(backlogTemplate);
  assert.throws(() => validateApprovalBoundaryContract(mutatedTemplate), /Approval Boundary safety contract/, name);
  console.log(`passed: mutation-probe-${name}`);
}
console.log("jira-ticket pure Preview and Backlog regression passed");
