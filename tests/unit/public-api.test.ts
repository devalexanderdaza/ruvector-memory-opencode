import { describe, expect, it } from "vitest";

import { activatePlugin, deactivatePlugin, getPluginState } from "../../src/index.js";
import { plugin } from "../../src/plugin-manifest.js";

describe("public api", () => {
  it("exports activation functions", () => {
    expect(typeof activatePlugin).toBe("function");
    expect(typeof deactivatePlugin).toBe("function");
    expect(typeof getPluginState).toBe("function");
  });

  it("exposes plugin manifest hooks", () => {
    expect(plugin.name).toBe("ruvector-memory");
    expect(plugin.activate).toBe(activatePlugin);
    expect(plugin.deactivate).toBe(deactivatePlugin);
  });

  it("getPluginState returns degraded status", () => {
    const state = getPluginState();
    expect(state).toHaveProperty("degraded");
    expect(typeof state.degraded).toBe("boolean");
  });
});
