import { describe, expect, it } from "vitest";
import { MemoryContextInjector } from "../../../src/tools/memory-context-injector.js";
import { SearchResult } from "../../../src/shared/types.js";

describe("memory-context-injector", () => {
  const config = {
    enablePassiveInjection: true,
    relevanceThreshold: 0.7,
    maxMemoriesToInject: 2,
    maxTokenBudget: 100,
    formattingStyle: "markdown" as const
  };

  const injector = new MemoryContextInjector(config);

  const mockMemories: SearchResult[] = [
    {
      id: "1",
      content: "First memory content",
      relevance: 0.9,
      confidence: 0.8,
      timestamp: "2024-01-01T00:00:00.000Z",
      source: "manual" as const,
      tags: ["tag1"]
    },
    {
      id: "2",
      content: "Second memory content".repeat(50), // Long content for truncation
      relevance: 0.8,
      confidence: 0.7,
      timestamp: "2024-01-02T00:00:00.000Z",
      source: "agent" as const
    },
    {
      id: "3",
      content: "Third memory content",
      relevance: 0.6,
      confidence: 0.5,
      timestamp: "2024-01-03T00:00:00.000Z",
      source: "import" as const
    }
  ];

  it("filters by relevance threshold", () => {
    const filtered = injector.filterByRelevanceThreshold(mockMemories);
    expect(filtered).toHaveLength(2);
    expect(filtered[0]!.id).toBe("1");
    expect(filtered[1]!.id).toBe("2");
  });

  it("truncates long content and respects token budget", () => {
    const selected = injector.selectMemoriesWithinTokenBudget(mockMemories);
    // Budget is 100. First memory is ~20 chars (5 tokens).
    // Second memory is long (500 chars after truncation = 125 tokens).
    // So only the first fits.
    expect(selected).toHaveLength(1);
    expect(selected[0]!.id).toBe("1");
    // Ensure it doesn't mutate original
    expect(mockMemories[1]!.content).toContain("Second memory contentSecond");
  });

  it("formats memory context correctly", () => {
    const formatted = injector.formatMemoryContext([mockMemories[0]!]);
    expect(formatted).toContain("# Relevant Memory Context");
    expect(formatted).toContain("## Memory 1");
    expect(formatted).toContain("**Source:** manual");
    expect(formatted).toContain("**Tags:** tag1");
    expect(formatted).toContain("First memory content");
  });

  it("returns empty string for empty memories list", () => {
    expect(injector.formatMemoryContext([])).toBe("");
  });

  it("handles disabled injection in inject()", async () => {
    const disabledInjector = new MemoryContextInjector({ ...config, enablePassiveInjection: false, formattingStyle: "markdown" });
    const result = await disabledInjector.inject({} as any);
    expect(result.skipped).toBe(true);
    expect(result.context).toBe("");
  });

  it("opens circuit breaker after repeated failures", async () => {
    const failingInjector = new MemoryContextInjector(config);
    const mockAdapter = {
      search: async () => ({ success: false, error: "fail" })
    } as any;

    await failingInjector.inject(mockAdapter);
    await failingInjector.inject(mockAdapter);
    await failingInjector.inject(mockAdapter);

    const result = await failingInjector.inject(mockAdapter);
    expect(result.skipped).toBe(true);
  });
});
