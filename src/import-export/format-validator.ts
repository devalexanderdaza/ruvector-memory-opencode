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

    // Validate Entry Lines (sample first and last to save time/CPU)
    if (lines.length > 1) {
      const sampleIndices = [1, lines.length - 1];
      for (const i of sampleIndices) {
        const line = lines[i];
        if (!line) continue;
        const entry = JSON.parse(line);
        if (!entry.id || !Array.isArray(entry.vector) || typeof entry.metadata !== "object") {
          return { valid: false, error: `Invalid entry at line ${i + 1}` };
        }
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "Unknown error during validation" };
  }
}
