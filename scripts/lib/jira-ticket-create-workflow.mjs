const CONTRACT_FIELDS = [
  "Summary",
  "Context",
  "Goal",
  "Source of Truth",
  "In Scope",
  "Out of Scope",
  "Acceptance Criteria",
  "Repository",
  "Base Branch",
  "Expected Branch Name",
  "Dependencies",
  "Verification",
  "Do Not Touch",
  "Definition of Done",
];

const BLOCKING_SENTINELS = new Set([
  "Decision Required",
  "Repository Required",
  "Base Branch Required",
  "Not Verifiable",
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
    actual_issue_key: null,
    actual_issue_url: null,
    verification_status: "not_verifiable",
    allowed_next_step: "Review the Ticket Contract",
    preview_evidence: [],
    write_evidence: [],
  };
}

function hasValidContract(contract) {
  return CONTRACT_FIELDS.every((field) => {
    const value = contract?.[field];
    return typeof value === "string" && value.trim() && !BLOCKING_SENTINELS.has(value.trim());
  });
}

function hasCapability(adapter, capability) {
  const record = adapter?.capabilities?.[capability];
  return record?.available === true && record?.connection_verified === true;
}

function missingCreateMetadata(contract, metadata) {
  const required = [
    ["Project", metadata?.project],
    ["Issue Type", metadata?.issue_type],
    ["Summary", contract?.Summary],
    ["Assignee", metadata?.assignee],
    ["Priority", metadata?.priority],
    ["Product", metadata?.product],
    ["Primary Repository", metadata?.repository],
    ["Area", metadata?.area],
  ];
  return required
    .filter(([, value]) => typeof value !== "string" || !value.trim() || value.trim() === "Not Verifiable")
    .map(([field]) => field);
}

function createDescription(contract, metadata) {
  const header = [
    `Product: ${metadata.product}`,
    `Primary Repository: ${metadata.repository}`,
    `Area: ${metadata.area}`,
    `Assignee: ${metadata.assignee}`,
    `Priority: ${metadata.priority}`,
    `Branch: ${metadata.branch?.trim() || "Not Verifiable"}`,
    `PR: ${metadata.pr ?? "Not created"}`,
    `Current HEAD: ${metadata.current_head ?? "Not Verifiable"}`,
  ];
  const body = CONTRACT_FIELDS.map((field) => `## ${field}\n${contract[field]}`);
  return [...header, "", ...body].join("\n");
}

function searchRequest(contract, metadata) {
  return {
    project: "RPL",
    summary_keywords: contract.Summary,
    product: metadata.product,
    repository: metadata.repository,
    area: metadata.area,
    related_pr: metadata.pr ?? null,
    branch: metadata.branch,
    decision: metadata.decision ?? null,
    existing_issue_key: metadata.existing_issue_key ?? null,
    created_after: metadata.created_after ?? null,
    contract_fingerprint_candidate: `${contract.Summary}|${metadata.product}|${metadata.repository}|${metadata.area}`,
  };
}

function finishWithoutCreate(report, { result, duplicate, approval, next }) {
  report.search_result = result;
  report.duplicate_status = duplicate;
  report.approval_status = approval;
  report.allowed_next_step = next;
  return report;
}

/**
 * Runs the Jira MCP-backed Create Workflow against a runtime adapter.
 *
 * The adapter owns runtime-specific MCP/Plugin discovery and invocation. This
 * module accepts only the semantic jira.search and jira.create capabilities;
 * it never knows a runtime tool name, endpoint, credential, or SDK.
 */
export async function runJiraTicketCreateWorkflow({ adapter, contract, metadata, approval }) {
  const report = baseReport();
  const runtime = adapter?.runtime ?? "unknown";
  report.preview_evidence.push(`Runtime: ${runtime}`);

  const missingMetadata = missingCreateMetadata(contract, metadata);
  if (missingMetadata.length > 0) {
    report.missing_metadata = missingMetadata;
    report.verification_status = "NOT_VERIFIABLE";
    return finishWithoutCreate(report, {
      result: "not_performed",
      duplicate: "not_checked",
      approval: "blocked",
      next: "누락 Metadata 보완",
    });
  }

  if (!hasValidContract(contract)) {
    return finishWithoutCreate(report, {
      result: "not_performed",
      duplicate: "not_checked",
      approval: "blocked",
      next: "Resolve the Ticket Contract validation failures",
    });
  }

  if (metadata.project !== "RPL" || !hasCapability(adapter, "jira.search") || !hasCapability(adapter, "jira.create")) {
    return finishWithoutCreate(report, {
      result: "not_performed",
      duplicate: "not_checked",
      approval: "not_requested",
      next: "Connect Jira MCP/Plugin or review the Ticket Contract manually",
    });
  }

  let search;
  report.search_attempted = true;
  try {
    search = await adapter.search(searchRequest(contract, metadata));
  } catch (error) {
    return finishWithoutCreate(report, {
      result: "failed",
      duplicate: "unknown",
      approval: "not_requested",
      next: "Resolve Jira search evidence before creating an Issue",
    });
  }

  report.preview_evidence.push(`Search result: ${search?.status ?? "unknown"}`);
  switch (search?.status) {
    case "exact_duplicate":
      report.reuse_candidate = search.issue ?? null;
      return finishWithoutCreate(report, {
        result: "exact_duplicate",
        duplicate: "exact",
        approval: "not_requested",
        next: "Reuse the existing Jira Issue",
      });
    case "similar":
      report.reuse_candidate = search.issue ?? null;
      return finishWithoutCreate(report, {
        result: "similar",
        duplicate: "similar",
        approval: "decision_required",
        next: "Ask a human whether to reuse or create a Jira Issue",
      });
    case "none":
      report.search_result = "none";
      report.duplicate_status = "none";
      break;
    default:
      return finishWithoutCreate(report, {
        result: "unclear",
        duplicate: "unknown",
        approval: "not_requested",
        next: "Resolve Jira search evidence before creating an Issue",
      });
  }

  if (approval !== "explicit_current_preview") {
    return finishWithoutCreate(report, {
      result: "none",
      duplicate: "none",
      approval: approval === "rejected" ? "rejected" : "pending",
      next: approval === "rejected" ? "Keep the preview without creating a Jira Issue" : "Obtain explicit approval for this Create Preview",
    });
  }

  const request = {
    project: "RPL",
    issue_type: metadata.issue_type,
    summary: contract.Summary,
    description: createDescription(contract, metadata),
    assignee: metadata.assignee,
    priority: metadata.priority,
    labels: metadata.labels ?? [],
  };
  report.approval_status = "explicit_current_preview";
  report.create_attempted = true;
  report.create_call_count = 1;
  report.write_evidence.push("Create requested exactly once after current Preview approval");

  let created;
  try {
    created = await adapter.create(request);
  } catch (error) {
    report.mutation_status = "possibly_applied";
    report.verification_status = "not_verifiable";
    report.allowed_next_step = "Re-search Jira with the same contract evidence; automatic retry is false";
    return report;
  }

  if (created?.kind !== "created" || !created.key || !created.url) {
    report.mutation_status = "possibly_applied";
    report.verification_status = "not_verifiable";
    report.allowed_next_step = "Re-search Jira with the same contract evidence; automatic retry is false";
    return report;
  }

  report.actual_issue_key = created.key;
  report.actual_issue_url = created.url;
  report.write_evidence.push(`Returned Issue Key: ${created.key}`, `Returned Issue URL: ${created.url}`);
  if (created.project !== "RPL" || created.summary !== contract.Summary) {
    report.mutation_status = "possibly_applied";
    report.verification_status = "not_verifiable";
    report.allowed_next_step = "Re-search Jira with the same contract evidence; automatic retry is false";
    return report;
  }

  report.mutation_status = "applied";
  report.verification_status = "verified";
  report.allowed_next_step = "Report the verified Jira Issue and stop";
  return report;
}

export { BLOCKING_SENTINELS, CONTRACT_FIELDS, createDescription, missingCreateMetadata, searchRequest };
