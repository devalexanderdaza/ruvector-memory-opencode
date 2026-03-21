import { rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { activatePlugin, resetPluginStateForTests } from "../../src/core/plugin.js";
import { createMemorySaveTool } from "../../src/tools/tools/memory-save-tool.js";
import { createMemoryExportTool } from "../../src/tools/tools/memory-export-tool.js";
import { createMemoryImportTool } from "../../src/tools/tools/memory-import-tool.js";
import { createMemorySearchTool } from "../../src/tools/tools/memory-search-tool.js";
import { RVF_FORMAT_VERSION } from "../../src/shared/types.js";

const TMP_BASE = join(process.cwd(), ".tmp-import-integration");

let testId = 0;

function makeDirs(): { source: string; target: string } {
  testId += 1;
  const source = join(TMP_BASE, `test-${testId}-source`);
  const target = join(TMP_BASE, `test-${testId}-target`);
  mkdirSync(source, { recursive: true });
  mkdirSync(target, { recursive: true });
  return { source, target };
}

afterEach(() => {
  resetPluginStateForTests();
  rmSync(TMP_BASE, { recursive: true, force: true });
});

describe("Memory Import Integration", () => {
  it("round-trips: save → export → import → search preserves all memories", async () => {
    const { source, target } = makeDirs();

    // ── Phase 1: Source project — save + export ─────────────────────────────
    await activatePlugin({ projectRoot: source });

    const saveTool = createMemorySaveTool();
    await saveTool({ content: "TypeScript generics improve type safety", tags: ["typescript"], priority: "critical" });
    await saveTool({ content: "RVF format is NDJSON for Git friendliness", tags: ["rvf", "format"], confidence: 0.9 });
    await saveTool({ content: "Use zod for schema validation at runtime", tags: ["zod", "validation"] });

    const exportTool = createMemoryExportTool();
    const rvfPath = join(source, "export.rvf");
    const exportResult = await exportTool({ output_path: rvfPath });

    expect(exportResult.success).toBe(true);
    if (!exportResult.success) return;
    expect(exportResult.data.memory_count).toBe(3);

    // Reset plugin for target project
    resetPluginStateForTests();

    // ── Phase 2: Target project — import ───────────────────────────────────
    await activatePlugin({ projectRoot: target });

    const importTool = createMemoryImportTool();
    const importResult = await importTool({ file_path: rvfPath });

    expect(importResult.success).toBe(true);
    if (!importResult.success) return;
    expect(importResult.data.imported_count).toBe(3);
    expect(importResult.data.skipped_count).toBe(0);
    expect(importResult.data.dry_run).toBe(false);

    // ── Phase 3: Verify searchability ─────────────────────────────────────
    const searchTool = createMemorySearchTool();
    const searchResult = await searchTool({ query: "TypeScript generics", limit: 5 });

    expect(searchResult.success).toBe(true);
    if (searchResult.success) {
      expect(searchResult.data.results.length).toBeGreaterThan(0);
    }
  });

  it("imported memories have source set to 'import' by default", async () => {
    const { source, target } = makeDirs();

    // Source project
    await activatePlugin({ projectRoot: source });
    const saveTool = createMemorySaveTool();
    await saveTool({ content: "source provenance memory", source: "manual" });

    const rvfPath = join(source, "source-override.rvf");
    await createMemoryExportTool()({ output_path: rvfPath });

    resetPluginStateForTests();

    // Target project — import
    await activatePlugin({ projectRoot: target });
    const importResult = await createMemoryImportTool()({ file_path: rvfPath });

    expect(importResult.success).toBe(true);

    // Search and verify source is "import"
    const searchResult = await createMemorySearchTool()({ query: "source provenance memory", limit: 5 });
    expect(searchResult.success).toBe(true);
    if (searchResult.success) {
      const found = searchResult.data.results.find((r) => r.content?.includes("source provenance"));
      if (found) {
        expect(found.source).toBe("import");
      }
    }
  });

  it("returns success with imported_count=0 for empty RVF file", async () => {
    const { source, target } = makeDirs();

    await activatePlugin({ projectRoot: source });

    // Export an empty db
    const rvfPath = join(source, "empty.rvf");
    const exportResult = await createMemoryExportTool()({ output_path: rvfPath });
    expect(exportResult.success).toBe(true);
    if (exportResult.success) {
      expect(exportResult.data.memory_count).toBe(0);
    }

    resetPluginStateForTests();
    await activatePlugin({ projectRoot: target });

    const importResult = await createMemoryImportTool()({ file_path: rvfPath });
    expect(importResult.success).toBe(true);
    if (importResult.success) {
      expect(importResult.data.imported_count).toBe(0);
    }
  });

  it("dry_run mode returns count without importing", async () => {
    const { source, target } = makeDirs();

    await activatePlugin({ projectRoot: source });

    const saveTool = createMemorySaveTool();
    await saveTool({ content: "unique dry run test memory phrase" });

    const rvfPath = join(source, "dry.rvf");
    await createMemoryExportTool()({ output_path: rvfPath });

    resetPluginStateForTests();
    await activatePlugin({ projectRoot: target });

    const dryResult = await createMemoryImportTool()({ file_path: rvfPath, dry_run: true });
    expect(dryResult.success).toBe(true);
    if (dryResult.success) {
      expect(dryResult.data.imported_count).toBe(1);
      expect(dryResult.data.dry_run).toBe(true);
    }

    // Confirm nothing was written — search should return nothing
    const searchResult = await createMemorySearchTool()({ query: "unique dry run test memory phrase", limit: 5 });
    expect(searchResult.success).toBe(true);
    if (searchResult.success) {
      expect(searchResult.data.results).toHaveLength(0);
    }
  });

  it("returns UNSUPPORTED_RVF_VERSION for a file with wrong format_version", async () => {
    const { source } = makeDirs();

    await activatePlugin({ projectRoot: source });

    // Write a manually crafted invalid version file
    const rvfPath = join(source, "oldversion.rvf");
    const oldManifest = {
      format_version: "99.0.0",
      export_timestamp: "2026-01-01T00:00:00.000Z",
      source_project: "old-project",
      memory_count: 0,
      vector_dimensions: 128,
    };
    writeFileSync(rvfPath, `${JSON.stringify(oldManifest)}\n`, "utf8");

    const importResult = await createMemoryImportTool()({ file_path: rvfPath });

    expect(importResult.success).toBe(false);
    if (!importResult.success) {
      expect(importResult.code).toBe("UNSUPPORTED_RVF_VERSION");
    }
  });

  it("returns INVALID_RVF_FORMAT for a malformed file and writes nothing", async () => {
    const { source } = makeDirs();

    await activatePlugin({ projectRoot: source });

    const rvfPath = join(source, "corrupt.rvf");
    writeFileSync(rvfPath, "this is not a valid rvf file\n", "utf8");

    const importResult = await createMemoryImportTool()({ file_path: rvfPath });

    expect(importResult.success).toBe(false);
    if (!importResult.success) {
      expect(importResult.code).toBe("INVALID_RVF_FORMAT");
    }

    // Verify no data was written
    const searchResult = await createMemorySearchTool()({ query: "not a valid", limit: 5 });
    expect(searchResult.success).toBe(true);
    if (searchResult.success) {
      expect(searchResult.data.results).toHaveLength(0);
    }
  });

  it("preserves rich metadata fields across export→import cycle", async () => {
    const { source, target } = makeDirs();

    await activatePlugin({ projectRoot: source });

    // Save with rich metadata that will be supplemented by the system
    const saveTool = createMemorySaveTool();
    await saveTool({
      content: "Architecture decision: use HNSW for vector indexing",
      tags: ["architecture", "hnsw"],
      priority: "critical",
      confidence: 0.95,
      source: "agent",
    });

    const rvfPath = join(source, "rich-meta.rvf");
    const exportResult = await createMemoryExportTool()({ output_path: rvfPath });
    expect(exportResult.success).toBe(true);
    if (!exportResult.success) return;
    expect(exportResult.data.memory_count).toBe(1);

    // Verify the exported manifest
    const lines = readFileSync(rvfPath, "utf8").trim().split("\n");
    const manifest = JSON.parse(lines[0] ?? "{}");
    expect(manifest.format_version).toBe(RVF_FORMAT_VERSION);

    // Check entry metadata
    const entry = JSON.parse(lines[1] ?? "{}");
    expect(entry.metadata.content).toBe("Architecture decision: use HNSW for vector indexing");
    expect(entry.metadata.tags).toContain("architecture");
    expect(entry.metadata.confidence).toBe(0.95);

    resetPluginStateForTests();
    await activatePlugin({ projectRoot: target });

    const importResult = await createMemoryImportTool()({ file_path: rvfPath });
    expect(importResult.success).toBe(true);
    if (importResult.success) {
      expect(importResult.data.imported_count).toBe(1);
      expect(importResult.data.source_project).toBeDefined();
    }
  });
});
