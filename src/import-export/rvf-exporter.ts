import { writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { logger } from "../shared/logger.js";
import { RVF_FORMAT_VERSION, type RvfManifest, type ToolResponse, type MemoryExportResult } from "../shared/types.js";
import type { VectorStoreAdapter } from "../vector/vector-store.js";

export interface ExportOptions {
  adapter: Pick<VectorStoreAdapter, "listAll">;
  outputPath: string;
  projectName: string;
  vectorDimensions: number;
}

/**
 * Exports memory vectors and metadata to a portable .rvf file in NDJSON format.
 * Follows an atomic write pattern (temp file + rename).
 */
export async function exportMemories(
  options: ExportOptions,
): Promise<ToolResponse<MemoryExportResult>> {
  const { adapter, outputPath, projectName, vectorDimensions } = options;
  const tempPath = `${outputPath}.tmp`;

  logger.info("memory_export_started", { 
    project: projectName, 
    output_path: outputPath 
  });

  try {
    const listResult = await adapter.listAll();
    if (!listResult.success) {
      logger.error("memory_export_failed", { 
        reason: "list_all_failed", 
        error: listResult.error 
      });
      return listResult as ToolResponse<never>;
    }

    const { entries } = listResult.data;
    const manifest: RvfManifest = {
      format_version: RVF_FORMAT_VERSION,
      export_timestamp: new Date().toISOString(),
      source_project: projectName,
      memory_count: entries.length,
      vector_dimensions: vectorDimensions,
    };

    // Build NDJSON content
    // We use a simple array join for v1; streaming would be better for very large datasets
    // but this satisfies NFR5 for typical project sizes.
    const lines: string[] = [JSON.stringify(manifest)];
    
    for (const e of entries) {
      lines.push(
        JSON.stringify({
          id: e.id,
          // Ensure vector is serialized as a plain array for JSON compatibility
          vector: Array.isArray(e.vector) ? e.vector : Array.from(e.vector),
          metadata: e.metadata,
        }),
      );
    }

    const content = `${lines.join("\n")}\n`;

    // Atomic write
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(tempPath, content, { encoding: "utf8", flush: true });
    await rename(tempPath, outputPath);

    logger.info("memory_export_completed", { 
      project: projectName, 
      path: outputPath, 
      count: entries.length 
    });

    return {
      success: true,
      data: {
        file_path: outputPath,
        memory_count: entries.length,
        file_size_bytes: Buffer.byteLength(content, "utf8"),
        export_timestamp: manifest.export_timestamp,
        format_version: RVF_FORMAT_VERSION,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error during export";
    logger.error("memory_export_failed", { error: message });
    
    return {
      success: false,
      error: `Export failed: ${message}`,
      code: "EXPORT_FAILED",
      reason: "filesystem",
    };
  }
}
