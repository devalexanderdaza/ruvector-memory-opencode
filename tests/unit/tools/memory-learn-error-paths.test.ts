/**
 * Error-path coverage tests for memory_learn_from_feedback.
 *
 * Tests scenarios that require plugin to NOT be activated, or
 * use direct VectorStoreAdapter mocking for persistence-level errors.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryLearnTool } from "../../../src/tools/tools/memory-learn-tool.js";
import * as pluginModule from "../../../src/core/plugin.js";

const TMP_ROOT = join(process.cwd(), ".tmp-unit-learn-error-paths");

afterEach(() => {
  vi.restoreAllMocks();
  pluginModule.resetPluginStateForTests();
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("memory_learn_from_feedback – error path coverage", () => {
  it("returns error when plugin is not activated", async () => {
    // No plugin.activate() called — plugin state is reset.
    const tool = createMemoryLearnTool();
    const result = await tool({
      memory_id: "any-id",
      feedback_type: "helpful",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Without activation, init will fail with PLUGIN_NOT_ACTIVATED.
      expect(result.error).toBeDefined();
    }
  });

  it("returns ENOTREADY when getVectorStoreAdapterForTools returns null after init mock", async () => {
    // Mock initializeMemoryOnFirstOperation to succeed
    const initSpy = vi
      .spyOn(pluginModule, "initializeMemoryOnFirstOperation")
      .mockResolvedValueOnce({
        success: true,
        data: {
          firstRun: false,
          created: false,
          dbPath: "/fake",
          initializationMs: 1,
          databaseSize: 0,
        },
      });

    // Mock getVectorStoreAdapterForTools to return null
    const getSpy = vi
      .spyOn(pluginModule, "getVectorStoreAdapterForTools")
      .mockReturnValueOnce(null);

    const tool = createMemoryLearnTool();
    const result = await tool({
      memory_id: "any-id",
      feedback_type: "helpful",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("ENOTREADY");
      expect(result.reason).toBe("activation");
    }

    initSpy.mockRestore();
    getSpy.mockRestore();
  });

  it("returns init error when initializeMemoryOnFirstOperation fails", async () => {
    const initSpy = vi
      .spyOn(pluginModule, "initializeMemoryOnFirstOperation")
      .mockResolvedValueOnce({
        success: false,
        error: "DB initialization failed",
        code: "DB_INIT_FAILED",
        reason: "initialization",
      });

    const tool = createMemoryLearnTool();
    const result = await tool({
      memory_id: "any-id",
      feedback_type: "helpful",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("initialization");
    }

    initSpy.mockRestore();
  });

  it("returns persistence error when updateMetadata fails", async () => {
    const fakeStore = {
      getById: vi.fn().mockResolvedValueOnce({
        success: true,
        data: {
          id: "fake-id",
          score: 0,
          content: "fake content",
          metadata: {
            confidence: 0.5,
            positiveFeedbackCount: 0,
            negativeFeedbackCount: 0,
            accessCount: 0,
          },
        },
      }),
      updateMetadata: vi.fn().mockResolvedValueOnce({
        success: false,
        error: "Disk full",
        code: "EUNEXPECTED",
        reason: "io",
      }),
      save: vi.fn(),
      search: vi.fn(),
      ensureInitialized: vi.fn(),
      resetForTests: vi.fn(),
    };

    const initSpy = vi
      .spyOn(pluginModule, "initializeMemoryOnFirstOperation")
      .mockResolvedValueOnce({
        success: true,
        data: {
          firstRun: false,
          created: false,
          dbPath: "/fake",
          initializationMs: 1,
          databaseSize: 0,
        },
      });

    const getSpy = vi
      .spyOn(pluginModule, "getVectorStoreAdapterForTools")
      .mockReturnValueOnce(fakeStore as any);

    const tool = createMemoryLearnTool();
    const result = await tool({
      memory_id: "fake-id",
      feedback_type: "helpful",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("persistence");
    }

    initSpy.mockRestore();
    getSpy.mockRestore();
  });
});
