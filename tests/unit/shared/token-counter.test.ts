import { describe, expect, it } from "vitest";
import { estimateTokens, selectWithinTokenBudget } from "../../../src/shared/token-counter.js";

describe("token-counter", () => {
  it("estimates tokens correctly for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("ceil estimate for text length not divisible by 4", () => {
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("selectWithinTokenBudget handles zero budget", () => {
    const items = [{ content: "content" }];
    expect(selectWithinTokenBudget(items, 0)).toEqual([]);
    expect(selectWithinTokenBudget(items, -1)).toEqual([]);
  });

  it("selectWithinTokenBudget greedy stops before exceeding budget", () => {
    const items = [
      { id: 1, content: "1234" }, // 1 token
      { id: 2, content: "12341234" }, // 2 tokens
      { id: 3, content: "123412341234" } // 3 tokens
    ];

    // Budget of 2 should take (id:1) and skip (id:2)
    // Wait, adding id:2 would be (1 + 2) = 3 which is > 2.
    // Result should be only (id:1).
    expect(selectWithinTokenBudget(items, 2)).toEqual([{ id: 1, content: "1234" }]);

    // Budget of 3 should take (id:1) and (id:2)
    const result = selectWithinTokenBudget(items, 3);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(1);
    expect(result[1]!.id).toBe(2);
  });
});
