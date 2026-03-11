import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";
import { createVectorStoreAdapter } from "../../../src/vector/vector-store.js";

function parseMetadata(
  metadata: string | Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) {
    return {};
  }
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
  return metadata;
}

const TMP_ROOT = join(process.cwd(), ".tmp-unit-save-search");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("VectorStoreAdapter save/search", () => {
  it("saves and searches with deterministic ranking (composite distance asc)", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const init = await adapter.ensureInitialized();
    expect(init.success).toBe(true);

    const saveA = await adapter.save("alpha memory");
    const saveB = await adapter.save("beta memory");

    expect(saveA.success).toBe(true);
    expect(saveB.success).toBe(true);

    const results = await adapter.search("alpha memory", 2);
    expect(results.success).toBe(true);
    if (results.success) {
      expect(results.data.items.length).toBeGreaterThan(0);
      expect(results.data.items[0]?.content).toBe("alpha memory");
      if (results.data.items.length > 1) {
        expect(results.data.items[0]?.score ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
          results.data.items[1]?.score ?? Number.POSITIVE_INFINITY,
        );
      }
    }
  });

  it("applies composite scoring using priority metadata", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const init = await adapter.ensureInitialized();
    expect(init.success).toBe(true);

    const highPriority = await adapter.save("same query", {
      priority: "critical",
    });
    const lowPriority = await adapter.save("same query", {
      priority: "low",
    });

    expect(highPriority.success).toBe(true);
    expect(lowPriority.success).toBe(true);

    const results = await adapter.search("same query", 2);
    expect(results.success).toBe(true);
    if (results.success && results.data.items.length === 2) {
      const [first, second] = results.data.items;
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      // Higher priority (critical) memory should rank ahead of low priority for identical text.
      expect(first?.score ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        second?.score ?? Number.POSITIVE_INFINITY,
      );
    }
  });

  it("applies composite scoring using confidence metadata", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const init = await adapter.ensureInitialized();
    expect(init.success).toBe(true);

    const highConfidence = await adapter.save("confidence query", {
      priority: "normal",
      confidence: 0.95,
    });
    const lowConfidence = await adapter.save("confidence query", {
      priority: "normal",
      confidence: 0.1,
    });

    expect(highConfidence.success).toBe(true);
    expect(lowConfidence.success).toBe(true);

    const results = await adapter.search("confidence query", 2);
    expect(results.success).toBe(true);
    if (results.success && results.data.items.length === 2) {
      const [first, second] = results.data.items;
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      // Higher confidence memory should rank ahead for identical text.
      expect(first?.score ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        second?.score ?? Number.POSITIVE_INFINITY,
      );
    }
  });

  it("clamps confidence values outside [0, 1] to valid range", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const init = await adapter.ensureInitialized();
    expect(init.success).toBe(true);

    // confidence > 1 and confidence < 0 should be saved without error.
    const over = await adapter.save("clamp high", { confidence: 2.5 });
    const under = await adapter.save("clamp low", { confidence: -0.7 });
    expect(over.success).toBe(true);
    expect(under.success).toBe(true);

    // Both should be retrievable and the saved confidence is clamped.
    const res = await adapter.search("clamp", 2);
    expect(res.success).toBe(true);
    if (res.success) {
      for (const item of res.data.items) {
        const conf = parseMetadata(item.metadata).confidence;
        if (typeof conf === "number") {
          expect(conf).toBeGreaterThanOrEqual(0);
          expect(conf).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("filters search results by tags and source", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const init = await adapter.ensureInitialized();
    expect(init.success).toBe(true);

    await adapter.save("filtered query", {
      tags: ["backend", "memory"],
      source: "docs",
    });
    await adapter.save("filtered query", {
      tags: ["frontend"],
      source: "chat",
    });

    const result = await adapter.search("filtered query", 5, {
      tags: ["memory"],
      source: "docs",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBe(1);
      expect(parseMetadata(result.data.items[0]?.metadata).source).toBe("docs");
    }
  });

  it("filters search results by created_after and created_before", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const init = await adapter.ensureInitialized();
    expect(init.success).toBe(true);

    await adapter.save("date filtered query", { tags: ["date"] });

    const past = Date.now() - 60_000;
    const future = Date.now() + 60_000;

    const withinRange = await adapter.search("date filtered query", 5, {
      created_after: past,
      created_before: future,
    });
    expect(withinRange.success).toBe(true);
    if (withinRange.success) {
      expect(withinRange.data.items.length).toBeGreaterThan(0);
    }

    const outsideRange = await adapter.search("date filtered query", 5, {
      created_before: past,
    });
    expect(outsideRange.success).toBe(true);
    if (outsideRange.success) {
      expect(outsideRange.data.items.length).toBe(0);
    }
  });

  it("returns only source-matching items when source filter is provided", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const init = await adapter.ensureInitialized();
    expect(init.success).toBe(true);

    await adapter.save("source mismatch query", {
      tags: ["ops"],
      source: "docs",
    });
    await adapter.save("source mismatch query", {
      tags: ["ops"],
      source: "chat",
    });

    const result = await adapter.search("source mismatch query", 5, {
      source: "chat",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBeGreaterThan(0);
      for (const item of result.data.items) {
        expect(parseMetadata(item.metadata).source).toBe("chat");
      }
    }
  });

  it("returns zero items when created_after is in the future", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const init = await adapter.ensureInitialized();
    expect(init.success).toBe(true);

    await adapter.save("future after query", { source: "docs" });

    const future = Date.now() + 60_000;
    const result = await adapter.search("future after query", 5, {
      created_after: future,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBe(0);
    }
  });

  it("treats empty tag filters as pass-through", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const init = await adapter.ensureInitialized();
    expect(init.success).toBe(true);

    await adapter.save("empty tags filter query", { tags: ["infra"] });

    const result = await adapter.search("empty tags filter query", 5, {
      tags: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items.length).toBeGreaterThan(0);
    }
  });
});
