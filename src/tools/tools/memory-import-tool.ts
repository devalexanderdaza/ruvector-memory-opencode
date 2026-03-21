import { z } from "zod";
import { importMemories } from "../../import-export/index.js";
import {
  ensureProjectContextForTools,
  getVectorStoreAdapterForTools,
  initializeMemoryOnFirstOperation,
} from "../../core/plugin.js";
import type { MemoryImportInput, MemoryImportResult, ToolResponse } from "../../shared/types.js";

const MemoryImportInputSchema = z
  .object({
    file_path: z.string().trim().min(1, "file_path must be a non-empty string"),
    dry_run: z.boolean().optional(),
    overwrite_source: z.boolean().optional(),
  })
  .strict();

/**
 * Factory for the memory_import tool.
 *
 * Allows users to import memories from a previously exported .rvf file
 * into the current project's vector store.
 *
 * The file must be a valid RVF v1.0.0 NDJSON file (produced by memory_export).
 * Validates the entire file before writing any records (transactional safety).
 */
export function createMemoryImportTool() {
  return async function memory_import(input?: unknown): Promise<ToolResponse<MemoryImportResult>> {
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
      const parseResult = MemoryImportInputSchema.safeParse(input ?? {});
      if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        return {
          success: false,
          error: firstIssue?.message ?? "Invalid input for memory_import",
          code: "INVALID_INPUT",
          reason: "validation",
        };
      }

      const candidate = parseResult.data as MemoryImportInput;

      // Ensure plugin context is available (needed for logging/metrics, not path resolution).
      await ensureProjectContextForTools();

      return await importMemories({
        adapter: store,
        filePath: candidate.file_path,
        dryRun: candidate.dry_run ?? false,
        overwriteSource: candidate.overwrite_source ?? true,
      });
    } catch (error) {
      return {
        success: false,
        error: `memory_import failed: ${error instanceof Error ? error.message : "unknown error"}`,
        code: "EUNEXPECTED",
        reason: "execution",
      };
    }
  };
}
