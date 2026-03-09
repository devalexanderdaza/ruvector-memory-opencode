import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/index.js";
import { activatePlugin } from "../../src/core/plugin.js";

const TMP_ROOT = join(process.cwd(), ".tmp-test-workspace");

afterEach(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("plugin activation integration", () => {
  it("activates with zero-config fallback defaults", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });

    const result = await activatePlugin({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
    });

    expect(result.success).toBe(true);

    const config = loadConfig(TMP_ROOT);
    expect(config.db_path).toBe(".opencode/ruvector-memory.db");
  });

  it("activates within performance SLA (<1 second)", async () => {
    mkdirSync(TMP_ROOT, { recursive: true });

    const start = performance.now();
    const result = await activatePlugin({
      projectRoot: TMP_ROOT,
      runtimeNodeVersion: "22.11.0",
    });
    const duration = performance.now() - start;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(1000); // NFR3: <1 second initialization
  });

  it("loads explicit file config and applies it", () => {
    const configDir = join(TMP_ROOT, ".opencode");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "ruvector_memory_config.yaml"),
      "db_path: .opencode/custom.db\ncache_size: 1024\nlog_level: debug\npreload_top_memories: 9\n",
      "utf8",
    );

    const config = loadConfig(TMP_ROOT);

    expect(config.db_path).toBe(".opencode/custom.db");
    expect(config.cache_size).toBe(1024);
    expect(config.log_level).toBe("debug");
    expect(config.preload_top_memories).toBe(9);
  });

  it("fails gracefully with actionable message on old Node", async () => {
    const result = await activatePlugin({ runtimeNodeVersion: "18.19.0" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Current: 18.19.0");
      expect(result.error).toContain("Please upgrade: https://nodejs.org");
    }
  });
});
