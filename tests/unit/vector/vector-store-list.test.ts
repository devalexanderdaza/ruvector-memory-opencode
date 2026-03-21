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

  it("returns failure when full enumeration is incomplete", async () => {
    const root = join(TEST_ROOT, "incomplete");
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, root) as any;

    adapter.lastInitResult = {
      success: true,
      data: {
        firstRun: false,
        created: false,
        dbPath: "mock",
        initializationMs: 1,
        databaseSize: 0,
      },
    };

    adapter.db = {
      len: async () => 3,
      search: async () => [{ id: "a", score: 0.1 }],
      get: async (id: string) => ({ id, vector: [0.1, 0.2], metadata: JSON.stringify({ content: id }) }),
      insert: async () => "ignored",
    };

    const result = await adapter.listAll();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("LIST_ALL_INCOMPLETE");
      expect(result.reason).toBe("retrieval");
    }
  });

  it("recovers full enumeration after multiple probe searches", async () => {
    const root = join(TEST_ROOT, "multi-probe");
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, root) as any;

    adapter.lastInitResult = {
      success: true,
      data: {
        firstRun: false,
        created: false,
        dbPath: "mock",
        initializationMs: 1,
        databaseSize: 0,
      },
    };

    let callCount = 0;
    adapter.db = {
      len: async () => 3,
      search: async () => {
        callCount += 1;
        if (callCount === 1) {
          return [{ id: "b", score: 0.2 }];
        }
        return [
          { id: "a", score: 0.1 },
          { id: "b", score: 0.2 },
          { id: "c", score: 0.3 },
        ];
      },
      get: async (id: string) => ({ id, vector: [0.1, 0.2], metadata: JSON.stringify({ content: id }) }),
      insert: async () => "ignored",
    };

    const result = await adapter.listAll();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entries.map((e: any) => e.id)).toEqual(["a", "b", "c"]);
    }
    expect(callCount).toBeGreaterThan(1);
  });

  it("returns LIST_ALL_FAILED when db operations throw", async () => {
    const root = join(TEST_ROOT, "throws");
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, root) as any;

    adapter.lastInitResult = {
      success: true,
      data: {
        firstRun: false,
        created: false,
        dbPath: "mock",
        initializationMs: 1,
        databaseSize: 0,
      },
    };

    adapter.db = {
      len: async () => {
        throw new Error("len-failed");
      },
      search: async () => [],
      get: async () => null,
      insert: async () => "ignored",
    };

    const result = await adapter.listAll();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("LIST_ALL_FAILED");
      expect(result.error).toContain("len-failed");
    }
  });
});
