import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";
import { createVectorStoreAdapter } from "../../../src/vector/vector-store.js";

const TMP_ROOT = join(process.cwd(), ".tmp-vector-store-tests");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("VectorStoreAdapter", () => {
  it("returns same in-flight initialization result for concurrent calls", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const [first, second] = await Promise.all([
      adapter.ensureInitialized(),
      adapter.ensureInitialized(),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.data.firstRun).toBe(true);
      expect(second.data.firstRun).toBe(true);
    }
  });

  it("returns cached initialized state for subsequent calls", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const first = await adapter.ensureInitialized();
    const third = await adapter.ensureInitialized();

    expect(first.success).toBe(true);
    expect(third.success).toBe(true);
    if (first.success && third.success) {
      expect(first.data.firstRun).toBe(true);
      expect(third.data.firstRun).toBe(false);
      expect(third.data.created).toBe(false);
    }
  });

  it("can be reset for tests", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);
    await adapter.ensureInitialized();

    adapter.resetForTests();

    const result = await adapter.ensureInitialized();
    expect(result.success).toBe(true);
  });

  it("propagates initialization errors as failed results", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, ".opencode"), "not-a-directory", "utf8");

    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);
    const result = await adapter.ensureInitialized();

    expect(result.success).toBe(false);
  });
});
