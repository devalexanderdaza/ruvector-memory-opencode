import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryInjectionConfig, SearchResult } from "../../../src/shared/types.js";
import { MemoryContextInjector } from "../../../src/tools/memory-context-injector.js";
import type { VectorStoreAdapter } from "../../../src/vector/vector-store.js";

function makeConfig(overrides: Partial<MemoryInjectionConfig> = {}): MemoryInjectionConfig {
  return {
    enablePassiveInjection: true,
    maxMemoriesToInject: 5,
    relevanceThreshold: 0.7,
    maxTokenBudget: 2000,
    formattingStyle: "markdown",
    ...overrides,
  };
}

function makeMemory(id: string, relevance: number, content = "test content"): SearchResult {
  return {
    id,
    content,
    relevance,
    confidence: 0.5,
    timestamp: "2026-03-11T00:00:00.000Z",
    source: "manual",
  };
}

function makeAdapter(searchResult: {
  success: boolean;
  data?: { items: unknown[] };
  error?: string;
}) {
  return {
    search: vi.fn().mockResolvedValue(searchResult),
  } as unknown as VectorStoreAdapter;
}

describe("MemoryContextInjector.filterByRelevanceThreshold", () => {
  it("keeps memories at or above threshold", () => {
    const injector = new MemoryContextInjector(makeConfig({ relevanceThreshold: 0.7 }));
    const memories = [
      makeMemory("a", 0.9),
      makeMemory("b", 0.7),
      makeMemory("c", 0.69),
      makeMemory("d", 0.5),
    ];

    const filtered = injector.filterByRelevanceThreshold(memories);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.id)).toContain("a");
    expect(filtered.map((m) => m.id)).toContain("b");
  });

  it("sorts by relevance descending", () => {
    const injector = new MemoryContextInjector(makeConfig({ relevanceThreshold: 0 }));
    const memories = [makeMemory("low", 0.75), makeMemory("high", 0.95), makeMemory("mid", 0.85)];

    const filtered = injector.filterByRelevanceThreshold(memories);
    expect(filtered).toHaveLength(3);
    expect(filtered[0]?.id).toBe("high");
    expect(filtered[1]?.id).toBe("mid");
    expect(filtered[2]?.id).toBe("low");
  });

  it("returns empty array when all memories are below threshold", () => {
    const injector = new MemoryContextInjector(makeConfig({ relevanceThreshold: 0.9 }));
    const memories = [makeMemory("a", 0.5), makeMemory("b", 0.6)];

    expect(injector.filterByRelevanceThreshold(memories)).toHaveLength(0);
  });

  it("handles empty input", () => {
    const injector = new MemoryContextInjector(makeConfig());
    expect(injector.filterByRelevanceThreshold([])).toHaveLength(0);
  });
});

describe("MemoryContextInjector.selectMemoriesWithinTokenBudget", () => {
  it("returns all memories when they fit within budget", () => {
    const injector = new MemoryContextInjector(makeConfig({ maxTokenBudget: 1000 }));
    const memories = [
      makeMemory("a", 0.9, "short content a"),
      makeMemory("b", 0.8, "short content b"),
    ];

    const selected = injector.selectMemoriesWithinTokenBudget(memories);
    expect(selected).toHaveLength(2);
  });

  it("truncates content longer than 500 chars", () => {
    const injector = new MemoryContextInjector(makeConfig({ maxTokenBudget: 2000 }));
    const longContent = "a".repeat(600);
    const memories = [makeMemory("a", 0.9, longContent)];

    const selected = injector.selectMemoriesWithinTokenBudget(memories);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.content.length).toBeLessThanOrEqual(503); // 500 + "..."
    expect(selected[0]?.content.endsWith("...")).toBe(true);
  });

  it("stops selecting when token budget is exceeded", () => {
    // Each 100-char memory = ceil(100/4) = 25 tokens. Budget = 45.
    // First: 25 ≤ 45, remaining = 20. Second: 25 > 20. Stop.
    const injector = new MemoryContextInjector(makeConfig({ maxTokenBudget: 45 }));
    const memories = [makeMemory("a", 0.9, "a".repeat(100)), makeMemory("b", 0.8, "b".repeat(100))];

    const selected = injector.selectMemoriesWithinTokenBudget(memories);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe("a");
  });

  it("returns empty array when single memory exceeds entire budget", () => {
    const injector = new MemoryContextInjector(makeConfig({ maxTokenBudget: 10 }));
    const memories = [makeMemory("a", 0.9, "a".repeat(1000))]; // 250 tokens

    expect(injector.selectMemoriesWithinTokenBudget(memories)).toHaveLength(0);
  });

  it("does not mutate original SearchResult objects by reference", () => {
    const injector = new MemoryContextInjector(makeConfig({ maxTokenBudget: 2000 }));
    const original = makeMemory("a", 0.9, "a".repeat(600));

    injector.selectMemoriesWithinTokenBudget([original]);
    expect(original.content).toHaveLength(600); // original unchanged
  });
});

describe("MemoryContextInjector.formatMemoryContext", () => {
  it("returns empty string for empty memories array", () => {
    const injector = new MemoryContextInjector(makeConfig());
    expect(injector.formatMemoryContext([])).toBe("");
  });

  it("includes content, source, confidence, relevance, and timestamp", () => {
    const injector = new MemoryContextInjector(makeConfig());
    const memory = makeMemory("m1", 0.85, "use strict null checks");
    memory.confidence = 0.7;
    memory.source = "manual";
    memory.timestamp = "2026-03-11T00:00:00.000Z";

    const formatted = injector.formatMemoryContext([memory]);
    expect(formatted).toContain("use strict null checks");
    expect(formatted).toContain("manual");
    expect(formatted).toContain("0.70");
    expect(formatted).toContain("2026-03-11");
  });

  it("includes section headers for multiple memories", () => {
    const injector = new MemoryContextInjector(makeConfig());
    const memories = [makeMemory("a", 0.9, "first memory"), makeMemory("b", 0.8, "second memory")];

    const formatted = injector.formatMemoryContext(memories);
    expect(formatted).toContain("Memory 1");
    expect(formatted).toContain("Memory 2");
    expect(formatted).toContain("first memory");
    expect(formatted).toContain("second memory");
  });

  it("includes optional tags when present", () => {
    const injector = new MemoryContextInjector(makeConfig());
    const memory: SearchResult = {
      ...makeMemory("a", 0.9, "tagged content"),
      tags: ["typescript", "best-practice"],
    };

    const formatted = injector.formatMemoryContext([memory]);
    expect(formatted).toContain("typescript");
    expect(formatted).toContain("best-practice");
  });
});

describe("MemoryContextInjector.inject", () => {
  it("returns skipped=true when passive injection is disabled", async () => {
    const injector = new MemoryContextInjector(makeConfig({ enablePassiveInjection: false }));
    const adapter = makeAdapter({ success: true, data: { items: [] } });

    const result = await injector.inject(adapter as unknown as VectorStoreAdapter);
    expect(result.skipped).toBe(true);
    expect(result.memoriesInjected).toBe(0);
    expect(result.context).toBe("");
  });

  it("returns empty context and skipped=false when no memories exist", async () => {
    const injector = new MemoryContextInjector(makeConfig());
    const adapter = {
      search: vi.fn().mockResolvedValue({ success: true, data: { items: [] } }),
    } as unknown as VectorStoreAdapter;

    const result = await injector.inject(adapter);
    expect(result.skipped).toBe(false);
    expect(result.memoriesInjected).toBe(0);
    expect(result.context).toBe("");
  });

  it("returns formatted context for successful injection", async () => {
    const injector = new MemoryContextInjector(makeConfig({ relevanceThreshold: 0 }));
    const adapter = {
      search: vi.fn().mockResolvedValue({
        success: true,
        data: {
          items: [
            {
              id: "mem1",
              score: 0.1,
              content: "TypeScript tips",
              metadata: JSON.stringify({
                content: "TypeScript tips",
                created_at: new Date().toISOString(),
                source: "manual",
              }),
            },
          ],
        },
      }),
    } as unknown as VectorStoreAdapter;

    const result = await injector.inject(adapter);
    expect(result.skipped).toBe(false);
    expect(result.memoriesInjected).toBe(1);
    expect(result.context).toContain("TypeScript tips");
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("excludes memories below relevance threshold when a semantic query is provided", async () => {
    // score = 0.5 → relevance = max(0, 1 - 0.5) = 0.5, below 0.7 threshold
    // Threshold filter is only applied when a non-empty query is provided.
    const injector = new MemoryContextInjector(makeConfig({ relevanceThreshold: 0.7 }));
    const adapter = {
      search: vi.fn().mockResolvedValue({
        success: true,
        data: {
          items: [
            {
              id: "low",
              score: 0.5,
              content: "low relevance memory",
              metadata: JSON.stringify({
                content: "low relevance memory",
                created_at: new Date().toISOString(),
                source: "manual",
              }),
            },
          ],
        },
      }),
    } as unknown as VectorStoreAdapter;

    // Explicit query → semantic threshold filter is applied
    const result = await injector.inject(adapter, "specific context query");
    expect(result.memoriesInjected).toBe(0);
    expect(result.context).toBe("");
  });

  it("does NOT apply relevance threshold for passive preloading (empty query)", async () => {
    // For empty-query passive preloading, all top-K memories are returned
    // regardless of semantic relevance score (since empty-query scores are meaningless).
    const injector = new MemoryContextInjector(makeConfig({ relevanceThreshold: 0.7 }));
    const adapter = {
      search: vi.fn().mockResolvedValue({
        success: true,
        data: {
          items: [
            {
              id: "any",
              score: 0.5, // would be excluded with threshold, but not for passive preload
              content: "project memory",
              metadata: JSON.stringify({
                content: "project memory",
                created_at: new Date().toISOString(),
                source: "manual",
              }),
            },
          ],
        },
      }),
    } as unknown as VectorStoreAdapter;

    // Empty query → passive preloading, no threshold filter
    const result = await injector.inject(adapter);
    expect(result.memoriesInjected).toBe(1);
    expect(result.context).toContain("project memory");
  });

  it("activates circuit breaker after 3 consecutive failures", async () => {
    const injector = new MemoryContextInjector(makeConfig());
    const failingSearch = vi.fn().mockResolvedValue({ success: false, error: "DB unavailable" });
    const adapter = {
      search: failingSearch,
    } as unknown as VectorStoreAdapter;

    await injector.inject(adapter); // fail 1
    await injector.inject(adapter); // fail 2
    await injector.inject(adapter); // fail 3

    // 4th call — circuit breaker should open, skipping the search
    const result = await injector.inject(adapter);
    expect(result.skipped).toBe(true);
    expect(failingSearch).toHaveBeenCalledTimes(3); // 4th was bypassed
  });

  it("resets circuit breaker on successful injection", async () => {
    const injector = new MemoryContextInjector(makeConfig({ relevanceThreshold: 0 }));
    let callCount = 0;

    const adapter = {
      search: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return { success: false, error: "temporary fail" };
        }
        return { success: true, data: { items: [] } };
      }),
    } as unknown as VectorStoreAdapter;

    await injector.inject(adapter); // fail 1
    await injector.inject(adapter); // fail 2
    await injector.inject(adapter); // success → resets counter

    // Now at 0 failures — should work normally
    const result = await injector.inject(adapter);
    expect(result.skipped).toBe(false);
  });

  it("handles unexpected exception gracefully without throwing", async () => {
    const injector = new MemoryContextInjector(makeConfig());
    const adapter = {
      search: vi.fn().mockRejectedValue(new Error("unexpected crash")),
    } as unknown as VectorStoreAdapter;

    const result = await injector.inject(adapter);
    expect(result.skipped).toBe(false);
    expect(result.memoriesInjected).toBe(0);
    expect(result.context).toBe("");
  });
});
