import { describe, expect, it } from "vitest";
import { formatSearchResults } from "../../../src/tools/memory-response-formatter.js";
import { MemorySearchResult } from "../../../src/shared/types.js";

describe("memory-response-formatter", () => {
  it("returns empty success response for missing items array", () => {
    const missingItems = formatSearchResults({} as any);
    const nullItems = formatSearchResults({ items: null } as any);
    expect(missingItems.results).toEqual([]);
    expect(missingItems.count).toBe(0);
    expect(nullItems.results).toEqual([]);
    expect(nullItems.count).toBe(0);
  });

  it("handles malformed metadata in formatSearchResult with fallbacks", () => {
    const raw: MemorySearchResult = {
      items: [
        {
          id: "1",
          score: 0.1,
          metadata: {
            content: 123, // not string
            created_at: "not-a-date",
            source: "invalid",
            tags: ["  valid  ", "   ", 123],
            frameworks: ["react", 123],
            mergedIntoId: "2"
          }
        }
      ]
    };

    const formatted = formatSearchResults(raw, "query", 50);
    const result = formatted.results[0]!;

    expect(result.id).toBe("1");
    expect(result.content).toBe(""); // Falls back to empty string
    expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0); // Fallback to current time
    expect(result.source).toBe("manual"); // Fallback
    expect(result.tags).toEqual(["valid"]);
    expect(result.frameworks).toEqual(["react"]);
    expect(result.mergedIntoId).toBe("2");
    expect(result.relevance).toBe(0.9);
    expect(formatted._meta!.queryLatencyMs).toBe(50);
  });

  it("handles JSON string metadata", () => {
    const raw: MemorySearchResult = {
      items: [
        {
          id: "json-test",
          score: 0,
          metadata: JSON.stringify({ content: "Found me", source: "agent" })
        }
      ]
    };

    const result = formatSearchResults(raw).results[0]!;
    expect(result.content).toBe("Found me");
    expect(result.source).toBe("agent");
  });

  it("handles numeric importance correctly", () => {
     const raw: MemorySearchResult = {
      items: [
        {
          id: "imp-test",
          score: 0,
          metadata: { importance: 4 }
        }
      ]
    };
    const result = formatSearchResults(raw).results[0]!;
    expect(result.importance).toBe(4);
  });

  it("handles various project and language fields", () => {
    const raw: MemorySearchResult = {
      items: [
        {
          id: "fields-test",
          score: 0,
          metadata: {
            projectContext: "context",
            projectName: "pname",
            projectType: "ptype",
            primaryLanguage: "plang"
          }
        }
      ]
    };
    const result = formatSearchResults(raw).results[0]!;
    expect(result.projectContext).toBe("context");
    expect(result.projectName).toBe("pname");
    expect(result.projectType).toBe("ptype");
    expect(result.primaryLanguage).toBe("plang");
  });
});
