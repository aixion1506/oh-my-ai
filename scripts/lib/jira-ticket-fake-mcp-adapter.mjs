/** Fake-only adapter used by fixtures. Runtime integrations must normalize their
 * own MCP/Plugin tools to this same semantic interface. */
function normalizedResult(value) {
  if (!value || typeof value !== "object") return value;
  return { tool_call_count: 1, ...value };
}

export function createFakeJiraMcpAdapter({ runtime, capabilities, runtime_evidence, search, create }) {
  return {
    runtime,
    capabilities,
    runtime_evidence,
    async search(request) {
      return normalizedResult(typeof search === "function" ? search(request) : search);
    },
    async create(request) {
      return normalizedResult(typeof create === "function" ? create(request) : create);
    },
  };
}
