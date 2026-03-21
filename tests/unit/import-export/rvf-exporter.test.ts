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

  it("produces deterministic output for the same input state", async () => {
    const outputPathA = join(TMP_TEST_DIR, "deterministic-a.rvf");
    const outputPathB = join(TMP_TEST_DIR, "deterministic-b.rvf");

    const mockAdapter = {
      listAll: vi.fn().mockResolvedValue({
        success: true,
        data: {
          entries: [
            {
              id: "b-id",
              vector: [0.3, 0.4],
              metadata: { content: "c2", created_at: "2026-03-21T10:00:00.000Z" },
            },
            {
              id: "a-id",
              vector: [0.1, 0.2],
              metadata: { content: "c1", created_at: "2026-03-20T10:00:00.000Z" },
            },
          ],
        },
      }),
    } as any;

    const exportA = await exportMemories({
      adapter: mockAdapter,
      outputPath: outputPathA,
      projectName: "deterministic-project",
      vectorDimensions: 128,
    });

    const exportB = await exportMemories({
      adapter: mockAdapter,
      outputPath: outputPathB,
      projectName: "deterministic-project",
      vectorDimensions: 128,
    });

    expect(exportA.success).toBe(true);
    expect(exportB.success).toBe(true);

    const contentA = readFileSync(outputPathA, "utf8");
    const contentB = readFileSync(outputPathB, "utf8");
    expect(contentA).toBe(contentB);
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

  it("applies source and tags filters during export", async () => {
    const outputPath = join(TMP_TEST_DIR, "filtered.rvf");

    const mockAdapter = {
      listAll: vi.fn().mockResolvedValue({
        success: true,
        data: {
          entries: [
            {
              id: "1",
              vector: [0.1, 0.2],
              metadata: { content: "a", source: "manual", tags: ["keep", "x"] },
            },
            {
              id: "2",
              vector: [0.3, 0.4],
              metadata: { content: "b", source: "agent", tags: ["drop"] },
            },
          ],
        },
      }),
    } as any;

    const result = await exportMemories({
      adapter: mockAdapter,
      outputPath,
      projectName: "test-project",
      vectorDimensions: 128,
      filters: {
        source: "manual",
        tags: ["keep"],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.memory_count).toBe(1);
      const lines = readFileSync(outputPath, "utf8").trim().split("\n");
      expect(lines).toHaveLength(2);
      const onlyEntryLine = lines[1];
      if (!onlyEntryLine) throw new Error("Filtered entry missing");
      const onlyEntry = JSON.parse(onlyEntryLine);
      expect(onlyEntry.id).toBe("1");
    }
  });

  it("serializes Float32Array vectors and excludes non-matching filtered memories", async () => {
    const outputPath = join(TMP_TEST_DIR, "float32-filtered.rvf");

    const mockAdapter = {
      listAll: vi.fn().mockResolvedValue({
        success: true,
        data: {
          entries: [
            {
              id: "10",
              vector: new Float32Array([0.11, 0.22]),
              metadata: { content: "kept", source: "manual", tags: ["k"] },
            },
            {
              id: "20",
              vector: [0.33, 0.44],
              metadata: { content: "dropped-source", source: "agent", tags: ["k"] },
            },
            {
              id: "30",
              vector: [0.55, 0.66],
              metadata: { content: "dropped-tags", source: "manual", tags: "not-array" },
            },
          ],
        },
      }),
    } as any;

    const result = await exportMemories({
      adapter: mockAdapter,
      outputPath,
      projectName: "test-project",
      vectorDimensions: 128,
      filters: {
        source: "manual",
        tags: ["k"],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.memory_count).toBe(1);
      const lines = readFileSync(outputPath, "utf8").trim().split("\n");
      const entryLine = lines[1];
      if (!entryLine) throw new Error("Entry line missing");
      const entry = JSON.parse(entryLine);
      expect(entry.id).toBe("10");
      expect(entry.vector).toHaveLength(2);
      expect(entry.vector[0]).toBeCloseTo(0.11, 5);
      expect(entry.vector[1]).toBeCloseTo(0.22, 5);
    }
  });

  it("exports zero entries when filters do not match any memory", async () => {
    const outputPath = join(TMP_TEST_DIR, "no-match.rvf");

    const mockAdapter = {
      listAll: vi.fn().mockResolvedValue({
        success: true,
        data: {
          entries: [
            {
              id: "x",
              vector: [0.1, 0.2],
              metadata: { content: "x", source: "agent", tags: ["t"] },
            },
          ],
        },
      }),
    } as any;

    const result = await exportMemories({
      adapter: mockAdapter,
      outputPath,
      projectName: "test-project",
      vectorDimensions: 128,
      filters: {
        source: "manual",
        tags: ["missing"],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.memory_count).toBe(0);
      const lines = readFileSync(outputPath, "utf8").trim().split("\n");
      expect(lines).toHaveLength(1);
    }
  });

  it("respects explicit export timestamp and include_vectors=false", async () => {
    const outputPath = join(TMP_TEST_DIR, "no-vectors.rvf");

    const mockAdapter = {
      listAll: vi.fn().mockResolvedValue({
        success: true,
        data: {
          entries: [
            {
              id: "1",
              vector: [0.1, 0.2],
              metadata: { content: "a", source: "manual" },
            },
          ],
        },
      }),
    } as any;

    const explicitTimestamp = "2026-03-21T00:00:00.000Z";
    const result = await exportMemories({
      adapter: mockAdapter,
      outputPath,
      projectName: "test-project",
      vectorDimensions: 128,
      exportTimestamp: explicitTimestamp,
      includeVectors: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const lines = readFileSync(outputPath, "utf8").trim().split("\n");
      const manifestLine = lines[0];
      if (!manifestLine) throw new Error("Manifest line missing");
      const manifest = JSON.parse(manifestLine);
      expect(manifest.export_timestamp).toBe(explicitTimestamp);

      const entryLine = lines[1];
      if (!entryLine) throw new Error("Entry line missing");
      const entry = JSON.parse(entryLine);
      expect(entry.vector).toBeUndefined();
      expect(entry.metadata.content).toBe("a");
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

    it("rejects empty files", () => {
      const p = join(TMP_TEST_DIR, "empty.rvf");
      writeFileSync(p, "");
      const validation = validateRvfFormat(p);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("Empty file");
    });

    it("rejects corruption in middle entries", () => {
      const p = join(TMP_TEST_DIR, "corrupt-middle.rvf");
      writeFileSync(
        p,
        [
          JSON.stringify({
            format_version: RVF_FORMAT_VERSION,
            export_timestamp: "2026-03-21T00:00:00.000Z",
            source_project: "p",
            memory_count: 3,
            vector_dimensions: 2,
          }),
          JSON.stringify({ id: "a", vector: [0.1, 0.2], metadata: { ok: true } }),
          "{\"id\":\"b\",\"vector\":[0.3,0.4],\"metadata\":}",
          JSON.stringify({ id: "c", vector: [0.5, 0.6], metadata: { ok: true } }),
        ].join("\n"),
      );

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

    it("rejects files when manifest memory_count does not match entries", () => {
      const p = join(TMP_TEST_DIR, "count-mismatch.rvf");
      writeFileSync(
        p,
        [
          JSON.stringify({
            format_version: RVF_FORMAT_VERSION,
            export_timestamp: "2026-03-21T00:00:00.000Z",
            source_project: "p",
            memory_count: 2,
            vector_dimensions: 2,
          }),
          JSON.stringify({ id: "a", vector: [0.1, 0.2], metadata: { ok: true } }),
        ].join("\n"),
      );

      const validation = validateRvfFormat(p);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("memory_count");
    });

    it("rejects invalid manifest shape", () => {
      const p = join(TMP_TEST_DIR, "invalid-manifest-shape.rvf");
      writeFileSync(
        p,
        JSON.stringify({
          format_version: RVF_FORMAT_VERSION,
          export_timestamp: "2026-03-21T00:00:00.000Z",
          source_project: "p",
          memory_count: "1",
          vector_dimensions: 2,
        }),
      );
      const validation = validateRvfFormat(p);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("Invalid manifest structure");
    });

    it("rejects entry with non-object metadata", () => {
      const p = join(TMP_TEST_DIR, "invalid-metadata.rvf");
      writeFileSync(
        p,
        [
          JSON.stringify({
            format_version: RVF_FORMAT_VERSION,
            export_timestamp: "2026-03-21T00:00:00.000Z",
            source_project: "p",
            memory_count: 1,
            vector_dimensions: 2,
          }),
          JSON.stringify({ id: "a", vector: [0.1, 0.2], metadata: "bad" }),
        ].join("\n"),
      );
      const validation = validateRvfFormat(p);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("Invalid entry");
    });

    it("rejects files with blank entry lines", () => {
      const p = join(TMP_TEST_DIR, "blank-entry-line.rvf");
      writeFileSync(
        p,
        [
          JSON.stringify({
            format_version: RVF_FORMAT_VERSION,
            export_timestamp: "2026-03-21T00:00:00.000Z",
            source_project: "p",
            memory_count: 2,
            vector_dimensions: 2,
          }),
          JSON.stringify({ id: "a", vector: [0.1, 0.2], metadata: { ok: true } }),
          "",
        ].join("\n"),
      );
      const validation = validateRvfFormat(p);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("memory_count");
    });

    it("rejects entry with missing vector when manifest has memories", () => {
      const p = join(TMP_TEST_DIR, "missing-vector.rvf");
      writeFileSync(
        p,
        [
          JSON.stringify({
            format_version: RVF_FORMAT_VERSION,
            export_timestamp: "2026-03-21T00:00:00.000Z",
            source_project: "p",
            memory_count: 1,
            vector_dimensions: 2,
          }),
          JSON.stringify({ id: "a", metadata: { ok: true } }),
        ].join("\n"),
      );
      const validation = validateRvfFormat(p);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("Invalid vector");
    });

    it("returns error when file path does not exist", () => {
      const p = join(TMP_TEST_DIR, "does-not-exist.rvf");
      const validation = validateRvfFormat(p);
      expect(validation.valid).toBe(false);
      expect(validation.error).toBeDefined();
    });
  });
});
