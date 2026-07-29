import {
  applyJiraCreateResult,
  applyJiraPreviewApproval,
  applyJiraSearchResult,
  beginJiraTicketCreateWorkflow,
} from "./jira-ticket-create-workflow.mjs";

/** Canonical runtime bridge: JSON in/out, semantic Jira actions only. */
export function handleJiraTicketRuntimeInput(input) {
  switch (input?.event) {
    case "start":
      return beginJiraTicketCreateWorkflow(input);
    case "search_result":
      return applyJiraSearchResult(input.state, input.result);
    case "approval":
      return applyJiraPreviewApproval(input.state, input.approval);
    case "create_result":
      return applyJiraCreateResult(input.state, input.result);
    default:
      throw new Error("jira-ticket event must be start, search_result, approval, or create_result");
  }
}
