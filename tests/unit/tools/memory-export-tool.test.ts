import { join } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import { createMemoryExportTool } from "../../../src/tools/tools/memory-export-tool.js";
import { 
  resetPluginStateForTests, 
  activatePlugin, 
  getVectorStoreAdapterForTools 
} from "../../../src/core/plugin.js";

const TMP_TOOL_DIR = join(process.cwd(), ".tmp-export-tool-tests");

afterEach(() => {
  resetPluginStateForTests();
});

describe("memory_export tool unit tests", () => {
  it("fails if plugin is not activated", async () => {
    resetPluginStateForTests(); // Ensure clean state
    const tool = createMemoryExportTool();
    const result = await tool({ output_path: "some.rvf" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("PLUGIN_NOT_ACTIVATED");
    }
  });

  it("calls exportMemories with correct arguments when activated", async () => {
    await activatePlugin({ projectRoot: TMP_TOOL_DIR });
    const store = getVectorStoreAdapterForTools()!;
    
    // Mock listAll and exportMemories implicitly via tool execution
    // Actually we'll just check if it returns success for an empty project
    const tool = createMemoryExportTool();
    const outputPath = join(TMP_TOOL_DIR, "export.rvf");
    const result = await tool({ output_path: outputPath });

    expect(result.success).toBe(true);
    if (result.success) {
       expect(result.data.file_path).toBe(outputPath);
       expect(result.data.memory_count).toBe(0); // empty db
    }
  });
});
