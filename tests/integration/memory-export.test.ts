import { rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { activatePlugin, resetPluginStateForTests } from "../../src/core/plugin.js";
import { createMemorySaveTool } from "../../src/tools/tools/memory-save-tool.js";
import { createMemoryExportTool } from "../../src/tools/tools/memory-export-tool.js";

const TMP_INTEGRATION_DIR = join(process.cwd(), ".tmp-export-integration");

afterEach(() => {
  resetPluginStateForTests();
  rmSync(TMP_INTEGRATION_DIR, { recursive: true, force: true });
});

describe("Memory Export Integration", () => {
  it("saves memories and exports them to a valid RVF file", async () => {
    // 1. Activate plugin (ensure correct project context)
    const activation = await activatePlugin({
      projectRoot: TMP_INTEGRATION_DIR,
    });
    expect(activation.success).toBe(true);

    // 2. Save memories
    const saveTool = createMemorySaveTool();
    await saveTool({ content: "test 1", tags: ["tag1"], priority: "critical" });
    await saveTool({ content: "test 2", tags: ["tag2"], confidence: 0.8 });

    // 3. Export via tool
    const exportTool = createMemoryExportTool();
    const outputPath = join(TMP_INTEGRATION_DIR, "export-test.rvf");
    const exportResult = await exportTool({ output_path: outputPath });

    expect(exportResult.success).toBe(true);
    if (exportResult.success) {
      expect(exportResult.data.memory_count).toBe(2);
      expect(existsSync(outputPath)).toBe(true);

      const content = readFileSync(outputPath, "utf8");
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(3); // 1 manifest + 2 memories

      const manifestLine = lines[0];
      if (!manifestLine) throw new Error("Manifest missing");
      const manifest = JSON.parse(manifestLine);
      expect(manifest.memory_count).toBe(2);
      expect(manifest.source_project).toBeDefined();

      const m1Line = lines[1];
      if (!m1Line) throw new Error("Memory 1 missing");
      const m1 = JSON.parse(m1Line);
      expect(m1.metadata.content).toBeDefined();
      expect(m1.vector).toHaveLength(384);
    }
  });

  it("exports a file to default location when output_path is omitted", async () => {
    await activatePlugin({
      projectRoot: TMP_INTEGRATION_DIR,
    });
    const saveTool = createMemorySaveTool();
    await saveTool({ content: "default path test" });

    const exportTool = createMemoryExportTool();
    const exportResult = await exportTool({});

    expect(exportResult.success).toBe(true);
    if (exportResult.success) {
      const filePath = exportResult.data.file_path;
      expect(filePath).toContain(".opencode");
      expect(filePath).toContain("project-memory-");
      expect(filePath.endsWith(".rvf")).toBe(true);
      expect(existsSync(filePath)).toBe(true);
    }
  });
});
