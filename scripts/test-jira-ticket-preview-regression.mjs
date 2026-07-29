#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  CONTRACT_FIELDS, SOURCE_PRIORITY, branchFallback, issueTypeCandidate,
  sourceConflictStatus, validatePreviewContract, validateSourcePriority,
} from "./lib/jira-ticket-preview-contract.mjs";

const contract = Object.fromEntries(CONTRACT_FIELDS.map((field) => [field, `Verified ${field}`]));
assert.equal(validatePreviewContract(contract).valid, true);
assert.deepEqual(validatePreviewContract({ ...contract, Repository: "Repository Required" }), { valid: false, missing: ["Repository"] });
assert.equal(validateSourcePriority(SOURCE_PRIORITY), true);
assert.equal(validateSourcePriority([...SOURCE_PRIORITY].reverse()), false);
assert.equal(sourceConflictStatus("accepted", "accepted"), "aligned");
assert.equal(sourceConflictStatus("accepted", "conflict"), "Decision Required");
assert.equal(issueTypeCandidate("Task"), "Task");
assert.equal(issueTypeCandidate("Custom"), "Issue Type Decision Required");
assert.equal(branchFallback("Task", "<ISSUE-KEY>"), "chore/<ISSUE-KEY>");
assert.equal(branchFallback("Bug", "RPL-21", "jira-ticket"), "fix/RPL-21-jira-ticket");
assert.equal(branchFallback("Custom", "RPL-21"), "Decision Required");
console.log("jira-ticket pure Preview and Backlog regression passed");
