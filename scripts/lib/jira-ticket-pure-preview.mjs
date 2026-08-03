import {
  CONTRACT_FIELDS, SOURCE_PRIORITY, branchFallback, issueTypeCandidate,
  sourceConflictStatus, validatePreviewContract, validateSourcePriority,
} from "./jira-ticket-preview-contract.mjs";

const BACKLOG_HEADINGS = [
  "## Source Status", "## Mode", "## Epic Candidate", "## Child Ticket Index Summary",
  "## Complete Child Ticket Contracts", ...CONTRACT_FIELDS.map((field) => `### ${field}`),
  "## Jira MCP-backed Create boundary", "## Approval Boundary",
];

// Approval Boundary is a safety contract, not explanatory prose.  The
// Markdown template encodes each rule as a named list item so the pure parser
// can reject a deleted, reordered, or rewritten prohibition structurally.
const APPROVAL_BOUNDARY_CONTRACT = [
  ["Child Ticket Preview", "Each Child Ticket requires a separate Single Ticket Create Preview."],
  ["Child Ticket Approval", "Each Child Ticket requires a separate explicit current-preview approval."],
  ["Group Approval", "Group Approval must not authorize multiple Jira Create calls."],
  ["Virtual Issue Key", "Do not create a virtual Issue Key before an actual Jira Create result."],
  ["Virtual Issue URL", "Do not create a virtual Issue URL before an actual Jira Create result."],
  ["External Writes", "Backlog Preview must not perform a Jira Write or a Confluence Write."],
  ["Local Git Mutations", "Backlog Preview must not create a branch, change code, commit, push, or create a PR."],
].map(([rule, requirement]) => ({ rule, requirement }));

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

function approvalBoundaryBody(markdown) {
  const heading = /^## Approval Boundary\s*$/m.exec(markdown);
  if (!heading) return "";
  const body = markdown.slice(heading.index + heading[0].length).replace(/^\n/, "");
  const nextHeading = body.search(/\n##\s/);
  return nextHeading === -1 ? body : body.slice(0, nextHeading);
}

/** Extracts the named Approval Boundary rules from the actual Markdown template. */
export function parseApprovalBoundaryContract(markdown) {
  const rules = approvalBoundaryBody(markdown)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.match(/^- \*\*([^:]+):\*\* (.+)$/));
  if (rules.some((rule) => !rule)) {
    throw new Error("Approval Boundary safety contract has invalid rule syntax");
  }
  return rules.map(([, rule, requirement]) => ({ rule, requirement }));
}

/** Fails closed when the rendered template omits or rewrites any safety rule. */
export function validateApprovalBoundaryContract(markdown) {
  const parsed = parseApprovalBoundaryContract(markdown);
  if (JSON.stringify(parsed) !== JSON.stringify(APPROVAL_BOUNDARY_CONTRACT)) {
    throw new Error("Approval Boundary safety contract is missing, reordered, or mutated");
  }
  return parsed;
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

export { APPROVAL_BOUNDARY_CONTRACT, BACKLOG_HEADINGS };
