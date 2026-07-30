import {
  CONTRACT_FIELDS, SOURCE_PRIORITY, branchFallback, issueTypeCandidate,
  sourceConflictStatus, validatePreviewContract, validateSourcePriority,
} from "./jira-ticket-preview-contract.mjs";

const BACKLOG_HEADINGS = [
  "## Source Status", "## Mode", "## Epic Candidate", "## Child Ticket Index Summary",
  "## Complete Child Ticket Contracts", ...CONTRACT_FIELDS.map((field) => `### ${field}`),
  "## Jira MCP-backed Create boundary", "## Approval Boundary",
];

function scopeConflict(contract) {
  const inScope = String(contract?.["In Scope"] ?? "").trim().toLowerCase();
  const outOfScope = String(contract?.["Out of Scope"] ?? "").trim().toLowerCase();
  return Boolean(inScope && outOfScope && inScope === outOfScope);
}

function contractStatus(contract) {
  const validation = validatePreviewContract(contract);
  return validation.valid && !scopeConflict(contract) ? "Valid" : "Contract Validation Failure";
}

function contractFromInput(input = {}) {
  const contract = Object.fromEntries(CONTRACT_FIELDS.map((field) => [field, `Verified ${field}`]));
  return { ...contract, ...(input.contract_overrides ?? {}) };
}

/** Renders a pure Backlog Preview: no network, artifact, or external write. */
export function renderBacklogPreview() {
  return BACKLOG_HEADINGS.map((heading) => `${heading}\n`).join("\n");
}

export function parseCanonicalHeadings(markdown) {
  return markdown.split("\n").filter((line) => /^#{2,3} /.test(line));
}

/** Executes a fixture scenario through the actual pure contract helpers. */
export function evaluatePurePreviewScenario(input) {
  const sourcePriority = validateSourcePriority(input.source_priority ?? SOURCE_PRIORITY);
  const sourceConflict = sourceConflictStatus(input.accepted_decision, input.lower_priority_source);
  const status = contractStatus(contractFromInput(input));
  const children = input.children ?? [];
  const childContractsValid = children.every((child) => contractStatus(contractFromInput(child)) === "Valid");
  const valid = sourcePriority && sourceConflict !== "Decision Required" && status === "Valid" && childContractsValid;
  return {
    source_priority: sourcePriority ? "Valid" : "Invalid",
    mode: input.mode,
    contract_validation: status,
    epic_candidate: input.epic_candidate,
    child_ticket_index: children.length,
    complete_child_ticket_contracts: childContractsValid ? "Valid" : "Blocked",
    external_write: "Jira Write 0",
    approval_boundary: valid ? "Create Preview eligible" : "Create 0",
    issue_type: issueTypeCandidate(input.issue_type),
    source_conflict: sourceConflict,
    branch_fallback: branchFallback(input.issue_type, input.issue_key, input.slug),
    telemetry: input.telemetry_failed ? "fail_open" : "not_attempted",
  };
}

export { BACKLOG_HEADINGS };
