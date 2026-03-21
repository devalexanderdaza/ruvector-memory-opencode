import { describe, it, expect, vi } from "vitest";
import { activatePlugin, getDetectedProjectContext, ensureProjectContextForTools, resetPluginStateForTests } from "../../../src/core/plugin.js";
import * as detectProjectContextModule from "../../../src/detection/project-detector.js";

vi.mock("../../../src/detection/project-detector.js", () => ({
  detectProjectContext: vi.fn(),
}));

describe("core/plugin additional branch coverage", () => {
  it("getDetectedProjectContext returns null when activeProjectContext is null", () => {
    resetPluginStateForTests();
    expect(getDetectedProjectContext()).toBeNull();
  });

  it("ensureProjectContextForTools catches error and returns fallback", async () => {
    resetPluginStateForTests();
    vi.mocked(detectProjectContextModule.detectProjectContext).mockRejectedValueOnce(new Error("Fake detect error"));
    
    const result = await ensureProjectContextForTools();
    expect(result.projectName).toBe("unknown-project");
    expect(result.stackSignals).toContain("detection:fallback");
  });

  it("activatePlugin catches background task failures without blocking activation", async () => {
    resetPluginStateForTests();
    vi.mocked(detectProjectContextModule.detectProjectContext).mockRejectedValueOnce(new Error("Background task fail"));
    
    // activatePlugin starts background task (ensureProjectContextForTools inside Promise.all)
    const result = await activatePlugin({});
    
    // should still activate successfully
    expect(result.success).toBe(true);

    // Give it a brief moment for the catch block to execute
    await new Promise(r => setTimeout(r, 10));
  });
});
