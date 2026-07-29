/** Fake-only adapter used by fixtures. Runtime integrations must normalize their
 * own MCP/Plugin tools to this same semantic interface. */
export function createFakeJiraMcpAdapter({ runtime, capabilities, search, create }) {
  return {
    runtime,
    capabilities,
    async search(request) {
      return typeof search === "function" ? search(request) : search;
    },
    async create(request) {
      return typeof create === "function" ? create(request) : create;
    },
  };
}
