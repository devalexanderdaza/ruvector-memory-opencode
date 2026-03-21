import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";
import { createVectorStoreAdapter } from "../../../src/vector/vector-store.js";

describe("VectorStoreAdapter.listAll", () => {
  const TEST_ROOT = join(process.cwd(), ".tmp-vector-list");

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it("returns all stored memories including vectors and metadata", async () => {
    const root = join(TEST_ROOT, "success");
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, root);
    await adapter.ensureInitialized();

    const memories = [
      { content: "memory 1", metadata: { tags: ["t1"], confidence: 0.9 } },
      { content: "memory 2", metadata: { tags: ["t2"], source: "test" } },
    ];

    for (const m of memories) {
      await adapter.save(m.content, m.metadata);
    }

    const result = await adapter.listAll();

    expect(result.success).toBe(true);
    if (result.success) {
      // Memory 1, Memory 2, and the bootstrap vector (if initialization.ts still does that)
      // Actually initialization.ts inserts and then deletes a bootstrap vector.
      // So it should be exactly 2.
      expect(result.data.entries).toHaveLength(2);
      
      const m1 = result.data.entries.find((e: any) => e.metadata.content === "memory 1");
      const m2 = result.data.entries.find((e: any) => e.metadata.content === "memory 2");

      expect(m1).toBeDefined();
      if (m1) {
        expect(m1.vector).toBeDefined();
        expect(m1.vector.length).toBe(DEFAULT_CONFIG.vector_dimensions);
        expect(m1.metadata.tags).toContain("t1");
        expect(m1.metadata.confidence).toBe(0.9);
      }

      expect(m2).toBeDefined();
      if (m2) {
        expect(m2.metadata.tags).toContain("t2");
        expect(m2.metadata.source).toBe("test");
      }
    }
  });

  it("returns success with empty entries when database is empty", async () => {
    const root = join(TEST_ROOT, "empty");
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, root);
    await adapter.ensureInitialized();

    const result = await adapter.listAll();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entries).toHaveLength(0);
    }
  });

  it("returns failure when initialization fails", async () => {
    const root = join(TEST_ROOT, "fail");
    mkdirSync(root, { recursive: true });
    // Create a file where a directory should be to force initialization error
    writeFileSync(join(root, ".opencode"), "not-a-dir");

    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, root);
    
    const result = await adapter.listAll();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("ENOTREADY");
    }
  });
});
