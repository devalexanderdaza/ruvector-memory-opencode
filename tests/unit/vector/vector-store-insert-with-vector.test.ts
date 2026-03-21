import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";
import { createVectorStoreAdapter } from "../../../src/vector/vector-store.js";

const TMP_ROOT = join(process.cwd(), ".tmp-insert-with-vector-tests");
const DIMS = DEFAULT_CONFIG.vector_dimensions; // 384

function makeVector(seed = 1): Float32Array {
  const vec = new Float32Array(DIMS);
  for (let i = 0; i < DIMS; i += 1) {
    vec[i] = ((seed * (i + 1)) % 100) / 100;
  }
  return vec;
}

beforeEach(() => {
  mkdirSync(TMP_ROOT, { recursive: true });
});

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("VectorStoreAdapter.insertWithVector", () => {
  it("successfully inserts an entry with a Float32Array vector", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const result = await adapter.insertWithVector(
      "import-id-1",
      makeVector(1),
      { content: "imported content", source: "import", confidence: 0.9 },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("import-id-1");
    }
  });

  it("successfully inserts when vector is provided as number[]", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    // Pass as plain number[] — should be converted to Float32Array internally
    const numberArray = Array.from(makeVector(2));
    const result = await adapter.insertWithVector(
      "import-num-array",
      numberArray,
      { content: "number array content", source: "import" },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("import-num-array");
    }
  });

  it("makes inserted memory retrievable via getById", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const importedMeta = {
      content: "importable memory",
      source: "import",
      confidence: 0.75,
      tags: ["ts", "architecture"],
    };

    await adapter.insertWithVector("retrieve-test", makeVector(3), importedMeta);

    const result = await adapter.getById("retrieve-test");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("retrieve-test");
      expect(result.data.content).toBe("importable memory");
      const meta = result.data.metadata as Record<string, unknown>;
      expect(meta.source).toBe("import");
      expect(meta.confidence).toBe(0.75);
      expect(meta.tags).toEqual(["ts", "architecture"]);
    }
  });

  it("preserves all metadata fields including feedbackHistory and patternKey", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    const richMeta = {
      content: "rich imported memory",
      source: "import",
      confidence: 0.85,
      feedbackHistory: "helpful;helpful;incorrect",
      patternKey: "pattern-7",
      hasSecretPattern: false,
      accessCount: 10,
    };

    await adapter.insertWithVector("rich-meta-test", makeVector(4), richMeta);

    const retrieved = await adapter.getById("rich-meta-test");
    expect(retrieved.success).toBe(true);
    if (retrieved.success) {
      const meta = retrieved.data.metadata as Record<string, unknown>;
      expect(meta.feedbackHistory).toBe("helpful;helpful;incorrect");
      expect(meta.patternKey).toBe("pattern-7");
      expect(meta.hasSecretPattern).toBe(false);
      expect(meta.accessCount).toBe(10);
    }
  });

  it("supports upsert by id (inserts if new, replaces if existing)", async () => {
    const adapter = createVectorStoreAdapter(DEFAULT_CONFIG, TMP_ROOT);

    // Insert original
    await adapter.insertWithVector("upsert-id", makeVector(5), {
      content: "original",
      source: "import",
    });

    // Upsert (overwrite) with same id
    await adapter.insertWithVector("upsert-id", makeVector(6), {
      content: "updated",
      source: "import",
    });

    const result = await adapter.getById("upsert-id");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe("updated");
    }
  });

  it("returns ENOTREADY when the database directory is not creatable", async () => {
    // Create a file at the path a directory is expected — makes DB init fail.
    const blockingPath = join(TMP_ROOT, "blocked-project");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(blockingPath, "blocking file", "utf8");

    const badAdapter = createVectorStoreAdapter(DEFAULT_CONFIG, blockingPath);

    const result = await badAdapter.insertWithVector(
      "fail-id",
      makeVector(7),
      { content: "fail" },
    );

    // Plugin can't initialize when dir is a file → should fail or not-ready
    expect(result.success).toBe(false);
  });
});
