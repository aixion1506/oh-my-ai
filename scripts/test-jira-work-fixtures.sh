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

forbid_text() {
  local file="$1"
  local text="$2"
  ! rg -q -F -- "$text" "$file" || fail "forbidden text '$text' in $file"
}

for file in "$SKILL" "$DESCRIPTOR" "$REPORT" "$EXISTING" "$FIXTURE"; do
  require_file "$file"
done

require_text "$DESCRIPTOR" "allow_implicit_invocation: false"
forbid_text "$DESCRIPTOR" "allow_implicit_invocation: true"
forbid_text "$DESCRIPTOR" "disable-model-invocation"
forbid_text "$SKILL" "disable-model-invocation"
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
  "Mutation 0"; do
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
require_text "$SKILL" "Raw Tool Output"
require_text "$SKILL" "Credential"
require_text "$SKILL" "Token"
require_text "$SKILL" "Secret"
require_text "$SKILL" "Cloud ID"
require_text "$SKILL" "Account ID"

node - "$FIXTURE" "$SKILL" "$DESCRIPTOR" "$REPORT" "$EXISTING" <<'NODE'
const fs = require("fs");
const [fixturePath, skillPath, descriptorPath, reportPath, existingPath] = process.argv.slice(2);

const expectedScenarios = {
  "valid-ticket-contract": { gate_result: "READY", blocking: false, allowed_next_step: "PLAN_ONLY", mutation: 0 },
  "missing-repository": { gate_result: "BLOCKED", blocking: true, allowed_next_step: "STOP", mutation: 0 },
  "missing-base-branch": { gate_result: "BLOCKED", blocking: true, allowed_next_step: "STOP", mutation: 0 },
  "decision-required": { gate_result: "BLOCKED", blocking: true, allowed_next_step: "STOP", mutation: 0 },
  "not-verifiable-source": { gate_result: "NOT_VERIFIABLE", blocking: true, allowed_next_step: "STOP", mutation: 0 },
  "canonical-jira-conflict": { gate_result: "CONFLICTED", blocking: true, allowed_next_step: "STOP", mutation: 0 },
  "multiple-repositories": { gate_result: "BLOCKED", blocking: true, allowed_next_step: "STOP", mutation: 0 },
  "blocking-dependency": { gate_result: "BLOCKED", blocking: true, allowed_next_step: "STOP", mutation: 0 },
  "scope-conflict": { gate_result: "BLOCKED", blocking: true, allowed_next_step: "STOP", mutation: 0 },
  "acceptance-verification-conflict": { gate_result: "BLOCKED", blocking: true, allowed_next_step: "STOP", mutation: 0 },
  "new-branch-and-pr-absent": { gate_result: "READY", blocking: false, allowed_next_step: "PLAN_ONLY", mutation: 0, existing_work_state: "A" },
  "existing-normal-branch": { gate_result: "ALREADY_IN_PROGRESS", blocking: false, allowed_next_step: "RESUME_PLAN_ONLY", mutation: 0, existing_work_state: "B" },
  "local-only-branch": { gate_result: "ALREADY_IN_PROGRESS", blocking: false, allowed_next_step: "RECOVERY_PLAN_ONLY", mutation: 0, existing_work_state: "C" },
  "remote-only-branch": { gate_result: "ALREADY_IN_PROGRESS", blocking: false, allowed_next_step: "RECOVERY_PLAN_ONLY", mutation: 0, existing_work_state: "D" },
  "existing-draft-pr": { gate_result: "ALREADY_IN_PROGRESS", blocking: false, allowed_next_step: "RESUME_PLAN_ONLY", mutation: 0, existing_work_state: "E", duplicate_work_forbidden: true },
  "local-remote-divergence": { gate_result: "CONFLICTED", blocking: true, allowed_next_step: "STOP", mutation: 0, existing_work_state: "F" },
  "already-merged": { gate_result: "ALREADY_MERGED", blocking: true, allowed_next_step: "JIRA_RECONCILIATION_ONLY", mutation: 0, existing_work_state: "G" },
  "branch-collision": { gate_result: "CONFLICTED", blocking: true, allowed_next_step: "STOP", mutation: 0, existing_work_state: "H", duplicate_work_forbidden: true },
  "unknown-custom-issue-type": { gate_result: "BLOCKED", blocking: true, allowed_next_step: "STOP", mutation: 0 },
  "ambiguous-intent": { gate_result: "NOT_INVOKED", blocking: false, allowed_next_step: "SUGGESTION_ONLY", mutation: 0 },
  "suggest-only": { gate_result: "READY", blocking: false, allowed_next_step: "PLAN_ONLY", mutation: 0, approval_required: false },
  "patch-with-approval": { gate_result: "READY", blocking: false, allowed_next_step: "PLAN_ONLY", mutation: 0, approval_required: true },
  "auto-apply-without-runtime": { gate_result: "READY", blocking: false, allowed_next_step: "PLAN_ONLY", mutation: 0 },
  "telemetry-binary-missing": { gate_result: "READY", blocking: false, allowed_next_step: "PLAN_ONLY", mutation: 0 },
  "telemetry-execution-failure": { gate_result: "READY", blocking: false, allowed_next_step: "PLAN_ONLY", mutation: 0 },
};

const sourcePriority = [
  "Accepted Decision",
  "Canonical Repository Product and Architecture Documents",
  "Confluence Specification",
  "Jira Ticket",
  "Handoff Candidate",
  "Current Conversation",
];

const normalize = (text) => text.replace(/\s+/g, " ").trim();

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertOrderedAfter(text, anchor, values, label) {
  let cursor = text.indexOf(anchor);
  invariant(cursor >= 0, `${label}: missing anchor '${anchor}'`);
  for (const value of values) {
    const next = text.indexOf(value, cursor + 1);
    invariant(next >= 0, `${label}: missing ordered value '${value}'`);
    cursor = next;
  }
}

function assertExactScenario(actual, expected, id) {
  const expectedKeys = ["id", ...Object.keys(expected)].sort();
  const actualKeys = Object.keys(actual).sort();
  invariant(
    JSON.stringify(actualKeys) === JSON.stringify(expectedKeys),
    `${id}: expected keys ${expectedKeys.join(", ")}, got ${actualKeys.join(", ")}`
  );
  for (const [key, value] of Object.entries(expected)) {
    invariant(actual[key] === value, `${id}: expected ${key}=${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}`);
  }
}

function validateContract(input) {
  const { fixture, skill, descriptor, report, existing } = input;
  invariant(fixture.contract === "jira-work-pure-contract-gate-v1", "unexpected fixture contract");

  for (const key of ["network", "git_mutation", "jira_write", "artifact_write"]) {
    invariant(Object.hasOwn(fixture, key), `missing safety flag: ${key}`);
    invariant(fixture[key] === false, `${key} must be boolean false`);
  }

  invariant(Array.isArray(fixture.scenarios), "scenarios must be an array");
  const ids = fixture.scenarios.map((scenario) => scenario.id);
  invariant(new Set(ids).size === ids.length, "scenario ids must be unique");

  const expectedIds = Object.keys(expectedScenarios).sort();
  const actualIds = [...ids].sort();
  invariant(
    JSON.stringify(actualIds) === JSON.stringify(expectedIds),
    `scenario set mismatch; unexpected scenarios are rejected`
  );

  for (const scenario of fixture.scenarios) {
    assertExactScenario(scenario, expectedScenarios[scenario.id], scenario.id);
  }

  assertOrderedAfter(skill, "Validate sources in this order:", sourcePriority, "Skill source priority");
  assertOrderedAfter(report, "## Source of Truth Validation", sourcePriority, "Report source priority");

  const normalizedSkill = normalize(skill);
  invariant(
    normalizedSkill.includes("No mode in this PR can remove a Draft state, Merge, Release, Tag, deploy to production, run a migration, or change a secret."),
    "missing exact Merge, Release, Tag, deploy, migration, and secret prohibition"
  );
  invariant(
    normalizedSkill.includes("This PR has no Jira Ticket Connector Read, Git Preflight, Branch Creation, Implementation, Verification Execution, Commit and Push, Draft PR, or Jira Comment and Transition runtime."),
    "missing exact unavailable runtime contract"
  );
  invariant(
    normalizedSkill.includes("Never persist a Jira Description, Confluence body, Raw Transcript, Raw Tool Output, Credential, Token, Secret, Cloud ID, or Account ID."),
    "missing complete privacy prohibition"
  );
  invariant(
    skill.includes("Issue Key, Summary, Ticket content를 Telemetry에 기록하지 않는다"),
    "missing telemetry privacy contract"
  );
  invariant(descriptor.includes("allow_implicit_invocation: false"), "implicit invocation must be false");
  invariant(!descriptor.includes("allow_implicit_invocation: true"), "implicit invocation must not be true");
  invariant(!skill.includes("disable-model-invocation"), "Skill contains unsupported disable-model-invocation");
  invariant(!descriptor.includes("disable-model-invocation"), "Descriptor contains unsupported disable-model-invocation");

  for (const state of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    invariant(
      fixture.scenarios.some((scenario) => scenario.existing_work_state === state),
      `missing Existing Work state ${state}`
    );
  }

  invariant(existing.includes("## A. New Branch and PR absent"), "missing Existing Work A contract");
  invariant(existing.includes("## H. Branch collision with another Issue Key or PR"), "missing Existing Work H contract");
}

const original = {
  fixture: JSON.parse(fs.readFileSync(fixturePath, "utf8")),
  skill: fs.readFileSync(skillPath, "utf8"),
  descriptor: fs.readFileSync(descriptorPath, "utf8"),
  report: fs.readFileSync(reportPath, "utf8"),
  existing: fs.readFileSync(existingPath, "utf8"),
};

validateContract(original);

function cloneInput() {
  return {
    ...original,
    fixture: JSON.parse(JSON.stringify(original.fixture)),
  };
}

function expectMutationRejected(name, mutate) {
  const candidate = cloneInput();
  mutate(candidate);
  let rejected = false;
  try {
    validateContract(candidate);
  } catch {
    rejected = true;
  }
  invariant(rejected, `mutation was not detected: ${name}`);
}

expectMutationRejected("network key deleted", ({ fixture }) => { delete fixture.network; });
expectMutationRejected("network true", ({ fixture }) => { fixture.network = true; });
expectMutationRejected("source priority swapped", (candidate) => {
  candidate.skill = candidate.skill.replace(
    "1. Accepted Decision\n2. Canonical Repository Product and Architecture Documents",
    "1. Canonical Repository Product and Architecture Documents\n2. Accepted Decision"
  );
});
expectMutationRejected("already merged becomes READY", ({ fixture }) => {
  fixture.scenarios.find(({ id }) => id === "already-merged").gate_result = "READY";
});
expectMutationRejected("H collision becomes non-blocking", ({ fixture }) => {
  fixture.scenarios.find(({ id }) => id === "branch-collision").blocking = false;
});
expectMutationRejected("mutation becomes 1", ({ fixture }) => {
  fixture.scenarios.find(({ id }) => id === "valid-ticket-contract").mutation = 1;
});
expectMutationRejected("Merge prohibition inverted", (candidate) => {
  candidate.skill = candidate.skill.replace("No mode in this PR can remove", "Every mode in this PR can remove");
});
expectMutationRejected("Token privacy removed", (candidate) => {
  candidate.skill = candidate.skill.replace("Credential, Token, Secret", "Credential, Secret");
});
expectMutationRejected("Raw Tool Output privacy removed", (candidate) => {
  candidate.skill = candidate.skill.replace("Raw Transcript, Raw Tool Output", "Raw Transcript");
});
expectMutationRejected("implicit invocation enabled", (candidate) => {
  candidate.descriptor = candidate.descriptor.replace("allow_implicit_invocation: false", "allow_implicit_invocation: true");
});
expectMutationRejected("unsupported invocation field added", (candidate) => {
  candidate.descriptor += "\ndisable-model-invocation: true\n";
});

console.log("jira-work semantic mutation checks passed: 11/11");
NODE

echo "jira-work pure contract fixtures passed"
