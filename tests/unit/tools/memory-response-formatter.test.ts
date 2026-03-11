import { describe, it, expect } from "vitest";
import { formatSearchResults } from "../../../src/tools/memory-response-formatter.js";

describe("Memory Response Formatter", () => {
  describe("formatSearchResults", () => {
    it("formats single result correctly", () => {
      const input = {
        items: [
          {
            id: "mem-123",
            score: 0.1,
            content: "Best practice for error handling",
            metadata: JSON.stringify({
              content: "Best practice for error handling",
              created_at: "2026-03-10T00:00:00Z",
              source: "manual",
              tags: ["patterns", "typescript"],
              importance: 4,
              accessCount: 5,
              positiveFeedbackCount: 2,
              negativeFeedbackCount: 0,
              projectContext: "ruvector-memory-opencode",
              projectName: "ruvector-memory-opencode",
              projectType: "node-package",
              primaryLanguage: "typescript",
              frameworks: ["react"],
            }),
          },
        ],
      };

      const result = formatSearchResults(input as any, "error handling", 50);

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.results).toHaveLength(1);

      const item = result.results[0];
      expect(item?.id).toBe("mem-123");
      expect(item?.content).toBe("Best practice for error handling");
      expect(item?.timestamp).toBe("2026-03-10T00:00:00Z");
      expect(item?.source).toBe("manual");
      expect(item?.tags).toEqual(["patterns", "typescript"]);
      expect(item?.importance).toBe(4);
      expect(item?.projectContext).toBe("ruvector-memory-opencode");
      expect(item?.projectName).toBe("ruvector-memory-opencode");
      expect(item?.projectType).toBe("node-package");
      expect(item?.primaryLanguage).toBe("typescript");
      expect(item?.frameworks).toEqual(["react"]);
      expect(item?.relevance).toBeCloseTo(0.9);
      expect(item?.confidence).toBeCloseTo(0.75);
    });

    it("sorts results by relevance descending", () => {
      const input = {
        items: [
          {
            id: "mem-1",
            score: 0.5,
            metadata: JSON.stringify({ created_at: "2026-03-10T00:00:00Z", source: "manual" }),
          },
          {
            id: "mem-2",
            score: 0.1,
            metadata: JSON.stringify({ created_at: "2026-03-10T00:00:00Z", source: "manual" }),
          },
          {
            id: "mem-3",
            score: 0.3,
            metadata: JSON.stringify({ created_at: "2026-03-10T00:00:00Z", source: "manual" }),
          },
        ],
      };

      const result = formatSearchResults(input as any, "query");

      expect(result.results[0]?.id).toBe("mem-2");
      expect(result.results[1]?.id).toBe("mem-3");
      expect(result.results[2]?.id).toBe("mem-1");
    });

    it("ranks boosted entry (negative composite score) above non-boosted entry", () => {
      // A priority/recency boost can push the composite distance below zero.
      // score -0.2 (boosted) → relevance = min(1, 1-(-0.2)) = 1.0  ← should rank first
      // score  0.1 (normal)  → relevance = 1 - 0.1 = 0.9           ← should rank second
      // The old Math.abs implementation gave the boosted entry 0.8 (wrongly behind 0.9).
      const input = {
        items: [
          {
            id: "mem-normal",
            score: 0.1,
            metadata: JSON.stringify({ created_at: "2026-03-10T00:00:00Z", source: "manual" }),
          },
          {
            id: "mem-boosted",
            score: -0.2,
            metadata: JSON.stringify({ created_at: "2026-03-10T00:00:00Z", source: "manual" }),
          },
        ],
      };

      const result = formatSearchResults(input as any, "boosted-test");

      expect(result.results[0]?.id).toBe("mem-boosted");
      expect(result.results[0]?.relevance).toBe(1.0);
      expect(result.results[1]?.id).toBe("mem-normal");
      expect(result.results[1]?.relevance).toBeCloseTo(0.9);
    });

    it("handles empty results", () => {
      const input = { items: [] };
      const result = formatSearchResults(input as any, "query");

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.results).toEqual([]);
    });

    it("handles missing optional fields with defaults", () => {
      const input = {
        items: [
          {
            id: "mem-simple",
            score: 0.2,
            metadata: JSON.stringify({ created_at: "2026-03-10T12:00:00Z" }),
          },
        ],
      };

      const result = formatSearchResults(input as any, "test");
      const item = result.results[0];

      expect(item?.source).toBe("manual");
      expect(item?.tags).toBeUndefined();
      expect(item?.importance).toBeUndefined();
      expect(item?.projectContext).toBeUndefined();
      // frameworks is undefined when metadata has no frameworks field at all
      expect(item?.frameworks).toBeUndefined();
    });

    it("preserves empty frameworks array when metadata has frameworks: []", () => {
      // An empty array means 'detected, no known frameworks' which is distinct
      // from undefined ('metadata absent'). The formatter must not drop it.
      const input = {
        items: [
          {
            id: "mem-no-fw",
            score: 0.2,
            metadata: JSON.stringify({
              created_at: "2026-03-10T00:00:00Z",
              source: "agent",
              frameworks: [],
            }),
          },
        ],
      };

      const result = formatSearchResults(input as any, "empty-fw");
      const item = result.results[0];

      expect(item?.frameworks).toBeDefined();
      expect(item?.frameworks).toEqual([]);
    });

    it("preserves ISO-8601 timestamp from metadata", () => {
      const isoTimestamp = "2026-01-15T14:30:45Z";
      const input = {
        items: [
          {
            id: "mem-ts",
            score: 0.1,
            metadata: JSON.stringify({ created_at: isoTimestamp, source: "agent" }),
          },
        ],
      };

      const result = formatSearchResults(input as any);
      expect(result.results[0]?.timestamp).toBe(isoTimestamp);
    });

    it("converts numeric timestamp to ISO-8601", () => {
      const epochMs = 1678474245000;
      const input = {
        items: [
          {
            id: "mem-epoch",
            score: 0.1,
            metadata: JSON.stringify({ created_at: epochMs, source: "import" }),
          },
        ],
      };

      const result = formatSearchResults(input as any);
      const timestamp = result.results[0]?.timestamp;

      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(new Date(timestamp || "")).toBeInstanceOf(Date);
    });

    it("validates source enum values", () => {
      const input = {
        items: [
          {
            id: "mem-invalid-source",
            score: 0.1,
            metadata: JSON.stringify({
              created_at: "2026-03-10T00:00:00Z",
              source: "invalid_source_value",
            }),
          },
        ],
      };

      const result = formatSearchResults(input as any);
      expect(result.results[0]?.source).toBe("manual");
    });

    it("filters and cleans tags", () => {
      const input = {
        items: [
          {
            id: "mem-tags",
            score: 0.1,
            metadata: JSON.stringify({
              created_at: "2026-03-10T00:00:00Z",
              source: "manual",
              tags: ["valid-tag", "", "  ", "another-tag", 123, null],
            }),
          },
        ],
      };

      const result = formatSearchResults(input as any);
      expect(result.results[0]?.tags).toEqual(["valid-tag", "another-tag"]);
    });

    it("validates importance range [1-5]", () => {
      const input1 = {
        items: [
          {
            id: "mem-low",
            score: 0.1,
            metadata: JSON.stringify({
              created_at: "2026-03-10T00:00:00Z",
              source: "manual",
              importance: 1,
            }),
          },
        ],
      };

      const result1 = formatSearchResults(input1 as any);
      expect(result1.results[0]?.importance).toBe(1);

      const input2 = {
        items: [
          {
            id: "mem-invalid-importance",
            score: 0.1,
            metadata: JSON.stringify({
              created_at: "2026-03-10T00:00:00Z",
              source: "manual",
              importance: 10,
            }),
          },
        ],
      };

      const result2 = formatSearchResults(input2 as any);
      expect(result2.results[0]?.importance).toBeUndefined();
    });

    it("includes metadata (_meta) in response", () => {
      const query = "test query";
      const latency = 125;
      const input = { items: [] };

      const result = formatSearchResults(input as any, query, latency);

      expect(result._meta).toBeDefined();
      expect(result._meta?.query).toBe(query);
      expect(result._meta?.queryLatencyMs).toBe(latency);
      expect(result._meta?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("handles malformed metadata gracefully", () => {
      const input = { items: [{ id: "mem-malformed", score: 0.1, metadata: "invalid json {{{" }] };

      const result = formatSearchResults(input as any);

      expect(result.success).toBe(true);
      expect(result.results[0]?.source).toBe("manual");
    });

    it("throws on malformed search results structure", () => {
      expect(() => {
        formatSearchResults(null as any);
      }).toThrow();

      expect(() => {
        formatSearchResults({} as any);
      }).toThrow();
    });

    it("calculates confidence correctly with feedback", () => {
      const input = {
        items: [
          {
            id: "mem-high-confidence",
            score: 0.05,
            metadata: JSON.stringify({
              created_at: "2026-03-10T00:00:00Z",
              source: "agent",
              accessCount: 10,
              positiveFeedbackCount: 8,
              negativeFeedbackCount: 2,
            }),
          },
        ],
      };

      const result = formatSearchResults(input as any);
      const confidence = result.results[0]?.confidence;

      expect(confidence).toBeCloseTo(0.8);
    });

    it("handles multiple results with different metadata", () => {
      const input = {
        items: [
          {
            id: "mem-a",
            score: 0.2,
            metadata: JSON.stringify({
              created_at: "2026-03-10T00:00:00Z",
              source: "manual",
              tags: ["pattern"],
            }),
          },
          {
            id: "mem-b",
            score: 0.1,
            metadata: JSON.stringify({
              created_at: "2026-03-09T00:00:00Z",
              source: "import",
              importance: 5,
            }),
          },
          {
            id: "mem-c",
            score: 0.15,
            metadata: JSON.stringify({ created_at: "2026-03-11T00:00:00Z", source: "agent" }),
          },
        ],
      };

      const result = formatSearchResults(input as any, "multi-test");

      expect(result.count).toBe(3);
      expect(result.results[0]?.id).toBe("mem-b");
      expect(result.results[1]?.id).toBe("mem-c");
      expect(result.results[2]?.id).toBe("mem-a");
    });
  });
});
