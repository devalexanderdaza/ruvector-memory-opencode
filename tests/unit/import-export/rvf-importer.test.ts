import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { importMemories } from "../../../src/import-export/rvf-importer.js";
import { RVF_FORMAT_VERSION } from "../../../src/shared/types.js";

const TMP_TEST_DIR = join(process.cwd(), ".tmp-importer-unit-tests");

// ── Helpers ────────────────────────────────────────────────────────────────

function makeManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format_version: RVF_FORMAT_VERSION,
    export_timestamp: "2026-03-21T00:00:00.000Z",
    source_project: "test-project",
    memory_count: 0,
    vector_dimensions: 128,
    ...overrides,
  };
}

function makeEntry(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    vector: [0.1, 0.2, 0.3],
    metadata: { content: `content-${id}`, confidence: 0.8, source: "manual" },
    ...overrides,
  };
}

function writeRvf(path: string, manifest: Record<string, unknown>, entries: unknown[]): void {
  const lines = [JSON.stringify(manifest), ...entries.map((e) => JSON.stringify(e))];
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function makeInsertAdapter(insertFn = vi.fn().mockResolvedValue({ success: true, data: { id: "x" } })) {
  return { insertWithVector: insertFn };
}

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  mkdirSync(TMP_TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TMP_TEST_DIR, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("rvf-importer", () => {
  describe("successful imports", () => {
    it("imports multiple memories and returns correct count", async () => {
      const filePath = join(TMP_TEST_DIR, "multi.rvf");
      const entries = [makeEntry("id1"), makeEntry("id2"), makeEntry("id3")];
      writeRvf(filePath, makeManifest({ memory_count: 3 }), entries);

      const insertFn = vi.fn().mockResolvedValue({ success: true, data: { id: "x" } });
      const adapter = makeInsertAdapter(insertFn);

      const result = await importMemories({ adapter, filePath });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.imported_count).toBe(3);
        expect(result.data.skipped_count).toBe(0);
        expect(result.data.source_project).toBe("test-project");
        expect(result.data.format_version).toBe(RVF_FORMAT_VERSION);
        expect(result.data.file_path).toBe(filePath);
        expect(result.data.dry_run).toBe(false);
      }
      expect(insertFn).toHaveBeenCalledTimes(3);
    });

    it("overwrites source field to 'import' for all entries by default", async () => {
      const filePath = join(TMP_TEST_DIR, "source-override.rvf");
      writeRvf(
        filePath,
        makeManifest({ memory_count: 2 }),
        [makeEntry("a", { metadata: { content: "a", source: "agent" } }),
         makeEntry("b", { metadata: { content: "b", source: "manual" } })],
      );

      const insertFn = vi.fn().mockResolvedValue({ success: true, data: { id: "x" } });
      const adapter = makeInsertAdapter(insertFn);

      const result = await importMemories({ adapter, filePath });

      expect(result.success).toBe(true);
      // Verify each call passed metadata with source = "import"
      for (const call of insertFn.mock.calls) {
        const metadata = call[2] as Record<string, unknown>;
        expect(metadata.source).toBe("import");
      }
    });

    it("preserves all metadata fields intact for each imported entry", async () => {
      const filePath = join(TMP_TEST_DIR, "full-meta.rvf");
      const richMeta = {
        content: "rich memory",
        created_at: "2026-01-01T00:00:00.000Z",
        confidence: 0.9,
        tags: ["typescript", "architecture"],
        priority: "critical",
        accessCount: 5,
        positiveFeedbackCount: 3,
        negativeFeedbackCount: 0,
        feedbackHistory: "helpful;helpful;helpful",
        patternKey: "pat-42",
        hasSecretPattern: false,
      };
      writeRvf(
        filePath,
        makeManifest({ memory_count: 1 }),
        [{ id: "rich-id", vector: [0.5, 0.6], metadata: richMeta }],
      );

      const insertFn = vi.fn().mockResolvedValue({ success: true, data: { id: "rich-id" } });
      const result = await importMemories({
        adapter: makeInsertAdapter(insertFn),
        filePath,
      });

      expect(result.success).toBe(true);
      const passedMeta = insertFn.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(passedMeta.content).toBe("rich memory");
      expect(passedMeta.confidence).toBe(0.9);
      expect(passedMeta.tags).toEqual(["typescript", "architecture"]);
      expect(passedMeta.feedbackHistory).toBe("helpful;helpful;helpful");
      expect(passedMeta.patternKey).toBe("pat-42");
      expect(passedMeta.hasSecretPattern).toBe(false);
      // source should be forced to "import"
      expect(passedMeta.source).toBe("import");
    });

    it("keeps original source when overwrite_source is false", async () => {
      const filePath = join(TMP_TEST_DIR, "no-override.rvf");
      writeRvf(
        filePath,
        makeManifest({ memory_count: 1 }),
        [makeEntry("x", { metadata: { content: "test", source: "manual" } })],
      );

      const insertFn = vi.fn().mockResolvedValue({ success: true, data: { id: "x" } });
      await importMemories({
        adapter: makeInsertAdapter(insertFn),
        filePath,
        overwriteSource: false,
      });

      const passedMeta = insertFn.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(passedMeta.source).toBe("manual");
    });

    it("passes original id and vector to insertWithVector", async () => {
      const filePath = join(TMP_TEST_DIR, "id-vec.rvf");
      const expectedVector = [0.11, 0.22, 0.33];
      writeRvf(
        filePath,
        makeManifest({ memory_count: 1 }),
        [{ id: "fixed-id", vector: expectedVector, metadata: { content: "x" } }],
      );

      const insertFn = vi.fn().mockResolvedValue({ success: true, data: { id: "fixed-id" } });
      await importMemories({
        adapter: makeInsertAdapter(insertFn),
        filePath,
      });

      expect(insertFn).toHaveBeenCalledWith(
        "fixed-id",
        expectedVector,
        expect.objectContaining({ content: "x" }),
      );
    });
  });

  describe("empty file handling", () => {
    it("returns success with imported_count 0 for empty RVF file", async () => {
      const filePath = join(TMP_TEST_DIR, "empty.rvf");
      writeRvf(filePath, makeManifest({ memory_count: 0 }), []);

      const insertFn = vi.fn();
      const result = await importMemories({
        adapter: makeInsertAdapter(insertFn),
        filePath,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.imported_count).toBe(0);
        expect(result.data.skipped_count).toBe(0);
      }
      expect(insertFn).not.toHaveBeenCalled();
    });
  });

  describe("dry_run mode", () => {
    it("returns expected counts but does not call insertWithVector", async () => {
      const filePath = join(TMP_TEST_DIR, "dry-run.rvf");
      writeRvf(
        filePath,
        makeManifest({ memory_count: 3 }),
        [makeEntry("x1"), makeEntry("x2"), makeEntry("x3")],
      );

      const insertFn = vi.fn();
      const result = await importMemories({
        adapter: makeInsertAdapter(insertFn),
        filePath,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.imported_count).toBe(3); // preview from manifest
        expect(result.data.dry_run).toBe(true);
      }
      expect(insertFn).not.toHaveBeenCalled();
    });
  });

  describe("error cases", () => {
    it("returns FILE_NOT_FOUND when file does not exist", async () => {
      const result = await importMemories({
        adapter: makeInsertAdapter(),
        filePath: join(TMP_TEST_DIR, "nonexistent.rvf"),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("FILE_NOT_FOUND");
        expect(result.error).toContain("not found");
      }
    });

    it("returns UNSUPPORTED_RVF_VERSION for wrong format_version", async () => {
      const filePath = join(TMP_TEST_DIR, "old-version.rvf");
      writeRvf(filePath, makeManifest({ format_version: "99.0.0", memory_count: 0 }), []);

      const result = await importMemories({
        adapter: makeInsertAdapter(),
        filePath,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("UNSUPPORTED_RVF_VERSION");
        expect(result.error).toContain("99.0.0");
        expect(result.error).toContain(RVF_FORMAT_VERSION);
      }
    });

    it("returns INVALID_RVF_FORMAT for malformed JSON content", async () => {
      const filePath = join(TMP_TEST_DIR, "bad-json.rvf");
      writeFileSync(filePath, "this is not json at all\n", "utf8");

      const result = await importMemories({
        adapter: makeInsertAdapter(),
        filePath,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_RVF_FORMAT");
      }
    });

    it("returns INVALID_RVF_FORMAT when manifest memory_count mismatches entry count", async () => {
      const filePath = join(TMP_TEST_DIR, "count-mismatch.rvf");
      // Claim 3 entries but only write 1
      writeRvf(filePath, makeManifest({ memory_count: 3 }), [makeEntry("only-one")]);

      const result = await importMemories({
        adapter: makeInsertAdapter(),
        filePath,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_RVF_FORMAT");
      }
    });

    it("returns INVALID_RVF_FORMAT for empty file", async () => {
      const filePath = join(TMP_TEST_DIR, "empty.rvf");
      writeFileSync(filePath, "", "utf8");

      const result = await importMemories({
        adapter: makeInsertAdapter(),
        filePath,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_RVF_FORMAT");
      }
    });

    it("counts skipped entries when adapter.insertWithVector fails", async () => {
      const filePath = join(TMP_TEST_DIR, "partial-fail.rvf");
      writeRvf(
        filePath,
        makeManifest({ memory_count: 2 }),
        [makeEntry("ok"), makeEntry("fail")],
      );

      const insertFn = vi
        .fn()
        .mockResolvedValueOnce({ success: true, data: { id: "ok" } })
        .mockResolvedValueOnce({ success: false, error: "DB error", code: "ENOTREADY" });

      const result = await importMemories({
        adapter: makeInsertAdapter(insertFn),
        filePath,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.imported_count).toBe(1);
        expect(result.data.skipped_count).toBe(1);
      }
    });

    it("does not write any data when format is invalid (transactional safety)", async () => {
      const filePath = join(TMP_TEST_DIR, "corrupt.rvf");
      writeFileSync(filePath, "{ bad json", "utf8");

      const insertFn = vi.fn();
      const result = await importMemories({
        adapter: makeInsertAdapter(insertFn),
        filePath,
      });

      expect(result.success).toBe(false);
      expect(insertFn).not.toHaveBeenCalled();
    });

    it("does not write any data when version is unsupported (transactional safety)", async () => {
      const filePath = join(TMP_TEST_DIR, "old.rvf");
      writeRvf(
        filePath,
        makeManifest({ format_version: "0.0.1", memory_count: 0 }),
        [],
      );

      const insertFn = vi.fn();
      await importMemories({
        adapter: makeInsertAdapter(insertFn),
        filePath,
      });

      expect(insertFn).not.toHaveBeenCalled();
    });

    it("counts skipped entries when insertWithVector throws synchronously", async () => {
      const filePath = join(TMP_TEST_DIR, "throw-fail.rvf");
      writeRvf(
        filePath,
        makeManifest({ memory_count: 2 }),
        [makeEntry("ok"), makeEntry("throws")],
      );

      const insertFn = vi
        .fn()
        .mockResolvedValueOnce({ success: true, data: { id: "ok" } })
        .mockRejectedValueOnce(new Error("Unexpected DB crash"));

      const result = await importMemories({
        adapter: makeInsertAdapter(insertFn),
        filePath,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.imported_count).toBe(1);
        expect(result.data.skipped_count).toBe(1);
      }
    });

    it("skips entries with missing id field", async () => {
      const filePath = join(TMP_TEST_DIR, "missing-id.rvf");
      // Write valid manifest but entry lacks an id
      const badEntry = { vector: [0.1, 0.2], metadata: { content: "no-id" } };
      writeRvf(filePath, makeManifest({ memory_count: 1 }), [badEntry]);

      // validateRvfFormat will catch missing 'id' field — expect INVALID_RVF_FORMAT
      const insertFn = vi.fn();
      const result = await importMemories({
        adapter: makeInsertAdapter(insertFn),
        filePath,
      });

      // The format validator will reject this before any writes
      expect(result.success).toBe(false);
      expect(insertFn).not.toHaveBeenCalled();
    });
  });
});

