import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportMemories } from "../../../src/import-export/rvf-exporter.js";
import { validateRvfFormat } from "../../../src/import-export/index.js";
import { RVF_FORMAT_VERSION } from "../../../src/shared/types.js";

const TMP_TEST_DIR = join(process.cwd(), ".tmp-exporter-unit-tests");

beforeEach(() => {
  mkdirSync(TMP_TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TMP_TEST_DIR, { recursive: true, force: true });
});

describe("rvf-exporter", () => {
  it("exports all memories to a valid NDJSON file", async () => {
    const outputPath = join(TMP_TEST_DIR, "export.rvf");

    const mockAdapter = {
      listAll: vi.fn().mockResolvedValue({
        success: true,
        data: {
          entries: [
            { id: "id1", vector: [0.1, 0.2], metadata: { content: "c1", tags: ["t1"] } },
            { id: "id2", vector: [0.3, 0.4], metadata: { content: "c2", tags: ["t2"] } },
          ],
        },
      }),
    } as any;

    const result = await exportMemories({
      adapter: mockAdapter,
      outputPath,
      projectName: "test-project",
      vectorDimensions: 128,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(existsSync(outputPath)).toBe(true);

      const lines = readFileSync(outputPath, "utf8").trim().split("\n");
      expect(lines).toHaveLength(3); // 1 manifest + 2 memories

      // Line 1: Manifest
      const manifestLine = lines[0];
      if (!manifestLine) throw new Error("Manifest line missing");
      const manifest = JSON.parse(manifestLine);
      expect(manifest.format_version).toBe(RVF_FORMAT_VERSION);
      expect(manifest.source_project).toBe("test-project");
      expect(manifest.memory_count).toBe(2);
      expect(manifest.vector_dimensions).toBe(128);

      // Line 2: Memory 1
      const m1Line = lines[1];
      if (!m1Line) throw new Error("Memory 1 line missing");
      const m1 = JSON.parse(m1Line);
      expect(m1.id).toBe("id1");
      expect(m1.vector).toEqual([0.1, 0.2]);
      expect(m1.metadata.content).toBe("c1");

      // Line 3: Memory 2
      const m2Line = lines[2];
      if (!m2Line) throw new Error("Memory 2 line missing");
      const m2 = JSON.parse(m2Line);
      expect(m2.id).toBe("id2");
      expect(m2.vector).toEqual([0.3, 0.4]);
      expect(m2.metadata.content).toBe("c2");
    }
  });

  it("exports an empty database successfully", async () => {
    const outputPath = join(TMP_TEST_DIR, "empty.rvf");

    const mockAdapter = {
      listAll: vi.fn().mockResolvedValue({
        success: true,
        data: { entries: [] },
      }),
    } as any;

    const result = await exportMemories({
      adapter: mockAdapter,
      outputPath,
      projectName: "empty-project",
      vectorDimensions: 128,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const lines = readFileSync(outputPath, "utf8").trim().split("\n");
      expect(lines).toHaveLength(1); // Only manifest
      const manifestLine = lines[0];
      if (!manifestLine) throw new Error("Manifest line missing");
      const manifest = JSON.parse(manifestLine);
      expect(manifest.memory_count).toBe(0);
    }
  });

  it("fails if adapter.listAll fails", async () => {
    const mockAdapter = {
      listAll: vi.fn().mockResolvedValue({
        success: false,
        error: "Database error",
        code: "ERR",
      }),
    } as any;

    const result = await exportMemories({
      adapter: mockAdapter,
      outputPath: join(TMP_TEST_DIR, "fail.rvf"),
      projectName: "fail",
      vectorDimensions: 128,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Database error");
    }
  });

  describe("validateRvfFormat", () => {
    it("returns valid: true for correctly formatted files", async () => {
      const outputPath = join(TMP_TEST_DIR, "valid.rvf");
      const mockAdapter = {
        listAll: vi.fn().mockResolvedValue({
          success: true,
          data: { entries: [{ id: "1", vector: [0], metadata: {} }] },
        }),
      } as any;
      await exportMemories({ adapter: mockAdapter, outputPath, projectName: "p", vectorDimensions: 1 });

      const validation = validateRvfFormat(outputPath);
      expect(validation.valid).toBe(true);
    });

    it("rejects malformed JSON", () => {
      const p = join(TMP_TEST_DIR, "bad.rvf");
      writeFileSync(p, "not json");
      const validation = validateRvfFormat(p);
      expect(validation.valid).toBe(false);
      expect(validation.error).toBeDefined();
    });

    it("rejects invalid manifest version", () => {
      const p = join(TMP_TEST_DIR, "old.rvf");
      writeFileSync(p, JSON.stringify({ format_version: "0.0.1" }));
      const validation = validateRvfFormat(p);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("Unsupported format version");
    });
  });
});
