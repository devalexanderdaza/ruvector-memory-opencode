import { describe, expect, it } from "vitest";
import { loadEnvConfig } from "../../../src/config/env-loader.js";

describe("env-loader", () => {
  it("normalizes 'undefined' and 'null' strings", () => {
    process.env.RUVECTOR_MEMORY_DB_PATH = "undefined";
    process.env.RUVECTOR_MEMORY_LOG_LEVEL = "null";
    const config = loadEnvConfig();
    expect(config.db_path).toBeUndefined();
    expect(config.log_level).toBeUndefined();
  });

  it("trims whitespace from environment variables", () => {
    process.env.RUVECTOR_MEMORY_DB_PATH = "  /custom/path  ";
    const config = loadEnvConfig();
    expect(config.db_path).toBe("/custom/path");
  });

  it("handles empty or missing environment variables", () => {
    delete process.env.RUVECTOR_MEMORY_DB_PATH;
    delete process.env.RUVECTOR_MEMORY_CACHE_SIZE;
    delete process.env.RUVECTOR_MEMORY_LOG_LEVEL;
    delete process.env.RUVECTOR_MEMORY_PRELOAD_TOP;
    const config = loadEnvConfig();
    expect(config).toEqual({});
  });

  it("validates log level", () => {
    process.env.RUVECTOR_MEMORY_LOG_LEVEL = "invalid";
    const config = loadEnvConfig();
    expect(config.log_level).toBeUndefined();

    process.env.RUVECTOR_MEMORY_LOG_LEVEL = "debug";
    const config2 = loadEnvConfig();
    expect(config2.log_level).toBe("debug");
  });

  it("parses numeric values", () => {
    process.env.RUVECTOR_MEMORY_CACHE_SIZE = "1024";
    process.env.RUVECTOR_MEMORY_PRELOAD_TOP = "50";
    const config = loadEnvConfig();
    expect(config.cache_size).toBe(1024);
    expect(config.preload_top_memories).toBe(50);
  });
});
