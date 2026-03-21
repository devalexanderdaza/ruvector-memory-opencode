import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryImportTool } from "../../../src/tools/tools/memory-import-tool.js";
import {
  resetPluginStateForTests,
  activatePlugin,
} from "../../../src/core/plugin.js";
import { RVF_FORMAT_VERSION } from "../../../src/shared/types.js";

const TMP_TOOL_DIR = join(process.cwd(), ".tmp-import-tool-tests");

function makeValidRvfFile(dir: string, name = "test.rvf"): string {
  const filePath = join(dir, name);
  const manifest = {
    format_version: RVF_FORMAT_VERSION,
    export_timestamp: "2026-03-21T00:00:00.000Z",
    source_project: "source-project",
    memory_count: 0,
    vector_dimensions: 128,
  };
  writeFileSync(filePath, `${JSON.stringify(manifest)}\n`, "utf8");
  return filePath;
}

beforeEach(() => {
  mkdirSync(TMP_TOOL_DIR, { recursive: true });
});

afterEach(() => {
  resetPluginStateForTests();
  rmSync(TMP_TOOL_DIR, { recursive: true, force: true });
});

describe("memory_import tool unit tests", () => {
  it("returns PLUGIN_NOT_ACTIVATED when plugin is not started", async () => {
    resetPluginStateForTests();
    const tool = createMemoryImportTool();
    const result = await tool({ file_path: "/some/path.rvf" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("PLUGIN_NOT_ACTIVATED");
    }
  });

  it("returns INVALID_INPUT when file_path is missing", async () => {
    await activatePlugin({ projectRoot: TMP_TOOL_DIR });
    const tool = createMemoryImportTool();
    const result = await tool({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("INVALID_INPUT");
      expect(result.reason).toBe("validation");
    }
  });

  it("returns INVALID_INPUT when file_path is empty string", async () => {
    await activatePlugin({ projectRoot: TMP_TOOL_DIR });
    const tool = createMemoryImportTool();
    const result = await tool({ file_path: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("INVALID_INPUT");
    }
  });

  it("returns INVALID_INPUT when unknown fields are passed (strict schema)", async () => {
    await activatePlugin({ projectRoot: TMP_TOOL_DIR });
    const tool = createMemoryImportTool();
    const result = await tool({ file_path: "/f.rvf", extra_field: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("INVALID_INPUT");
    }
  });

  it("returns INVALID_INPUT when dry_run is not a boolean", async () => {
    await activatePlugin({ projectRoot: TMP_TOOL_DIR });
    const tool = createMemoryImportTool();
    const result = await tool({ file_path: "/f.rvf", dry_run: "yes" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("INVALID_INPUT");
    }
  });

  it("returns success for a valid empty RVF file when plugin is activated", async () => {
    await activatePlugin({ projectRoot: TMP_TOOL_DIR });
    const filePath = makeValidRvfFile(TMP_TOOL_DIR);
    const tool = createMemoryImportTool();

    const result = await tool({ file_path: filePath });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.imported_count).toBe(0);
      expect(result.data.source_project).toBe("source-project");
      expect(result.data.dry_run).toBe(false);
    }
  });

  it("passes dry_run=true to the importer", async () => {
    await activatePlugin({ projectRoot: TMP_TOOL_DIR });
    const filePath = makeValidRvfFile(TMP_TOOL_DIR);
    const tool = createMemoryImportTool();

    const result = await tool({ file_path: filePath, dry_run: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dry_run).toBe(true);
    }
  });

  it("returns FILE_NOT_FOUND for a non-existent file path", async () => {
    await activatePlugin({ projectRoot: TMP_TOOL_DIR });
    const tool = createMemoryImportTool();

    const result = await tool({ file_path: join(TMP_TOOL_DIR, "nonexistent.rvf") });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("FILE_NOT_FOUND");
    }
  });

  it("accepts overwrite_source=false and passes it to importer", async () => {
    await activatePlugin({ projectRoot: TMP_TOOL_DIR });
    const filePath = makeValidRvfFile(TMP_TOOL_DIR, "no-override.rvf");
    const tool = createMemoryImportTool();

    // File is empty so no entries to import; just verify no validation error
    const result = await tool({ file_path: filePath, overwrite_source: false });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.imported_count).toBe(0);
    }
  });

  it("handles undefined input gracefully (no-args call)", async () => {
    await activatePlugin({ projectRoot: TMP_TOOL_DIR });
    const tool = createMemoryImportTool();
    // calling with undefined tests the `input ?? {}` branch
    const result = await tool(undefined);

    expect(result.success).toBe(false);
    if (!result.success) {
      // file_path is missing → INVALID_INPUT
      expect(result.code).toBe("INVALID_INPUT");
    }
  });
});

// ── Mocked branch coverage ─────────────────────────────────────────────────
// These tests use vi.mock to force branches that only occur in rare/unexpected
// states and cannot be easily reproduced via normal activatePlugin flows.

import { vi } from "vitest";

describe("memory_import tool — mocked branch coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetPluginStateForTests();
    rmSync(TMP_TOOL_DIR, { recursive: true, force: true });
  });

  it("returns PLUGIN_NOT_ACTIVATED when getVectorStoreAdapterForTools returns null", async () => {
    const pluginModule = await import("../../../src/core/plugin.js");

    // Simulate a state where init succeeds but adapter is not available
    vi.spyOn(pluginModule, "initializeMemoryOnFirstOperation").mockResolvedValue({
      success: true,
      data: {
        firstRun: false,
        created: false,
        dbPath: "/fake/path.db",
        initializationMs: 0,
        databaseSize: 0,
      },
    });
    vi.spyOn(pluginModule, "getVectorStoreAdapterForTools").mockReturnValue(null);

    const tool = createMemoryImportTool();
    const result = await tool({ file_path: "/some/file.rvf" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("PLUGIN_NOT_ACTIVATED");
    }
  });

  it("returns EUNEXPECTED when importMemories throws an unexpected error", async () => {
    mkdirSync(TMP_TOOL_DIR, { recursive: true });
    await activatePlugin({ projectRoot: TMP_TOOL_DIR });

    const importerModule = await import("../../../src/import-export/index.js");
    vi.spyOn(importerModule, "importMemories").mockRejectedValueOnce(
      new Error("Unexpected DB crash"),
    );

    const tool = createMemoryImportTool();
    const result = await tool({ file_path: "/whatever.rvf" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("EUNEXPECTED");
      expect(result.error).toContain("Unexpected DB crash");
    }
  });
});

