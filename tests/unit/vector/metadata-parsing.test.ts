import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";
import { embedTextDeterministic } from "../../../src/shared/utils.js";
import { createVectorStoreAdapter } from "../../../src/vector/vector-store.js";

const TMP_ROOT = join(process.cwd(), ".tmp-unit-metadata-parsing");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("VectorStoreAdapter metadata parsing", () => {
  it("handles non-JSON metadata strings without throwing", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);
    const init = await adapter.ensureInitialized();
    expect(init.success).toBe(true);
    if (!init.success) return;

    const { VectorDb } = await import("@ruvector/core");
    const storagePath = resolve(TMP_ROOT, DEFAULT_CONFIG.db_path);
    const db = new VectorDb({
      dimensions: DEFAULT_CONFIG.vector_dimensions,
      storagePath,
      distanceMetric: "Cosine",
    });

    await db.insert({
      vector: embedTextDeterministic("weird", DEFAULT_CONFIG.vector_dimensions),
      metadata: "not-json-metadata",
    } as any);

    const results = await adapter.search("weird", 5);
    expect(results.success).toBe(true);
    if (results.success) {
      // Should not crash, and metadata may be undefined due to parse failure.
      expect(results.data.items.length).toBeGreaterThan(0);
    }
  });
});
