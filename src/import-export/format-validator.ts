import { readFileSync } from "node:fs";
import { RVF_FORMAT_VERSION, type RvfManifest } from "../shared/types.js";

/**
 * Validates the RVF file format for a given path.
 * V1 expects:
 * - Line 1: Valid RvfManifest JSON
 * - Remaining lines: Valid NDJSON with { id, vector, metadata }
 */
export function validateRvfFormat(filePath: string): { valid: boolean; error?: string } {
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.trim().split("\n");

    if (lines.length === 0 || !lines[0]) {
      return { valid: false, error: "Empty file" };
    }

    // Validate Manifest
    const manifest = JSON.parse(lines[0]) as RvfManifest;
    if (manifest.format_version !== RVF_FORMAT_VERSION) {
       return { valid: false, error: `Unsupported format version: ${manifest.format_version}` };
    }
    if (typeof manifest.memory_count !== "number" || typeof manifest.vector_dimensions !== "number") {
       return { valid: false, error: "Invalid manifest structure" };
    }

    const entryCount = lines.length - 1;
    if (manifest.memory_count !== entryCount) {
      return {
        valid: false,
        error: `Manifest memory_count (${manifest.memory_count}) does not match entries (${entryCount})`,
      };
    }

    // Validate all entry lines to avoid false positives on partially corrupted files.
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) {
        return { valid: false, error: `Invalid entry at line ${i + 1}` };
      }

      const entry = JSON.parse(line);
      const hasValidMetadata =
        typeof entry.metadata === "object" && entry.metadata !== null && !Array.isArray(entry.metadata);

      if (!entry.id || !hasValidMetadata) {
        return { valid: false, error: `Invalid entry at line ${i + 1}` };
      }

      if (manifest.memory_count > 0 && !Array.isArray(entry.vector)) {
        return { valid: false, error: `Invalid vector at line ${i + 1}` };
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "Unknown error during validation" };
  }
}
