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
  it("saves and searches with deterministic ranking (cosine distance asc)", async () => {
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
});
