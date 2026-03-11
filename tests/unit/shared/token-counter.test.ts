import { describe, expect, it } from "vitest";

import { estimateTokens, selectWithinTokenBudget } from "../../../src/shared/token-counter.js";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns 1 for 1-4 char string", () => {
    expect(estimateTokens("hi")).toBe(1);
    expect(estimateTokens("hell")).toBe(1);
  });

  it("returns ceil(length / 4) for longer strings", () => {
    expect(estimateTokens("hello")).toBe(2); // ceil(5/4) = 2
    expect(estimateTokens("a".repeat(400))).toBe(100); // 400/4 = 100
    expect(estimateTokens("a".repeat(401))).toBe(101); // ceil(401/4) = 101
  });

  it("handles unicode characters", () => {
    const emoji = "🚀"; // 4 bytes, 2 chars
    expect(estimateTokens(emoji)).toBeGreaterThan(0);
  });
});

describe("selectWithinTokenBudget", () => {
  const make = (content: string) => ({ id: "test", content });

  it("returns empty array for empty input", () => {
    expect(selectWithinTokenBudget([], 100)).toEqual([]);
  });

  it("includes all items when they fit within budget", () => {
    const items = [make("a".repeat(100)), make("b".repeat(100))]; // each 25 tokens
    const result = selectWithinTokenBudget(items, 50);
    expect(result).toHaveLength(2);
  });

  it("stops selecting when token budget would be exceeded", () => {
    const items = [
      make("a".repeat(100)), // 25 tokens → remaining: 25
      make("b".repeat(100)), // 25 tokens > remaining 25... wait 25+25=50, budget is 45
    ];
    const result = selectWithinTokenBudget(items, 45);
    // First item: 25 tokens, remaining = 20. Second item: 25 tokens > 20 → stop
    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe("a".repeat(100));
  });

  it("returns empty when first item exceeds budget", () => {
    const items = [make("a".repeat(1000))]; // 250 tokens > 100
    const result = selectWithinTokenBudget(items, 100);
    expect(result).toHaveLength(0);
  });

  it("preserves item order and custom fields", () => {
    const items = [
      { id: "first", content: "alpha" },
      { id: "second", content: "beta" },
    ];
    const result = selectWithinTokenBudget(items, 100);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("first");
    expect(result[1]?.id).toBe("second");
  });

  it("handles budget of 0 by returning empty array", () => {
    const items = [make("short")];
    const result = selectWithinTokenBudget(items, 0);
    expect(result).toHaveLength(0);
  });
});
