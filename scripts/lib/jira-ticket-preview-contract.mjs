import { BLOCKING_SENTINELS, CONTRACT_FIELDS } from "./jira-ticket-create-workflow.mjs";

const SOURCE_PRIORITY = [
  "Accepted Decision", "Canonical Repository Product and Architecture Documents", "Confluence Specification",
  "Explicit User Request", "Handoff Candidate", "Current Conversation",
];
const ISSUE_TYPES = new Set(["Feature", "Story", "Task", "Bug", "Research", "Tech Debt"]);

export function validatePreviewContract(contract) {
  const missing = CONTRACT_FIELDS.filter((field) => {
    const value = typeof contract?.[field] === "string" ? contract[field].trim() : "";
    return !value || BLOCKING_SENTINELS.has(value.toLowerCase());
  });
  return { valid: missing.length === 0, missing };
}

export function validateSourcePriority(sources) {
  return Array.isArray(sources) && SOURCE_PRIORITY.every((source, index) => sources[index] === source);
}

export function sourceConflictStatus(acceptedDecision, lowerPrioritySource) {
  if (!acceptedDecision || !lowerPrioritySource) return "Not Verifiable";
  return acceptedDecision === lowerPrioritySource ? "aligned" : "Decision Required";
}

export function issueTypeCandidate(value) {
  return ISSUE_TYPES.has(value) ? value : "Issue Type Decision Required";
}

export function branchFallback(issueType, issueKey, slug = "") {
  const prefixes = { Feature: "feat", Story: "feat", Task: "chore", Bug: "fix", Research: "research", "Tech Debt": "refactor" };
  if (!prefixes[issueType]) return "Decision Required";
  return `${prefixes[issueType]}/${issueKey}${slug ? `-${slug}` : ""}`;
}

export { CONTRACT_FIELDS, SOURCE_PRIORITY };
