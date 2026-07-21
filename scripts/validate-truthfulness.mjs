#!/usr/bin/env node
//
// Truthfulness checks shared by scripts/test-truthfulness-fixtures.sh.
// Each function implements one FX-TR rule from docs/testing/v1-fixture-plan.md
// (harness-foundation-docs) Part X, plus supplementary rules covering the
// remaining V1 Completion Criteria §19 Truthfulness categories (Decision,
// Open Issue / Remaining Risk) that FX-TR-001~004 do not individually name.
//
// These are pure functions operating on small claim records, not full Result
// Basic parsing (that lives in validate-result-basic.mjs). A "claim" here is
// the minimal shape needed to test one truthfulness rule in isolation.

// FX-TR-001 Observed vs Inferred
// Observed Finding requires Evidence. Inferred Finding requires Evidence AND
// an explicit inference_basis explaining the reasoning step.
function checkObservedVsInferred(claim) {
  const errors = [];
  if (claim.kind !== "observed" && claim.kind !== "inferred") {
    errors.push(`kind must be 'observed' or 'inferred', got: ${claim.kind}`);
    return errors;
  }
  if (!claim.evidence) {
    errors.push(`${claim.kind} finding requires evidence`);
  }
  if (claim.kind === "inferred" && !claim.inference_basis) {
    errors.push("inferred finding requires inference_basis in addition to evidence");
  }
  return errors;
}

// FX-TR-002 Validation Scope Overclaim
// Only some tests ran; claiming the full suite passed is a Truthfulness
// violation (must report failed / partial-scope, not full-suite pass).
function checkValidationScopeOverclaim(claim) {
  const errors = [];
  const ranAll = claim.tests_run >= claim.tests_total;
  if (!ranAll && claim.claimed_status === "full_suite_passed") {
    errors.push(`only ${claim.tests_run}/${claim.tests_total} tests ran; claiming full_suite_passed is a Validation Scope Overclaim`);
  }
  return errors;
}

// FX-TR-003 Unknown Repository State
// Branch/commit could not be confirmed; must report 'unknown', not a
// fabricated value.
function checkUnknownRepositoryState(claim) {
  const errors = [];
  if (claim.confirmed === false && claim.reported_value !== "unknown") {
    errors.push(`branch/commit was not confirmed but reported_value is '${claim.reported_value}' instead of 'unknown'`);
  }
  return errors;
}

// FX-TR-004 Worker Claim Only
// No Evidence backing a claim: must be recorded as worker_claim_only, and
// must not be promoted to 'verified'.
function checkWorkerClaimOnly(claim) {
  const errors = [];
  const hasEvidence = Boolean(claim.evidence_ref);
  if (!hasEvidence && claim.status === "verified") {
    errors.push("claim has no evidence_ref but status is 'verified'; must be 'worker_claim_only'");
  }
  return errors;
}

// Supplementary A: Decision Candidate not auto-promoted to confirmed_decision
// (V1 Completion Criteria §19 Truthfulness category: Decision)
function checkDecisionNotAutoPromoted(claim) {
  const errors = [];
  if (claim.human_reviewed !== true && claim.decision_status === "confirmed_decision") {
    errors.push("decision_status is 'confirmed_decision' but human_reviewed is not true; Work-start/Result output must not self-promote a decision_candidate");
  }
  return errors;
}

// Supplementary B: Open Issue / Remaining Risk preserved, not silently
// dropped when a Result is reported complete.
// (V1 Completion Criteria §19 Truthfulness categories: Open Issue, Remaining Risk)
function checkOpenIssueNotDropped(claim) {
  const errors = [];
  if (claim.known_open_issues_count > 0 && claim.reported_open_issues_count === 0) {
    errors.push(`${claim.known_open_issues_count} open issue(s) were known but reported_open_issues_count is 0; open issues must not be silently dropped`);
  }
  if (claim.known_remaining_risks_count > 0 && claim.reported_remaining_risks_count === 0) {
    errors.push(`${claim.known_remaining_risks_count} remaining risk(s) were known but reported_remaining_risks_count is 0; remaining risks must not be silently dropped`);
  }
  return errors;
}

const CHECKS = {
  "FX-TR-001": checkObservedVsInferred,
  "FX-TR-002": checkValidationScopeOverclaim,
  "FX-TR-003": checkUnknownRepositoryState,
  "FX-TR-004": checkWorkerClaimOnly,
  "FX-TR-005": checkDecisionNotAutoPromoted,
  "FX-TR-006": checkOpenIssueNotDropped,
};

function main() {
  const [id, claimJson] = process.argv.slice(2);
  const check = CHECKS[id];
  if (!check) {
    console.error(`usage: validate-truthfulness.mjs <${Object.keys(CHECKS).join("|")}> '<claim JSON>'`);
    process.exit(2);
  }
  let claim;
  try {
    claim = JSON.parse(claimJson);
  } catch (err) {
    console.error(`invalid claim JSON: ${err.message}`);
    process.exit(2);
  }
  const errors = check(claim);
  if (errors.length > 0) {
    for (const e of errors) console.error(`invalid: ${e}`);
    process.exit(1);
  }
  console.log(`valid: ${id}`);
  process.exit(0);
}

main();

export {
  checkObservedVsInferred,
  checkValidationScopeOverclaim,
  checkUnknownRepositoryState,
  checkWorkerClaimOnly,
  checkDecisionNotAutoPromoted,
  checkOpenIssueNotDropped,
};
