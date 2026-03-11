/**
 * MemoryContextInjector — Passive memory context injection for agent enrichment.
 *
 * Implements Story 2.5: automatically retrieves the most relevant memories and
 * formats them into a concise context block ready for system prompt injection.
 *
 * Key behaviors:
 * - Filters memories below a configurable relevance threshold (default 0.7)
 * - Truncates individual memory content to MAX_CONTENT_LENGTH chars
 * - Enforces a total token budget across selected memories
 * - Activates a circuit breaker after 3 consecutive injection failures
 * - Returns graceful empty context on all error paths (never throws)
 */

import { logger } from "../shared/logger.js";
import { estimateTokens, selectWithinTokenBudget } from "../shared/token-counter.js";
import type {
  MemoryInjectionConfig,
  MemoryInjectionResult,
  SearchResult,
} from "../shared/types.js";
import type { VectorStoreAdapter } from "../vector/vector-store.js";
import { formatSearchResults } from "./memory-response-formatter.js";

/** Maximum characters per individual memory content before truncation. */
const MAX_CONTENT_LENGTH = 500;

/** Number of consecutive failures before opening the circuit breaker. */
const MAX_CONSECUTIVE_FAILURES = 3;

export class MemoryContextInjector {
  private readonly config: MemoryInjectionConfig;
  private consecutiveFailures = 0;

  public constructor(config: MemoryInjectionConfig) {
    this.config = config;
  }

  /**
   * Filters memories to those at or above the configured relevance threshold,
   * sorted by relevance score descending (most relevant first).
   */
  public filterByRelevanceThreshold(memories: SearchResult[]): SearchResult[] {
    return memories
      .filter((m) => m.relevance >= this.config.relevanceThreshold)
      .sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Selects memories that fit within the token budget.
   * Individual content is truncated to MAX_CONTENT_LENGTH before budget counting.
   * Does not mutate original SearchResult objects.
   */
  public selectMemoriesWithinTokenBudget(memories: SearchResult[]): SearchResult[] {
    const truncated = memories.map((m) => ({
      ...m,
      content:
        m.content.length > MAX_CONTENT_LENGTH
          ? `${m.content.slice(0, MAX_CONTENT_LENGTH)}...`
          : m.content,
    }));

    return selectWithinTokenBudget(truncated, this.config.maxTokenBudget);
  }

  /**
   * Formats selected memories into a concise markdown context block.
   * Returns empty string when memories array is empty.
   */
  public formatMemoryContext(memories: SearchResult[]): string {
    if (memories.length === 0) return "";

    const sections = memories.map((m, i) => {
      const metaParts = [
        `**Source:** ${m.source}`,
        `**Confidence:** ${m.confidence.toFixed(2)}`,
        `**Relevance:** ${m.relevance.toFixed(2)}`,
        `**Saved:** ${m.timestamp}`,
      ];

      if (m.tags && m.tags.length > 0) {
        metaParts.push(`**Tags:** ${m.tags.join(", ")}`);
      }

      return `## Memory ${i + 1}\n${metaParts.join(" | ")}\n\n${m.content}`;
    });

    return `# Relevant Memory Context\n\n${sections.join("\n\n")}`;
  }

  /**
   * Runs the full passive injection pipeline:
   * 1. Guard: disabled config or open circuit breaker → return skipped
   * 2. Search vector store for candidate memories (oversampled for filtering)
   * 3. Filter by relevance threshold
   * 4. Select top-K within token budget
   * 5. Format as markdown context
   * 6. Cache and return result
   *
   * Never throws — all errors are caught and produce an empty context result.
   *
   * @param adapter - VectorStoreAdapter to search for memories
   * @param query - Optional semantic query; defaults to empty string (neutral retrieval)
   */
  public async inject(adapter: VectorStoreAdapter, query = ""): Promise<MemoryInjectionResult> {
    if (!this.config.enablePassiveInjection) {
      return { context: "", memoriesInjected: 0, tokensUsed: 0, skipped: true };
    }

    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      logger.warn("memory_injection_circuit_open", {
        consecutiveFailures: this.consecutiveFailures,
      });
      return { context: "", memoriesInjected: 0, tokensUsed: 0, skipped: true };
    }

    try {
      // Oversample to account for threshold filtering
      // Retrieve 2x the target count to ensure enough memories pass relevance filter.
      // For example, with maxMemoriesToInject=5, we fetch 10 candidates. After filtering
      // at threshold 0.7, we might get 5+ qualifiers. This strategy avoids empty contexts.
      const candidateK = this.config.maxMemoriesToInject * 2;
      const searchResult = await adapter.search(query, candidateK);
      if (!searchResult.success) {
        this.consecutiveFailures++;
        logger.warn("memory_injection_search_failed", {
          consecutiveFailures: this.consecutiveFailures,
          error: searchResult.error,
        });
        return { context: "", memoriesInjected: 0, tokensUsed: 0, skipped: false };
      }

      // Convert raw items to enriched SearchResult objects
      const formatted = formatSearchResults(searchResult.data);
      const candidates = formatted.results;

      // When a meaningful query is provided, filter by semantic relevance threshold.
      // For passive preloading (empty query), semantic similarity is not meaningful—
      // just select by composite score (confidence + recency ordering from vector store).
      const hasSemanticQuery = query.trim().length > 0;
      const filtered = hasSemanticQuery
        ? this.filterByRelevanceThreshold(candidates)
        : candidates.sort((a, b) => b.relevance - a.relevance);

      // Apply top-K limit and token budget (also truncates long content)
      const topK = filtered.slice(0, this.config.maxMemoriesToInject);

      // Apply token budget (also truncates long content)
      const selected = this.selectMemoriesWithinTokenBudget(topK);

      // Format for context injection
      const context = this.formatMemoryContext(selected);
      const tokensUsed = estimateTokens(context);

      // Success: reset circuit breaker
      this.consecutiveFailures = 0;

      logger.info("memory_injection_success", {
        memoriesInjected: selected.length,
        tokensUsed,
        relevanceThreshold: this.config.relevanceThreshold,
      });

      return { context, memoriesInjected: selected.length, tokensUsed, skipped: false };
    } catch (err) {
      this.consecutiveFailures++;
      logger.warn("memory_injection_error", {
        error: err instanceof Error ? err.message : String(err),
        consecutiveFailures: this.consecutiveFailures,
      });
      return { context: "", memoriesInjected: 0, tokensUsed: 0, skipped: false };
    }
  }
}
