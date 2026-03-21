/**
 * Response formatter for memory_search() results.
 *
 * Transforms raw memory objects from VectorStoreAdapter into enriched SearchResult[]
 * following the tool's documented response contract.
 *
 * Responsibilities:
 * - Map Memory objects to SearchResult interface
 * - Calculate confidence scores
 * - Ensure all required fields are present
 * - Handle missing/malformed metadata gracefully
 * - Preserve composite relevance scores from vector search
 * - Include performance metadata (_meta) for observability
 */

import type {
  MemorySearchResponse,
  MemorySearchResult,
  SearchResult,
} from "../shared/types.js";
import { computeConfidence } from "../vector/confidence-calculator.js";

/**
 * Parses metadata JSON string into an object, with fallback to empty object.
 *
 * @param metadata - Raw metadata (could be string, object, or undefined)
 * @returns Parsed metadata object or empty object if invalid
 */
function parseMetadata(metadata: unknown): Record<string, unknown> {
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Fall through to return empty object
    }
  }

  if (metadata && typeof metadata === "object") {
    return metadata as Record<string, unknown>;
  }

  return {};
}

/**
 * Normalizes timestamp to ISO-8601 string.
 * Handles numeric timestamps (epoch ms) and ISO strings.
 *
 * @param value - Timestamp as number, string, or undefined
 * @returns ISO-8601 string or current time if invalid
 */
function ensureIso8601(value: unknown): string {
  if (typeof value === "string") {
    // Validate it's a valid ISO string
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return value; // Already valid ISO
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Treat as epoch milliseconds
    return new Date(value).toISOString();
  }

  // Fallback: return current time
  return new Date().toISOString();
}

/**
 * Converts search result to formatted SearchResult following response contract.
 *
 * @param item - Raw search result from VectorStoreAdapter
 * @param queryLatencyMs - Time spent on the search query
 * @returns Fully populated SearchResult with validated fields
 */
function formatSearchResult(item: {
  id: string;
  score?: number;
  content?: string;
  metadata?: unknown;
}): SearchResult {
  const metadata = parseMetadata(item.metadata);

  // Extract and validate required fields
  const id = item.id ?? "";
  const content =
    typeof metadata.content === "string"
      ? metadata.content
      : (item.content ?? "");
  const timestamp = ensureIso8601(metadata.created_at);
  const source = (() => {
    const s = metadata.source;
    if (s === "manual" || s === "agent" || s === "import") {
      return s as "manual" | "agent" | "import";
    }
    return "manual" as const; // Default fallback
  })();

  // Extract optional fields
  const tags = Array.isArray(metadata.tags)
    ? (metadata.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter((t) => t.length > 0) as string[] | undefined)
    : undefined;

  const importance = (() => {
    const imp = metadata.importance;
    if (typeof imp === "number" && imp >= 1 && imp <= 5) {
      return imp;
    }
    return undefined;
  })();

  const projectContext = (() => {
    const pc = metadata.projectContext;
    return typeof pc === "string" ? pc : undefined;
  })();

  const projectName = (() => {
    const pn = metadata.projectName;
    return typeof pn === "string" ? pn : undefined;
  })();

  const projectType = (() => {
    const pt = metadata.projectType;
    return typeof pt === "string" ? pt : undefined;
  })();

  const primaryLanguage = (() => {
    const pl = metadata.primaryLanguage;
    return typeof pl === "string" ? pl : undefined;
  })();

  const frameworks = Array.isArray(metadata.frameworks)
    ? metadata.frameworks
        .filter(
          (framework): framework is string => typeof framework === "string",
        )
        .map((framework) => framework.trim())
        .filter((framework) => framework.length > 0)
    : undefined;

  // Calculate composite relevance score
  // The score from vector search is a composite distance (lower = better).
  // Priority/recency/confidence boosts can make it negative, which maps to
  // relevance > 1 and is clamped to 1. Using Math.abs would incorrectly
  // penalise those boosted entries by treating negative scores as large distances.
  const vectorScore = item.score ?? 0;
  const relevance = Math.max(0, Math.min(1.0, 1.0 - vectorScore));

  // Calculate confidence from metadata
  const calculatedConfidence = computeConfidence({
    accessCount: metadata.accessCount as number | undefined,
    positiveFeedbackCount: metadata.positiveFeedbackCount as number | undefined,
    negativeFeedbackCount: metadata.negativeFeedbackCount as number | undefined,
    isDuplicate: (metadata.mergedIntoId as string | undefined) !== undefined,
  });

  const explicitConfidence =
    typeof metadata.confidence === "number" &&
    Number.isFinite(metadata.confidence)
      ? metadata.confidence
      : undefined;

  const confidence =
    explicitConfidence !== undefined
      ? explicitConfidence
      : calculatedConfidence;

  return {
    id,
    content,
    relevance,
    confidence,
    timestamp,
    source,
    ...(tags && { tags }),
    ...(importance !== undefined && { importance }),
    ...(projectContext && { projectContext }),
    ...(projectName && { projectName }),
    ...(projectType && { projectType }),
    ...(primaryLanguage && { primaryLanguage }),
    // Include frameworks when the field is present in metadata, even if empty.
    // An empty array means "detected, no known frameworks" which is distinct
    // from undefined ("metadata absent").
    ...(frameworks !== undefined && { frameworks }),
    ...(metadata.mergedIntoId !== undefined && {
      mergedIntoId: metadata.mergedIntoId as string,
    }),
  };
}

/**
 * Formats raw VectorStoreAdapter search results into enriched MemorySearchResponse.
 *
 * @param searchResults - Raw results from VectorStoreAdapter
 * @param query - Original search query (for metadata)
 * @param queryLatencyMs - Time spent on the search query
 * @returns Fully formatted MemorySearchResponse ready for tool response
 *
 * @throws Error if SearchResults structure is malformed beyond recovery
 */
export function formatSearchResults(
  searchResults: MemorySearchResult,
  query?: string,
  queryLatencyMs = 0,
): MemorySearchResponse {
  if (!searchResults || !Array.isArray(searchResults.items)) {
    return {
      success: true,
      results: [],
      count: 0,
      _meta: {
        query: query ?? "",
        timestamp: new Date().toISOString(),
        queryLatencyMs: Math.max(0, queryLatencyMs),
      },
    };
  }

  // Format each result
  const formatted: SearchResult[] = searchResults.items.map((item) =>
    formatSearchResult(item),
  );

  // Sort by relevance descending
  formatted.sort((a, b) => b.relevance - a.relevance);

  return {
    success: true,
    results: formatted,
    count: formatted.length,
    _meta: {
      query: query ?? "",
      timestamp: new Date().toISOString(),
      queryLatencyMs: Math.max(0, queryLatencyMs),
    },
  };
}
