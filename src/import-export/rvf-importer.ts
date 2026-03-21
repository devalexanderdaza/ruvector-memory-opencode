import { readFileSync } from "node:fs";
import { access, constants } from "node:fs/promises";
import { logger } from "../shared/logger.js";
import {
  RVF_FORMAT_VERSION,
  type MemoryImportResult,
  type RvfManifest,
  type ToolResponse,
} from "../shared/types.js";
import { validateRvfFormat } from "./format-validator.js";

/** Adapter interface required by the importer — only the insertWithVector method. */
export interface ImportAdapterLike {
  insertWithVector(
    id: string,
    vector: Float32Array | number[],
    metadata: Record<string, unknown>,
  ): Promise<ToolResponse<{ id: string }>>;
}

export interface ImportOptions {
  /** Adapter used to persist imported memories. */
  adapter: ImportAdapterLike;
  /** Absolute or relative path to the .rvf file. */
  filePath: string;
  /**
   * When true, validate and count entries but do NOT write to the store.
   * Default: false.
   */
  dryRun?: boolean;
  /**
   * When true (default), overwrite each entry's `source` field with "import"
   * to track cross-project provenance.
   */
  overwriteSource?: boolean;
}

/** Parsed entry from an RVF NDJSON line (lines 2+). */
interface RvfEntry {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

function parseRvfEntry(line: string, lineNumber: number): RvfEntry | null {
  try {
    const raw = JSON.parse(line) as Record<string, unknown>;

    if (typeof raw.id !== "string" || raw.id.length === 0) {
      logger.warn("memory_import_entry_skipped", {
        reason: "missing_id",
        line: lineNumber,
      });
      return null;
    }

    if (!Array.isArray(raw.vector)) {
      logger.warn("memory_import_entry_skipped", {
        reason: "missing_vector",
        line: lineNumber,
        id: raw.id,
      });
      return null;
    }

    const hasValidMetadata =
      raw.metadata !== null &&
      typeof raw.metadata === "object" &&
      !Array.isArray(raw.metadata);

    if (!hasValidMetadata) {
      logger.warn("memory_import_entry_skipped", {
        reason: "invalid_metadata",
        line: lineNumber,
        id: raw.id,
      });
      return null;
    }

    return {
      id: raw.id as string,
      vector: raw.vector as number[],
      metadata: raw.metadata as Record<string, unknown>,
    };
  } catch {
    logger.warn("memory_import_entry_skipped", {
      reason: "parse_error",
      line: lineNumber,
    });
    return null;
  }
}

/**
 * Imports memory entries from a .rvf (RuVector Format) file into a vector store.
 *
 * Validates the file structure BEFORE writing any records (transactional safety).
 * Supports dry_run mode to preview what an import would do without side effects.
 */
export async function importMemories(
  options: ImportOptions,
): Promise<ToolResponse<MemoryImportResult>> {
  const { adapter, filePath, dryRun = false, overwriteSource = true } = options;

  logger.info("memory_import_started", {
    file_path: filePath,
    dry_run: dryRun,
  });

  // ── Step 1: Verify the file exists and is readable ─────────────────────────
  try {
    await access(filePath, constants.R_OK);
  } catch {
    logger.error("memory_import_failed", {
      reason: "file_not_found",
      file_path: filePath,
    });
    return {
      success: false,
      error: `File not found or not readable: ${filePath}`,
      code: "FILE_NOT_FOUND",
      reason: "filesystem",
    };
  }

  // ── Step 2: Read file content for manifest parsing ──────────────────────────
  let content: string;
  let lines: string[];
  try {
    content = readFileSync(filePath, "utf8");
    lines = content.trim().split("\n");
    if (lines.length === 0 || !lines[0]) {
      return {
        success: false,
        error: "Empty file",
        code: "INVALID_RVF_FORMAT",
        reason: "validation",
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `Cannot read file: ${err instanceof Error ? err.message : "unknown"}`,
      code: "INVALID_RVF_FORMAT",
      reason: "validation",
    };
  }

  // ── Step 3: Parse manifest and check version FIRST ─────────────────────────
  // Version check must happen before structural validation so we can return
  // the specific UNSUPPORTED_RVF_VERSION code when appropriate.
  let manifest: RvfManifest;
  try {
    manifest = JSON.parse(lines[0] as string) as RvfManifest;
  } catch {
    return {
      success: false,
      error: "Corrupt manifest line in RVF file",
      code: "INVALID_RVF_FORMAT",
      reason: "validation",
    };
  }

  if (manifest.format_version !== RVF_FORMAT_VERSION) {
    logger.error("memory_import_failed", {
      reason: "unsupported_version",
      found: manifest.format_version,
      expected: RVF_FORMAT_VERSION,
    });
    return {
      success: false,
      error: `Unsupported RVF version: "${manifest.format_version}". Expected "${RVF_FORMAT_VERSION}".`,
      code: "UNSUPPORTED_RVF_VERSION",
      reason: "validation",
    };
  }

  // ── Step 4: Full structural validation (after version check) ───────────────
  const validation = validateRvfFormat(filePath);
  if (!validation.valid) {
    logger.error("memory_import_failed", {
      reason: "invalid_rvf_format",
      file_path: filePath,
      validation_error: validation.error,
    });
    return {
      success: false,
      error: `Invalid RVF format: ${validation.error}`,
      code: "INVALID_RVF_FORMAT",
      reason: "validation",
    };
  }


  // ── Step 5: Handle empty file (memory_count === 0) ─────────────────────────
  if (manifest.memory_count === 0) {
    logger.info("memory_import_completed", {
      file_path: filePath,
      imported_count: 0,
      dry_run: dryRun,
    });
    return {
      success: true,
      data: {
        imported_count: 0,
        skipped_count: 0,
        source_project: manifest.source_project,
        format_version: manifest.format_version,
        file_path: filePath,
        dry_run: dryRun,
      },
    };
  }

  // ── Step 6: Dry-run short-circuit ──────────────────────────────────────────
  if (dryRun) {
    logger.info("memory_import_completed", {
      file_path: filePath,
      imported_count: manifest.memory_count,
      dry_run: true,
    });
    return {
      success: true,
      data: {
        imported_count: manifest.memory_count,
        skipped_count: 0,
        source_project: manifest.source_project,
        format_version: manifest.format_version,
        file_path: filePath,
        dry_run: true,
      },
    };
  }

  // ── Step 7: Insert records ─────────────────────────────────────────────────
  // Note: validateRvfFormat (Step 4) guarantees all entry lines are valid NDJSON
  // with id (string), vector (array), and metadata (object). parseRvfEntry is
  // therefore guaranteed to return non-null for every line in entryLines.
  const entryLines = lines.slice(1);
  let importedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < entryLines.length; i += 1) {
    const line = entryLines[i] ?? "";
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const entry = parseRvfEntry(line, i + 2)!;


    const metadata: Record<string, unknown> = {
      ...entry.metadata,
      // Overwrite source to track import provenance.
      ...(overwriteSource && { source: "import" }),
    };

    try {
      const result = await adapter.insertWithVector(entry.id, entry.vector, metadata);
      if (!result.success) {
        logger.warn("memory_import_entry_skipped", {
          reason: "insert_failed",
          id: entry.id,
          error: result.error,
        });
        skippedCount += 1;
      } else {
        importedCount += 1;
        logger.info("memory_import_entry_processed", {
          id: entry.id,
        });
      }
    } catch (err) {
      logger.warn("memory_import_entry_skipped", {
        reason: "insert_threw",
        id: entry.id,
        error: err instanceof Error ? err.message : "unknown",
      });
      skippedCount += 1;
    }
  }

  logger.info("memory_import_completed", {
    file_path: filePath,
    imported_count: importedCount,
    skipped_count: skippedCount,
    source_project: manifest.source_project,
    dry_run: false,
  });

  return {
    success: true,
    data: {
      imported_count: importedCount,
      skipped_count: skippedCount,
      source_project: manifest.source_project,
      format_version: manifest.format_version,
      file_path: filePath,
      dry_run: false,
    },
  };
}
