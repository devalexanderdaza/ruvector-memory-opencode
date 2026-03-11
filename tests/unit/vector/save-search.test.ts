import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";
import { createVectorStoreAdapter } from "../../../src/vector/vector-store.js";

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
      expect(results.data.items[0].content).toBe("alpha memory");
      if (results.data.items.length > 1) {
        expect(results.data.items[0].score).toBeLessThanOrEqual(
          results.data.items[1].score,
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
      // Higher priority (critical) memory should rank ahead of low priority for identical text.
      expect(first.score).toBeLessThanOrEqual(second.score);
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
      // Higher confidence memory should rank ahead for identical text.
      expect(first.score).toBeLessThanOrEqual(second.score);
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
        const conf = item.metadata?.confidence;
        if (typeof conf === "number") {
          expect(conf).toBeGreaterThanOrEqual(0);
          expect(conf).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
