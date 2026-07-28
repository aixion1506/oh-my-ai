#!/usr/bin/env bash
set -euo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO"

SKILL="skills/git-work-preflight/SKILL.md"
DESCRIPTOR="skills/git-work-preflight/agents/openai.yaml"
REPORT="skills/git-work-preflight/templates/preflight-report.md"
RUNTIME="scripts/git-work-preflight.sh"
FIXTURE="fixtures/git-work-preflight/pure-contract-fixtures.json"

fail() {
  echo "git-work-preflight fixture failure: $*" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "missing file: $1"
}

for file in "$SKILL" "$DESCRIPTOR" "$REPORT" "$RUNTIME" "$FIXTURE"; do
  require_file "$file"
done

node - "$FIXTURE" "$SKILL" "$DESCRIPTOR" "$REPORT" "$RUNTIME" <<'NODE'
const fs = require("fs");
const [fixturePath, skillPath, descriptorPath, reportPath, runtimePath] = process.argv.slice(2);

const expectedScenarios = {
  "valid-new-work": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "A", preflight_result: "READY_NEW_WORK", blocking: false, allowed_next_step: "PLAN_NEW_WORK_ONLY", mutation: 0, execution_policy: "suggest-only" },
  "valid-resume": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "PRESENT_ALIGNED", remote_branch_state: "PRESENT_ALIGNED", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "B", preflight_result: "READY_RESUME", blocking: false, allowed_next_step: "PLAN_RESUME_ONLY", mutation: 0, execution_policy: "suggest-only" },
  "tracked-dirty-tree": { repository_verified: true, working_tree: "TRACKED_DIRTY", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "NONE", preflight_result: "BLOCKED_DIRTY_TREE", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "staged-dirty-tree": { repository_verified: true, working_tree: "STAGED_DIRTY", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "NONE", preflight_result: "BLOCKED_DIRTY_TREE", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "conflict-state": { repository_verified: true, working_tree: "UNMERGED_CONFLICT", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "NONE", preflight_result: "BLOCKED_DIRTY_TREE", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "allowed-untracked-local-state": { repository_verified: true, working_tree: "UNTRACKED_LOCAL_STATE", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "A", preflight_result: "READY_NEW_WORK", blocking: false, allowed_next_step: "PLAN_NEW_WORK_ONLY", mutation: 0, execution_policy: "suggest-only" },
  "unknown-untracked-state": { repository_verified: true, working_tree: "UNTRACKED_UNKNOWN", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "NONE", preflight_result: "NOT_VERIFIABLE", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "base-branch-missing": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "NOT_CHECKED", remote_branch_state: "NOT_CHECKED", pr_state: "NOT_CHECKED", ancestry: "NOT_VERIFIABLE", existing_work_state: "NONE", preflight_result: "NOT_VERIFIABLE", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "base-sha-mismatch": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_SHA_MISMATCH", existing_work_state: "NONE", preflight_result: "BLOCKED_BASE_MISMATCH", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "local-base-behind-remote": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "LOCAL_BEHIND_REMOTE", existing_work_state: "NONE", preflight_result: "BLOCKED_BASE_MISMATCH", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "local-base-ahead-remote": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "LOCAL_AHEAD_REMOTE", existing_work_state: "NONE", preflight_result: "BLOCKED_BASE_MISMATCH", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "local-remote-divergence": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "PRESENT_DIVERGED", remote_branch_state: "PRESENT_DIVERGED", pr_state: "NONE", ancestry: "DIVERGED", existing_work_state: "F", preflight_result: "BLOCKED_DIVERGENCE", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "local-only-issue-branch": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "LOCAL_ONLY", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "C", preflight_result: "RECOVERY_REQUIRED", blocking: true, allowed_next_step: "RECOVERY_PLAN_ONLY", mutation: 0, execution_policy: "suggest-only" },
  "remote-only-issue-branch": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "ABSENT", remote_branch_state: "REMOTE_ONLY", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "D", preflight_result: "RECOVERY_REQUIRED", blocking: true, allowed_next_step: "RECOVERY_PLAN_ONLY", mutation: 0, execution_policy: "suggest-only" },
  "normal-local-remote-issue-branch": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "PRESENT_ALIGNED", remote_branch_state: "PRESENT_ALIGNED", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "B", preflight_result: "READY_RESUME", blocking: false, allowed_next_step: "PLAN_RESUME_ONLY", mutation: 0, execution_policy: "patch-with-approval" },
  "existing-draft-pr": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "PRESENT_ALIGNED", remote_branch_state: "PRESENT_ALIGNED", pr_state: "OPEN_DRAFT", ancestry: "BASE_ALIGNED", existing_work_state: "E", preflight_result: "READY_RESUME", blocking: false, allowed_next_step: "PLAN_RESUME_ONLY", mutation: 0, execution_policy: "suggest-only" },
  "existing-non-draft-pr": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "PRESENT_ALIGNED", remote_branch_state: "PRESENT_ALIGNED", pr_state: "OPEN_NON_DRAFT", ancestry: "BASE_ALIGNED", existing_work_state: "NONE", preflight_result: "CONFLICTED", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "closed-unmerged-pr": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "PRESENT_ALIGNED", remote_branch_state: "PRESENT_ALIGNED", pr_state: "CLOSED_UNMERGED", ancestry: "BASE_ALIGNED", existing_work_state: "NONE", preflight_result: "CONFLICTED", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "already-merged": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "MERGED", ancestry: "HEAD_MERGED", existing_work_state: "G", preflight_result: "ALREADY_MERGED", blocking: true, allowed_next_step: "JIRA_RECONCILIATION_ONLY", mutation: 0, execution_policy: "suggest-only" },
  "branch-collision": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "PRESENT_ALIGNED", remote_branch_state: "PRESENT_ALIGNED", pr_state: "OPEN_DRAFT", ancestry: "BASE_ALIGNED", existing_work_state: "H", preflight_result: "CONFLICTED", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "multiple-pr-collision": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "PRESENT_ALIGNED", remote_branch_state: "PRESENT_ALIGNED", pr_state: "MULTIPLE", ancestry: "BASE_ALIGNED", existing_work_state: "H", preflight_result: "CONFLICTED", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "github-unavailable": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "PRESENT_ALIGNED", remote_branch_state: "PRESENT_ALIGNED", pr_state: "NOT_VERIFIABLE", ancestry: "NOT_VERIFIABLE", existing_work_state: "NONE", preflight_result: "NOT_VERIFIABLE", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "remote-unavailable": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "NOT_VERIFIABLE", remote_branch_state: "NOT_VERIFIABLE", pr_state: "NOT_CHECKED", ancestry: "NOT_VERIFIABLE", existing_work_state: "NONE", preflight_result: "NOT_VERIFIABLE", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "repository-mismatch": { repository_verified: false, working_tree: "NOT_CHECKED", local_branch_state: "NOT_CHECKED", remote_branch_state: "NOT_CHECKED", pr_state: "NOT_CHECKED", ancestry: "NOT_VERIFIABLE", existing_work_state: "NONE", preflight_result: "CONFLICTED", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "branch-naming-conflict": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "NOT_CHECKED", remote_branch_state: "NOT_CHECKED", pr_state: "NOT_CHECKED", ancestry: "BASE_ALIGNED", existing_work_state: "NONE", preflight_result: "CONFLICTED", blocking: true, allowed_next_step: "STOP", mutation: 0, execution_policy: "suggest-only" },
  "suggest-only": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "A", preflight_result: "READY_NEW_WORK", blocking: false, allowed_next_step: "PLAN_NEW_WORK_ONLY", mutation: 0, execution_policy: "suggest-only" },
  "patch-with-approval": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "A", preflight_result: "READY_NEW_WORK", blocking: false, allowed_next_step: "PLAN_WITH_SEPARATE_APPROVAL", mutation: 0, execution_policy: "patch-with-approval" },
  "auto-apply-without-mutation-runtime": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "A", preflight_result: "READY_NEW_WORK", blocking: false, allowed_next_step: "PLAN_ONLY_RUNTIME_UNAVAILABLE", mutation: 0, execution_policy: "auto-apply" },
  "telemetry-binary-missing": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "A", preflight_result: "READY_NEW_WORK", blocking: false, allowed_next_step: "PLAN_NEW_WORK_ONLY", mutation: 0, execution_policy: "suggest-only" },
  "telemetry-execution-failure": { repository_verified: true, working_tree: "CLEAN", local_branch_state: "ABSENT", remote_branch_state: "ABSENT", pr_state: "NONE", ancestry: "BASE_ALIGNED", existing_work_state: "A", preflight_result: "READY_NEW_WORK", blocking: false, allowed_next_step: "PLAN_NEW_WORK_ONLY", mutation: 0, execution_policy: "suggest-only" }
};

const expectedTopLevel = ["consumers", "contract", "git_mutation", "network", "optional_inputs", "pr_write", "required_inputs", "scenarios"].sort();
const expectedRequiredInputs = ["Repository", "Expected Base Branch", "Execution Policy", "Consumer"];
const expectedOptionalInputs = ["Expected Base SHA", "Expected Branch Name Candidate", "Issue Key", "Provided Evidence"];
const expectedConsumers = ["work-start", "jira-work", "manual-review"];
const scenarioKeys = ["id", "repository_verified", "working_tree", "local_branch_state", "remote_branch_state", "pr_state", "ancestry", "existing_work_state", "preflight_result", "blocking", "allowed_next_step", "mutation", "execution_policy"].sort();

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExact(actual, expected, label) {
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function validate(input) {
  const { fixture, skill, descriptor, report, runtime } = input;
  assertExact(Object.keys(fixture).sort(), expectedTopLevel, "fixture key set");
  invariant(fixture.contract === "git-work-preflight-pure-contract-v1", "unexpected fixture contract");
  assertExact(fixture.required_inputs, expectedRequiredInputs, "required inputs");
  assertExact(fixture.optional_inputs, expectedOptionalInputs, "optional inputs");
  assertExact(fixture.consumers, expectedConsumers, "consumer set");
  for (const key of ["network", "git_mutation", "pr_write"]) {
    invariant(Object.hasOwn(fixture, key), `missing safety flag: ${key}`);
    invariant(fixture[key] === false, `${key} must be boolean false`);
  }

  invariant(Array.isArray(fixture.scenarios), "scenarios must be an array");
  const ids = fixture.scenarios.map(({ id }) => id);
  invariant(new Set(ids).size === ids.length, "scenario ids must be unique");
  assertExact([...ids].sort(), Object.keys(expectedScenarios).sort(), "scenario set");
  for (const scenario of fixture.scenarios) {
    assertExact(Object.keys(scenario).sort(), scenarioKeys, `${scenario.id}: key set`);
    const expected = expectedScenarios[scenario.id];
    for (const [key, value] of Object.entries(expected)) {
      invariant(scenario[key] === value, `${scenario.id}: expected ${key}=${JSON.stringify(value)}, got ${JSON.stringify(scenario[key])}`);
    }
    invariant(scenario.mutation === 0, `${scenario.id}: mutation must remain 0`);
  }

  for (const text of ["consumer-only", "implicit invocation", "work-start", "jira-work", "manual-review", "Human Review", "Ticket Gate", "Repository Required", "Base Branch Required", "NOT_VERIFIABLE", "Mutation 0"]) {
    invariant(skill.includes(text), `skill missing '${text}'`);
  }
  invariant(descriptor.includes("allow_implicit_invocation: false"), "implicit invocation must be false");
  invariant(!descriptor.includes("allow_implicit_invocation: true"), "implicit invocation must not be true");
  invariant(!descriptor.includes("disable-model-invocation"), "descriptor contains unsupported invocation field");
  invariant(!skill.includes("disable-model-invocation"), "skill contains unsupported invocation field");
  for (const state of ["READY_NEW_WORK", "READY_RESUME", "RECOVERY_REQUIRED", "BLOCKED_DIRTY_TREE", "BLOCKED_BASE_MISMATCH", "BLOCKED_DIVERGENCE", "ALREADY_MERGED", "CONFLICTED", "NOT_VERIFIABLE"]) {
    invariant(skill.includes(state), `skill missing state ${state}`);
    invariant(report.includes(state), `report missing state ${state}`);
  }
  for (const field of ["Consumer", "Repository", "Repository Verification", "Remote Verification", "Current Branch", "Current HEAD", "Expected Base Branch", "Expected Base SHA", "Local Base SHA", "Remote Base SHA", "Working Tree Status", "Untracked Local State", "Expected Branch Candidate", "Local Branch Status", "Remote Branch Status", "PR Status", "Ancestry Status", "Existing Work A–H", "Preflight Result", "Blocking Items", "Evidence", "Allowed Next Step", "Prohibited Actions", "Unavailable Capabilities"]) {
    invariant(report.includes(field), `report missing '${field}'`);
  }
  for (const text of ["Branch Creation", "Checkout", "Commit and Push", "Draft PR", "Jira Comment and Transition"]) {
    invariant(report.includes(text), `report missing unavailable capability '${text}'`);
  }
  for (const text of ["Repository Required", "Base Branch Required", "--repository", "--expected-base-branch", "--execution-policy", "--consumer", "status --short", "ls-remote --heads", "pr list", "|| true"]) {
    invariant(runtime.includes(text), `runtime missing '${text}'`);
  }
  invariant(!runtime.includes("eval "), "runtime must not use eval");
  for (const pattern of [/\bgit\s+switch\b/, /\bgit\s+checkout\b/, /\bgit\s+reset\b/, /\bgit\s+restore\b/, /\bgit\s+stash\b/, /\bgit\s+clean\b/, /\bgit\s+merge\b/, /\bgit\s+rebase\b/, /\bgit\s+pull\b/, /\bgit\s+push\b/, /\bgh\s+pr\s+(create|merge)\b/]) {
    invariant(!pattern.test(runtime), `runtime contains forbidden command ${pattern}`);
  }
}

const original = {
  fixture: JSON.parse(fs.readFileSync(fixturePath, "utf8")),
  skill: fs.readFileSync(skillPath, "utf8"),
  descriptor: fs.readFileSync(descriptorPath, "utf8"),
  report: fs.readFileSync(reportPath, "utf8"),
  runtime: fs.readFileSync(runtimePath, "utf8")
};

validate(original);

function cloneInput() {
  return { ...original, fixture: JSON.parse(JSON.stringify(original.fixture)) };
}

let mutationChecks = 0;
function expectMutationRejected(name, mutate) {
  const candidate = cloneInput();
  mutate(candidate);
  let rejected = false;
  try {
    validate(candidate);
  } catch {
    rejected = true;
  }
  invariant(rejected, `mutation was not detected: ${name}`);
  mutationChecks += 1;
}

expectMutationRejected("dirty tree becomes READY", ({ fixture }) => {
  fixture.scenarios.find(({ id }) => id === "tracked-dirty-tree").preflight_result = "READY_NEW_WORK";
});
expectMutationRejected("divergence becomes READY", ({ fixture }) => {
  fixture.scenarios.find(({ id }) => id === "local-remote-divergence").preflight_result = "READY_RESUME";
});
expectMutationRejected("merged becomes READY_NEW_WORK", ({ fixture }) => {
  fixture.scenarios.find(({ id }) => id === "already-merged").preflight_result = "READY_NEW_WORK";
});
expectMutationRejected("draft PR allows new work", ({ fixture }) => {
  fixture.scenarios.find(({ id }) => id === "existing-draft-pr").allowed_next_step = "PLAN_NEW_WORK_ONLY";
});
expectMutationRejected("GitHub unavailable becomes branch absent", ({ fixture }) => {
  fixture.scenarios.find(({ id }) => id === "github-unavailable").pr_state = "NONE";
});
expectMutationRejected("mutation becomes one", ({ fixture }) => {
  fixture.scenarios.find(({ id }) => id === "valid-new-work").mutation = 1;
});
expectMutationRejected("reset is allowed", (candidate) => {
  candidate.runtime += `
git reset --hard
`;
});
expectMutationRejected("force push is allowed", (candidate) => {
  candidate.runtime += `
git push --force
`;
});

console.log(`passed: git-work-preflight exact oracle and ${mutationChecks}/${mutationChecks} mutation checks`);
NODE

if output="$("$RUNTIME" 2>&1)"; then
  fail "runtime accepted missing required inputs"
fi
case "$output" in
  *"Repository Required"*) ;;
  *) fail "missing input result did not report Repository Required: $output" ;;
esac

echo "all git-work-preflight fixtures passed"
