const RUNTIMES = new Set(["codex", "claude"]);

function failedSearch() {
  return { status: "failed", tool_call_count: 0 };
}

function failedCreate() {
  return { kind: "invalid", tool_call_count: 0 };
}

/**
 * Converts adapter-owned runtime output into Core semantic results. The Core
 * receives neither a Jira Tool function name nor a transport-specific shape.
 */
export function normalizeJiraRuntimeResult(runtime, operation, raw) {
  if (!RUNTIMES.has(runtime) || !raw || typeof raw !== "object") {
    return operation === "search" ? failedSearch() : failedCreate();
  }

  if (operation === "search") {
    const result = runtime === "codex" ? raw : raw.result;
    const toolCallCount = runtime === "codex" ? raw.toolCallCount : raw.calls?.length;
    if (toolCallCount !== 1 || !["none", "exact_duplicate", "similar", "failed"].includes(result?.outcome ?? result?.status)) return failedSearch();
    return {
      status: result.outcome ?? result.status,
      tool_call_count: toolCallCount,
      ...(result.issue ? { issue: result.issue } : {}),
    };
  }

  if (operation === "create") {
    const result = runtime === "codex" ? raw.issue : raw.createdIssue;
    const toolCallCount = runtime === "codex" ? raw.toolCallCount : raw.calls?.length;
    if (toolCallCount !== 1 || !result || typeof result.key !== "string" || typeof result.url !== "string" || typeof result.project !== "string" || typeof result.summary !== "string") return failedCreate();
    return { kind: "created", tool_call_count: toolCallCount, key: result.key, url: result.url, project: result.project, summary: result.summary };
  }

  throw new Error("runtime normalization operation must be search or create");
}
