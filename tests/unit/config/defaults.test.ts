import { describe, expect, it } from "vitest";

import { configSchema } from "../../../src/config/config-schema.js";
import { DEFAULT_CONFIG } from "../../../src/config/defaults.js";

describe("DEFAULT_CONFIG", () => {
  it("contains sensible defaults", () => {
    expect(DEFAULT_CONFIG.db_path).toBe(".opencode/ruvector-memory.db");
    expect(DEFAULT_CONFIG.cache_size).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.preload_top_memories).toBeGreaterThanOrEqual(0);
  });

  it("is valid against runtime schema", () => {
    expect(() => configSchema.parse(DEFAULT_CONFIG)).not.toThrow();
  });
});
