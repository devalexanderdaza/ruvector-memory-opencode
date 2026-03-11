import {
  getVectorStoreAdapterForTools,
  initializeMemoryOnFirstOperation,
} from "../../core/plugin.js";
import type { MemorySearchResult, ToolResponse } from "../../shared/types.js";

/** Hard cap on retrieved items to prevent resource-exhaustion via large k searches. */
const MAX_SEARCH_LIMIT = 100;

function parseQueryAndLimit(
  input?: unknown,
): { query: string; limit: number } | null {
  if (typeof input === "string") {
    return { query: input, limit: 5 };
  }
  if (input && typeof input === "object") {
    const candidate = input as Record<string, unknown>;
    const query = typeof candidate.query === "string" ? candidate.query : null;
    const rawLimit =
      typeof candidate.limit === "number" && Number.isFinite(candidate.limit)
        ? candidate.limit
        : 5;
    // Cap at MAX_SEARCH_LIMIT to prevent unbounded HNSW traversal.
    const limit = Math.min(Math.max(1, Math.floor(rawLimit)), MAX_SEARCH_LIMIT);
    if (query) {
      return { query, limit };
    }
  }
  return null;
}

export function createMemorySearchTool(): (
  input?: unknown,
) => Promise<ToolResponse<MemorySearchResult>> {
  return async function memory_search(
    input?: unknown,
  ): Promise<ToolResponse<MemorySearchResult>> {
    const parsed = parseQueryAndLimit(input);
    if (!parsed) {
      return {
        success: false,
        error:
          "memory_search requires a string query or { query: string, limit?: number }",
        code: "EINVALID",
        reason: "validation",
      };
    }

    const init = await initializeMemoryOnFirstOperation();
    if (!init.success) {
      return init;
    }

    const store = getVectorStoreAdapterForTools();
    if (!store) {
      return {
        success: false,
        error: "Memory system unavailable: plugin not activated",
        code: "PLUGIN_NOT_ACTIVATED",
        reason: "initialization",
      };
    }

    try {
      return await store.search(parsed.query, parsed.limit);
    } catch (error) {
      return {
        success: false,
        error: `memory_search failed: ${error instanceof Error ? error.message : "unknown error"}`,
        code: "EUNEXPECTED",
        reason: "execution",
      };
    }
  };
}
