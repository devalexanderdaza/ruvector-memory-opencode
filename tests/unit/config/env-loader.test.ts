import { afterEach, describe, expect, it } from "vitest";

import { loadEnvConfig } from "../../../src/config/env-loader.js";

describe("loadEnvConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns empty object when env vars are missing", () => {
    process.env.RUVECTOR_MEMORY_DB_PATH = undefined;
    process.env.RUVECTOR_MEMORY_CACHE_SIZE = undefined;
    process.env.RUVECTOR_MEMORY_LOG_LEVEL = undefined;
    process.env.RUVECTOR_MEMORY_PRELOAD_TOP = undefined;

    expect(loadEnvConfig()).toEqual({});
  });

  it("maps env vars to config keys", () => {
    process.env.RUVECTOR_MEMORY_DB_PATH = ".opencode/env.db";
    process.env.RUVECTOR_MEMORY_CACHE_SIZE = "256";
    process.env.RUVECTOR_MEMORY_LOG_LEVEL = "warn";
    process.env.RUVECTOR_MEMORY_PRELOAD_TOP = "3";

    expect(loadEnvConfig()).toEqual({
      db_path: ".opencode/env.db",
      cache_size: 256,
      log_level: "warn",
      preload_top_memories: 3,
    });
  });
});
