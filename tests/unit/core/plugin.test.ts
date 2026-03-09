import { describe, expect, it } from "vitest";

import { activatePlugin, getPluginState } from "../../../src/core/plugin.js";

describe("activatePlugin", () => {
  it("activates successfully with Node.js >=22", async () => {
    const result = await activatePlugin({ runtimeNodeVersion: "22.0.0" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.activated).toBe(true);
      expect(result.data.degraded).toBe(false);
    }
  });

  it("returns actionable error with Node.js <22", async () => {
    const result = await activatePlugin({ runtimeNodeVersion: "20.12.0" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("NODE_VERSION_UNSUPPORTED");
      expect(result.error).toContain("requires Node.js >=22.0.0");
      expect(result.error).toContain("Please upgrade: https://nodejs.org");
    }
  });

  it("returns graceful activation error when config validation fails", async () => {
    // Use negative cache_size to trigger Zod validation failure
    process.env.RUVECTOR_MEMORY_CACHE_SIZE = "-100";

    const result = await activatePlugin({ runtimeNodeVersion: "22.1.0" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("RUVECTOR_MEMORY_ERROR");
      expect(result.reason).toBe("activation");
    }

    process.env.RUVECTOR_MEMORY_CACHE_SIZE = undefined;
  });

  it("returns initial degraded state as false", () => {
    const state = getPluginState();
    expect(state.degraded).toBe(false);
  });
});
