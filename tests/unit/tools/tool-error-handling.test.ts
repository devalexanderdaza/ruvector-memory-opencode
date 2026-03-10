import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/core/plugin.js", () => {
  return {
    initializeMemoryOnFirstOperation: async () => ({ success: true, data: {} }),
    getVectorStoreAdapterForTools: () => ({
      save: async () => {
        throw new Error("boom-save");
      },
      search: async () => {
        throw new Error("boom-search");
      },
    }),
  };
});

import { createMemorySaveTool } from "../../../src/tools/tools/memory-save-tool.js";
import { createMemorySearchTool } from "../../../src/tools/tools/memory-search-tool.js";

describe("tool error handling", () => {
  it("memory_save catches unexpected exceptions and returns structured error", async () => {
    const handler = createMemorySaveTool();
    const result = await handler("hello");
    expect(result).toMatchObject({
      success: false,
      code: "EUNEXPECTED",
      reason: "execution",
    });
  });

  it("memory_search catches unexpected exceptions and returns structured error", async () => {
    const handler = createMemorySearchTool();
    const result = await handler("hello");
    expect(result).toMatchObject({
      success: false,
      code: "EUNEXPECTED",
      reason: "execution",
    });
  });
});
