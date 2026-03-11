import {
  getVectorStoreAdapterForTools,
  initializeMemoryOnFirstOperation,
} from "../../core/plugin.js";
import type {
  MemorySearchFilters,
  MemorySearchInput,
  MemorySearchResponse,
  ToolResponse,
} from "../../shared/types.js";
import { formatSearchResults } from "../memory-response-formatter.js";

/** Hard cap on retrieved items to prevent resource-exhaustion via large k searches. */
const MAX_SEARCH_LIMIT = 100;

type ParsedSearchInput = {
  query: string;
  limit: number;
  filters?: MemorySearchFilters;
};

function toEpochMs(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFilters(rawFilters: unknown): {
  filters?: MemorySearchFilters;
  error?: string;
} {
  if (rawFilters === undefined) {
    return {};
  }

  if (!rawFilters || typeof rawFilters !== "object") {
    return {
      error:
        "memory_search filters must be an object with optional tags, source, created_after, created_before",
    };
  }

  const candidate = rawFilters as Record<string, unknown>;
  const parsed: MemorySearchFilters = {};

  if (candidate.tags !== undefined) {
    if (!Array.isArray(candidate.tags)) {
      return {
        error: "memory_search filters.tags must be an array of non-empty strings",
      };
    }
    const tags = candidate.tags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    if (tags.length > 0) {
      parsed.tags = tags;
    }
  }

  if (candidate.source !== undefined) {
    if (typeof candidate.source !== "string" || !candidate.source.trim()) {
      return {
        error: "memory_search filters.source must be a non-empty string",
      };
    }
    parsed.source = candidate.source.trim();
  }

  if (candidate.project_name !== undefined) {
    if (typeof candidate.project_name !== "string" || !candidate.project_name.trim()) {
      return {
        error: "memory_search filters.project_name must be a non-empty string",
      };
    }
    parsed.project_name = candidate.project_name.trim();
  }

  if (candidate.project_type !== undefined) {
    if (typeof candidate.project_type !== "string" || !candidate.project_type.trim()) {
      return {
        error: "memory_search filters.project_type must be a non-empty string",
      };
    }
    parsed.project_type = candidate.project_type.trim();
  }

  if (candidate.primary_language !== undefined) {
    if (typeof candidate.primary_language !== "string" || !candidate.primary_language.trim()) {
      return {
        error: "memory_search filters.primary_language must be a non-empty string",
      };
    }
    parsed.primary_language = candidate.primary_language.trim();
  }

  if (candidate.frameworks !== undefined) {
    if (!Array.isArray(candidate.frameworks)) {
      return {
        error: "memory_search filters.frameworks must be an array of non-empty strings",
      };
    }
    const frameworks = candidate.frameworks
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (frameworks.length > 0) {
      parsed.frameworks = frameworks;
    }
  }

  if (candidate.created_after !== undefined) {
    if (
      typeof candidate.created_after !== "string" &&
      typeof candidate.created_after !== "number"
    ) {
      return {
        error:
          "memory_search filters.created_after must be an ISO date string or epoch milliseconds number",
      };
    }
    const epoch = toEpochMs(candidate.created_after);
    if (epoch === null) {
      return {
        error:
          "memory_search filters.created_after is invalid; use an ISO date string or epoch milliseconds number",
      };
    }
    parsed.created_after = epoch;
  }

  if (candidate.created_before !== undefined) {
    if (
      typeof candidate.created_before !== "string" &&
      typeof candidate.created_before !== "number"
    ) {
      return {
        error:
          "memory_search filters.created_before must be an ISO date string or epoch milliseconds number",
      };
    }
    const epoch = toEpochMs(candidate.created_before);
    if (epoch === null) {
      return {
        error:
          "memory_search filters.created_before is invalid; use an ISO date string or epoch milliseconds number",
      };
    }
    parsed.created_before = epoch;
  }

  if (
    typeof parsed.created_after === "number" &&
    typeof parsed.created_before === "number" &&
    parsed.created_after >= parsed.created_before
  ) {
    return {
      error:
        "memory_search filters range is invalid: created_after must be less than created_before",
    };
  }

  if (Object.keys(parsed).length > 0) {
    return { filters: parsed };
  }

  return {};
}

function parseSearchInput(input?: unknown): ParsedSearchInput | null {
  if (typeof input === "string") {
    return { query: input, limit: 5 };
  }
  if (input && typeof input === "object") {
    const candidate = input as Partial<MemorySearchInput> & Record<string, unknown>;
    const query = typeof candidate.query === "string" ? candidate.query : null;
    const rawLimit =
      typeof candidate.limit === "number" && Number.isFinite(candidate.limit) ? candidate.limit : 5;
    // Cap at MAX_SEARCH_LIMIT to prevent unbounded HNSW traversal.
    const limit = Math.min(Math.max(1, Math.floor(rawLimit)), MAX_SEARCH_LIMIT);
    if (query) {
      const filterParse = parseFilters(candidate.filters);
      if (filterParse.error) {
        return null;
      }
      if (filterParse.filters) {
        return { query, limit, filters: filterParse.filters };
      }
      return { query, limit };
    }
  }
  return null;
}

function getSearchInputError(input?: unknown): string {
  if (typeof input !== "object" || input === null) {
    return "memory_search requires a string query or { query: string, limit?: number, filters?: {...} }";
  }

  const candidate = input as Record<string, unknown>;
  const filterParse = parseFilters(candidate.filters);
  if (filterParse.error) {
    return filterParse.error;
  }

  return "memory_search requires a string query or { query: string, limit?: number, filters?: {...} }";
}

export function createMemorySearchTool(): (
  input?: unknown,
) => Promise<ToolResponse<MemorySearchResponse>> {
  return async function memory_search(
    input?: unknown,
  ): Promise<ToolResponse<MemorySearchResponse>> {
    const parsed = parseSearchInput(input);
    if (!parsed) {
      return {
        success: false,
        error: getSearchInputError(input),
        code: "EINVALID",
        reason: "validation",
      };
    }

    const init = await initializeMemoryOnFirstOperation();
    if (!init.success) {
      return init as ToolResponse<MemorySearchResponse>;
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
      const startTime = Date.now();
      const storeResult = await store.search(parsed.query, parsed.limit, parsed.filters);

      if (!storeResult.success) {
        return storeResult as ToolResponse<MemorySearchResponse>;
      }

      const queryLatencyMs = Date.now() - startTime;

      // Format raw results into enriched response with confidence, source, etc.
      const enrichedResponse = formatSearchResults(storeResult.data, parsed.query, queryLatencyMs);

      return {
        success: true,
        data: enrichedResponse,
      };
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
