import { describe, expect, it } from "vitest";

import { configSchema } from "../../../src/config/config-schema.js";
import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";

describe("DEFAULT_CONFIG", () => {
  it("contains sensible defaults", () => {
    expect(DEFAULT_CONFIG.db_path).toBe(".opencode/ruvector_memory.db");
    expect(DEFAULT_CONFIG.cache_size).toBe(1000);
    expect(DEFAULT_CONFIG.preload_top_memories).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CONFIG.vector_dimensions).toBe(384);
    expect(DEFAULT_CONFIG.similarity_threshold).toBe(0.75);
    expect(DEFAULT_CONFIG.vector_index_type).toBe("hnsw");
    expect(DEFAULT_CONFIG.vector_metric).toBe("cosine");
    expect(DEFAULT_CONFIG.feedback_weight).toBe(0.1);
    expect(DEFAULT_CONFIG.importance_decay).toBe(0.95);
    expect(DEFAULT_CONFIG.backup_retention_days).toBe(7);
    expect(DEFAULT_CONFIG.backup_retention_weeks).toBe(4);
    expect(DEFAULT_CONFIG.backup_retention_months).toBe(12);
  });

  it("is valid against runtime schema", () => {
    expect(() => configSchema.parse(DEFAULT_CONFIG)).not.toThrow();
  });
});
