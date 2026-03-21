import { join } from "node:path";
import { exportMemories } from "../../import-export/index.js";
import {
  ensureProjectContextForTools,
  getVectorStoreAdapterForTools,
  initializeMemoryOnFirstOperation,
} from "../../core/plugin.js";
import type { MemoryExportInput, MemoryExportResult, ToolResponse } from "../../shared/types.js";

/**
 * Factory for the memory_export tool.
 * 
 * Allows users to export the full project memory to a portable .rvf file.
 * The output is a Git-friendly NDJSON format containing manifest, vectors, and metadata.
 */
export function createMemoryExportTool() {
  return async function memory_export(input?: unknown): Promise<ToolResponse<MemoryExportResult>> {
    const init = await initializeMemoryOnFirstOperation();
    if (!init.success) {
      return init as ToolResponse<never>;
    }

    const store = getVectorStoreAdapterForTools();
    if (!store) {
      return {
        success: false,
        error: "Memory system unavailable: plugin not activated",
        code: "PLUGIN_NOT_ACTIVATED",
        reason: "initialization",
      };
    }

    try {
      const projectContext = await ensureProjectContextForTools();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      
      const candidate = (input || {}) as Partial<MemoryExportInput>;
      const outputPathOverride = typeof candidate.output_path === "string" ? candidate.output_path : undefined;

      // Default output path is in .opencode/ related to project root
      const defaultPath = join(
        projectContext.projectRoot,
        ".opencode",
        `project-memory-${timestamp}.rvf`,
      );
      const outputPath = outputPathOverride || defaultPath;

      // Note: vectorDimensions is normally part of the store config.
      // We'll use a hack to get the config from the store if it's there.
      const storeConfig = (store as any).config;
      const dimensions = storeConfig?.vector_dimensions ?? 128;

      return await exportMemories({
        adapter: store,
        outputPath,
        projectName: projectContext.projectName,
        vectorDimensions: dimensions,
      });
    } catch (error) {
      return {
        success: false,
        error: `memory_export failed: ${error instanceof Error ? error.message : "unknown error"}`,
        code: "EUNEXPECTED",
        reason: "execution",
      };
    }
  };
}
