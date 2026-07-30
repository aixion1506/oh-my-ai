import { createHash } from "node:crypto";

const CONTRACT_FIELDS = [
  "Summary", "Context", "Goal", "Source of Truth", "In Scope", "Out of Scope",
  "Acceptance Criteria", "Repository", "Base Branch", "Expected Branch Name",
  "Dependencies", "Verification", "Do Not Touch", "Definition of Done",
];
const BLOCKING_SENTINELS = new Set([
  "decision required", "repository required", "base branch required", "not verifiable",
]);

function baseReport() {
  return {
    search_attempted: false,
    search_result: "not_performed",
    duplicate_status: "not_checked",
    approval_status: "not_requested",
    create_attempted: false,
    create_call_count: 0,
    mutation_status: "0",
    automatic_retry: false,
    actual_issue_key: null,
    actual_issue_url: null,
    verification_status: "not_verifiable",
    allowed_next_step: "Review the Ticket Contract",
    preview_evidence: [],
    write_evidence: [],
  };
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isBlocking(value) {
  return BLOCKING_SENTINELS.has(normalizedText(value).toLowerCase());
}

function hasValidContract(contract) {
  return CONTRACT_FIELDS.every((field) => normalizedText(contract?.[field]) && !isBlocking(contract[field]));
}

function missingCreateMetadata(contract, metadata) {
  const required = [
    ["Project", metadata?.project], ["Issue Type", metadata?.issue_type], ["Summary", contract?.Summary],
    ["Assignee", metadata?.assignee], ["Priority", metadata?.priority], ["Product", metadata?.product],
    ["Primary Repository", metadata?.repository], ["Area", metadata?.area],
  ];
  return required.filter(([, value]) => !normalizedText(value) || isBlocking(value)).map(([field]) => field);
}

function hasCapability(state, capability) {
  const record = state.capabilities?.[capability];
  return record?.available === true && record?.connection_verified === true;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value ?? null;
}

// Jira labels are a set for this workflow: whitespace and duplicates have no
// semantic meaning, and order must not invalidate an otherwise current Preview.
function canonicalLabels(labels) {
  if (!Array.isArray(labels)) return [];
  return [...new Set(labels.filter((label) => typeof label === "string").map((label) => label.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function previewPayload(state, search) {
  return canonicalize({
    contract: Object.fromEntries(CONTRACT_FIELDS.map((field) => [field, state.contract[field]])),
    project: state.metadata.project,
    issue_type: state.metadata.issue_type,
    assignee: state.metadata.assignee,
    priority: state.metadata.priority,
    labels: canonicalLabels(state.metadata.labels),
    product: state.metadata.product,
    primary_repository: state.metadata.repository,
    area: state.metadata.area,
    branch: state.metadata.branch ?? null,
    pr: state.metadata.pr ?? null,
    current_head: state.metadata.current_head ?? null,
    duplicate_search: search,
    reuse_candidate: search.issue ?? null,
    runtime: state.runtime,
    capability_evidence: state.capabilities,
    runtime_evidence: state.runtime_evidence,
  });
}

function previewId(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function createDescription(snapshot) {
  const header = [
    `Product: ${snapshot.product}`, `Primary Repository: ${snapshot.primary_repository}`, `Area: ${snapshot.area}`,
    `Assignee: ${snapshot.assignee}`, `Priority: ${snapshot.priority}`,
    `Branch: ${normalizedText(snapshot.branch) || "Not Verifiable"}`,
    `PR: ${snapshot.pr ?? "Not created"}`, `Current HEAD: ${snapshot.current_head ?? "Not Verifiable"}`,
  ];
  return [...header, "", ...CONTRACT_FIELDS.map((field) => `## ${field}\n${snapshot.contract[field]}`)].join("\n");
}

function searchRequest(contract, metadata) {
  return {
    project: "RPL", summary_keywords: contract.Summary, product: metadata.product,
    repository: metadata.repository, area: metadata.area, related_pr: metadata.pr ?? null,
    branch: metadata.branch ?? null, decision: metadata.decision ?? null,
    existing_issue_key: metadata.existing_issue_key ?? null, created_after: metadata.created_after ?? null,
    contract_fingerprint_candidate: `${contract.Summary}|${metadata.product}|${metadata.repository}|${metadata.area}`,
  };
}

function terminal(state, patch) {
  Object.assign(state.report, patch);
  return { state, report: state.report, required_action: null };
}

function createRequest(snapshot) {
  return {
    project: snapshot.project, issue_type: snapshot.issue_type, summary: snapshot.contract.Summary,
    description: createDescription(snapshot), assignee: snapshot.assignee,
    priority: snapshot.priority, labels: snapshot.labels,
  };
}

function validSiteOrigin(origin) {
  try { return new URL(origin).origin === origin; } catch { return false; }
}

function issueUrlMatches(url, siteOrigin, key) {
  try {
    const parsed = new URL(url);
    return parsed.origin === siteOrigin && parsed.pathname === `/browse/${key}`;
  } catch {
    return false;
  }
}

/** Runtime-neutral first stage. It emits a semantic action; it never invokes Jira. */
export function beginJiraTicketCreateWorkflow(input) {
  const state = {
    runtime: input.runtime,
    contract: input.contract,
    metadata: input.metadata,
    capabilities: input.capabilities ?? {},
    runtime_evidence: input.runtime_evidence ?? {},
    report: baseReport(),
  };
  state.report.preview_evidence.push(`Runtime: ${state.runtime ?? "unknown"}`);
  const missing = missingCreateMetadata(state.contract, state.metadata);
  if (missing.length) return terminal(state, {
    missing_metadata: missing, approval_status: "blocked", verification_status: "NOT_VERIFIABLE", allowed_next_step: "누락 Metadata 보완",
  });
  if (!hasValidContract(state.contract)) return terminal(state, {
    approval_status: "blocked", allowed_next_step: "Resolve the Ticket Contract validation failures",
  });
  if (state.metadata.project !== "RPL") return terminal(state, {
    verification_status: "not_verifiable", allowed_next_step: "Project를 RPL로 수정",
  });
  if (!hasCapability(state, "jira.search")) return terminal(state, {
    allowed_next_step: "Connect Jira MCP/Plugin or review the Ticket Contract manually",
  });
  state.report.search_attempted = true;
  return { state, report: state.report, required_action: { type: "jira.search_required", request: searchRequest(state.contract, state.metadata) } };
}

/** Accepts a runtime-normalized result after exactly one Jira search tool call. */
export function applyJiraSearchResult(state, search) {
  if (search?.tool_call_count !== 1) return terminal(state, {
    search_result: "unclear", duplicate_status: "unknown", allowed_next_step: "Resolve Jira search evidence before creating an Issue",
  });
  state.search = search;
  state.report.search_result = search.status ?? "unclear";
  state.report.preview_evidence.push(`Search result: ${search.status ?? "unknown"}`, `Search tool calls: ${search.tool_call_count}`);
  if (search.status === "exact_duplicate") return terminal(state, {
    duplicate_status: "exact", reuse_candidate: search.issue ?? null, allowed_next_step: "Reuse the existing Jira Issue",
  });
  if (search.status === "similar") return terminal(state, {
    duplicate_status: "similar", approval_status: "decision_required", reuse_candidate: search.issue ?? null, allowed_next_step: "Ask a human whether to reuse or create a Jira Issue",
  });
  if (search.status === "failed") return terminal(state, {
    duplicate_status: "unknown", allowed_next_step: "Resolve Jira search evidence before creating an Issue",
  });
  if (search.status !== "none") return terminal(state, {
    search_result: "unclear", duplicate_status: "unknown", allowed_next_step: "Resolve Jira search evidence before creating an Issue",
  });
  state.report.duplicate_status = "none";
  state.preview = previewPayload(state, search);
  state.preview_id = previewId(state.preview);
  state.report.preview_id = state.preview_id;
  if (!hasCapability(state, "jira.create")) return terminal(state, {
    allowed_next_step: "Connect Jira Create capability before approving a Create Preview",
  });
  if (!validSiteOrigin(state.runtime_evidence.jira_site_origin)) return terminal(state, {
    allowed_next_step: "Verify the Jira Site Origin before approving a Create Preview",
  });
  return { state, report: state.report, required_action: { type: "preview_required", preview_id: state.preview_id, preview: state.preview } };
}

/** Approval is valid only for the exact canonical Preview emitted above. */
export function applyJiraPreviewApproval(state, approval) {
  const currentSnapshot = state.search ? previewPayload(state, state.search) : null;
  const currentPreviewId = currentSnapshot ? previewId(currentSnapshot) : null;
  if (approval?.status === "pending") return terminal(state, {
    approval_status: "pending", allowed_next_step: "Obtain explicit approval for this Create Preview",
  });
  if (approval?.status === "rejected") return terminal(state, {
    approval_status: "rejected", allowed_next_step: "Keep the preview without creating a Jira Issue",
  });
  if (approval?.status !== "approved" || !approval.preview_id || approval.preview_id !== state.preview_id || approval.preview_id !== currentPreviewId) {
    return terminal(state, {
      approval_status: "stale_or_missing", verification_status: "not_verifiable", allowed_next_step: "현재 Preview를 다시 승인",
    });
  }
  state.report.approval_status = "approved";
  // The request is derived exclusively from the approved immutable snapshot,
  // never from mutable state.contract or state.metadata after approval.
  return { state, report: state.report, required_action: { type: "jira.create_required", request: createRequest(state.preview), preview_id: state.preview_id } };
}

/** Validates a runtime-normalized Create result without constructing a Jira URL or Key. */
export function applyJiraCreateResult(state, created) {
  state.report.create_attempted = true;
  state.report.create_call_count = created?.tool_call_count ?? 0;
  state.report.actual_issue_key = created?.key ?? null;
  state.report.actual_issue_url = created?.url ?? null;
  state.report.write_evidence.push(`Create tool calls: ${created?.tool_call_count ?? 0}`);
  if (created?.key) state.report.write_evidence.push(`Returned Issue Key: ${created.key}`);
  if (created?.url) state.report.write_evidence.push(`Returned Issue URL: ${created.url}`);
  const keyValid = /^RPL-[1-9][0-9]*$/.test(created?.key ?? "");
  const verified = created?.kind === "created" && created?.tool_call_count === 1 && keyValid
    && created.project === "RPL" && created.summary === state.contract.Summary
    && issueUrlMatches(created.url, state.runtime_evidence.jira_site_origin, created.key);
  if (!verified) return terminal(state, {
    mutation_status: "possibly_applied", verification_status: "not_verifiable",
    allowed_next_step: "Re-search Jira with the same contract evidence; automatic retry is false",
  });
  return terminal(state, {
    mutation_status: "applied", verification_status: "verified", allowed_next_step: "Report the verified Jira Issue and stop",
  });
}

/** Fixture convenience only; production uses the three stages through oh-my-ai jira-ticket. */
export async function runJiraTicketCreateWorkflow({ adapter, contract, metadata, approval }) {
  let step = beginJiraTicketCreateWorkflow({ runtime: adapter?.runtime, contract, metadata, capabilities: adapter?.capabilities, runtime_evidence: adapter?.runtime_evidence });
  if (step.required_action?.type !== "jira.search_required") return step.report;
  let search;
  try { search = await adapter.search(step.required_action.request); } catch { search = { status: "failed", tool_call_count: 1 }; }
  step = applyJiraSearchResult(step.state, search);
  if (step.required_action?.type !== "preview_required") return step.report;
  const normalizedApproval = approval?.current === true
    ? { status: "approved", preview_id: step.state.preview_id }
    : approval === "pending" ? { status: "pending" }
      : approval === "rejected" ? { status: "rejected" }
        : approval;
  step = applyJiraPreviewApproval(step.state, normalizedApproval);
  if (step.required_action?.type !== "jira.create_required") return step.report;
  let created;
  try { created = await adapter.create(step.required_action.request); } catch { created = { kind: "timeout", tool_call_count: 1 }; }
  return applyJiraCreateResult(step.state, created).report;
}

export { BLOCKING_SENTINELS, CONTRACT_FIELDS, canonicalLabels, createDescription, missingCreateMetadata, previewId, searchRequest };
