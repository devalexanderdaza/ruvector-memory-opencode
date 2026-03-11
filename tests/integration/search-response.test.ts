import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { plugin } from "../../src/plugin-manifest.js";

const TMP_ROOT = join(process.cwd(), ".tmp-search-response-tests");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("Search Response Contract (Story 2.4)", () => {
  async function setup() {
    const registered: Record<string, (input?: unknown) => Promise<any>> = {};
    const activation = await plugin.activate({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
      toolRegistry: {
        registerTool(name: string, handler: (input?: unknown) => Promise<any>) {
          registered[name] = handler;
        },
      },
    });
    expect(activation.success).toBe(true);
    return {
      memorySave: registered["memory_save"]!,
      memorySearch: registered["memory_search"]!,
    };
  }

  it("Task 8.1.3 — response includes all required fields from contract", async () => {
    const { memorySave, memorySearch } = await setup();

    await memorySave({
      content: "TypeScript strict null checks prevent runtime errors",
      tags: ["typescript", "best-practices"],
      source: "manual",
      priority: "critical",
      confidence: 0.9,
    });

    const response = await memorySearch({ query: "TypeScript null checks", limit: 5 });

    expect(response.success).toBe(true);
    expect(response.data.results.length).toBeGreaterThan(0);

    const item = response.data.results[0];

    // All required fields must be present
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("content");
    expect(item).toHaveProperty("relevance");
    expect(item).toHaveProperty("confidence");
    expect(item).toHaveProperty("timestamp");
    expect(item).toHaveProperty("source");

    // Content should be the original text
    expect(typeof item.content).toBe("string");
    expect(item.content.length).toBeGreaterThan(0);

    // Source should be a valid enum value
    expect(["manual", "agent", "import"]).toContain(item.source);

    // ID should be a non-empty string
    expect(typeof item.id).toBe("string");
    expect(item.id.length).toBeGreaterThan(0);
  });

  it("Task 8.1.4 — relevance score is present and within bounds [0, 1]", async () => {
    const { memorySave, memorySearch } = await setup();

    await memorySave("relevance test: vector search scoring");
    await memorySave("unrelated content about cooking recipes");

    const response = await memorySearch({ query: "vector search scoring", limit: 5 });

    expect(response.success).toBe(true);
    expect(response.data.results.length).toBeGreaterThan(0);

    for (const item of response.data.results) {
      expect(typeof item.relevance).toBe("number");
      expect(item.relevance).toBeGreaterThanOrEqual(0);
      expect(item.relevance).toBeLessThanOrEqual(1.0);
      expect(Number.isFinite(item.relevance)).toBe(true);
    }

    // Results must be ordered by relevance descending
    for (let i = 1; i < response.data.results.length; i++) {
      expect(response.data.results[i - 1].relevance).toBeGreaterThanOrEqual(
        response.data.results[i].relevance,
      );
    }
  });

  it("Task 8.1.5 — confidence is present and within bounds [-1, 1]", async () => {
    const { memorySave, memorySearch } = await setup();

    await memorySave({
      content: "confidence bounds integration test",
      source: "agent",
    });

    const response = await memorySearch("confidence bounds integration test");

    expect(response.success).toBe(true);
    expect(response.data.results.length).toBeGreaterThan(0);

    for (const item of response.data.results) {
      expect(typeof item.confidence).toBe("number");
      expect(item.confidence).toBeGreaterThanOrEqual(-1.0);
      expect(item.confidence).toBeLessThanOrEqual(1.0);
      expect(Number.isFinite(item.confidence)).toBe(true);
    }
  });

  it("Task 8.1.6 — timestamp is valid ISO-8601", async () => {
    const { memorySave, memorySearch } = await setup();

    await memorySave("timestamp contract test");

    const response = await memorySearch("timestamp contract test");

    expect(response.success).toBe(true);
    expect(response.data.results.length).toBeGreaterThan(0);

    for (const item of response.data.results) {
      expect(typeof item.timestamp).toBe("string");
      // Must match ISO-8601 pattern
      expect(item.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      // Must be parseable as a valid Date
      const parsed = new Date(item.timestamp);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
      // Must be a reasonable date (not epoch 0 or future > 1 year)
      expect(parsed.getFullYear()).toBeGreaterThanOrEqual(2020);
    }
  });

  it("optional fields are preserved when saved", async () => {
    const { memorySave, memorySearch } = await setup();

    await memorySave({
      content: "optional fields preservation test",
      tags: ["tag-a", "tag-b"],
      priority: "critical",
    });

    const response = await memorySearch("optional fields preservation test");

    expect(response.success).toBe(true);
    const item = response.data.results[0];

    // Tags passed through
    expect(Array.isArray(item.tags)).toBe(true);
    expect(item.tags).toContain("tag-a");
    expect(item.tags).toContain("tag-b");
  });

  it("_meta includes query, timestamp, and latency", async () => {
    const { memorySearch } = await setup();

    const response = await memorySearch({ query: "meta fields test", limit: 3 });

    expect(response.success).toBe(true);
    expect(response.data._meta).toBeDefined();
    expect(response.data._meta.query).toBe("meta fields test");
    expect(response.data._meta.queryLatencyMs).toBeGreaterThanOrEqual(0);
    expect(response.data._meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
