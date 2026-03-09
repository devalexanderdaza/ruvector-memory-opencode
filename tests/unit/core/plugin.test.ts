import { describe, expect, it } from "vitest";

import { activatePlugin } from "../../../src/core/plugin.js";

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
    process.env.RUVECTOR_MEMORY_LOG_LEVEL = "invalid-level";

    const result = await activatePlugin({ runtimeNodeVersion: "22.1.0" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("RUVECTOR_MEMORY_ERROR");
      expect(result.reason).toBe("activation");
    }

    process.env.RUVECTOR_MEMORY_LOG_LEVEL = undefined;
  });
});
