import { getVectorStoreAdapterForTools, initializeMemoryOnFirstOperation } from "../../core/plugin.js";
import { logger } from "../../shared/logger.js";
import type { FeedbackType, MemoryFeedbackResult, ToolResponse } from "../../shared/types.js";
import { computeConfidence } from "../../vector/confidence-calculator.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schema for input validation (input arrives as unknown from tool registry)
// ---------------------------------------------------------------------------

const VALID_FEEDBACK_TYPES = ["helpful", "incorrect", "duplicate", "outdated"] as const;

const MemoryFeedbackInputSchema = z.object({
  memory_id: z.string().min(1, "memory_id must be a non-empty string"),
  feedback_type: z.enum(VALID_FEEDBACK_TYPES, {
    errorMap: () => ({
      message:
        "feedback_type must be one of: helpful, incorrect, duplicate, outdated",
    }),
  }),
  source: z.string().optional(),
  context: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Factory that creates the `memory_learn_from_feedback` tool handler.
 *
 * Design contract:
 * - Never throws – all error paths return a structured `ToolResponse`.
 * - Validates via Zod before any side effects.
 * - Atomically reads → mutates counters → recomputes confidence → persists.
 */
export function createMemoryLearnTool(): (
  input?: unknown,
) => Promise<ToolResponse<MemoryFeedbackResult>> {
  return async function memory_learn_from_feedback(
    input?: unknown,
  ): Promise<ToolResponse<MemoryFeedbackResult>> {

    // ------------------------------------------------------------------
    // 1. Validate input
    // ------------------------------------------------------------------
    const parseResult = MemoryFeedbackInputSchema.safeParse(input);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      const message =
        firstIssue?.message ??
        "Invalid input – expected { memory_id: string, feedback_type: 'helpful'|'incorrect'|'duplicate'|'outdated' }";
      logger.warn("feedback_input_invalid", { error: message, input });
      return {
        success: false,
        error: message,
        code: "INVALID_FEEDBACK_TYPE",
        reason: "validation",
      };
    }

    const { memory_id, feedback_type, source, context } = parseResult.data;

    // ------------------------------------------------------------------
    // 2. Ensure plugin + database are ready
    // ------------------------------------------------------------------
    const init = await initializeMemoryOnFirstOperation();
    if (!init.success) {
      return {
        success: false,
        error: init.error,
        code: init.code ?? "ENOTREADY",
        reason: "initialization",
      };
    }

    const vectorStore = getVectorStoreAdapterForTools();
    if (!vectorStore) {
      logger.error("feedback_tool_not_ready", { reason: "plugin not activated" });
      return {
        success: false,
        error: "Plugin not activated – vector store unavailable",
        code: "ENOTREADY",
        reason: "activation",
      };
    }

    // ------------------------------------------------------------------
    // 3. Retrieve existing memory entry
    // ------------------------------------------------------------------
    const getResult = await vectorStore.getById(memory_id);
    if (!getResult.success) {
      logger.warn("feedback_memory_not_found", { memory_id });
      return {
        success: false,
        error: getResult.error,
        code: getResult.code ?? "MEMORY_NOT_FOUND",
        reason: "not_found",
      };
    }

    // ------------------------------------------------------------------
    // 4. Parse metadata (stored as a Record already after getById parses it)
    // ------------------------------------------------------------------
    const metadata = (getResult.data.metadata as Record<string, unknown>) ?? {};

    const prevPos = Math.max(0, Number(metadata["positiveFeedbackCount"] ?? 0));
    const prevNeg = Math.max(0, Number(metadata["negativeFeedbackCount"] ?? 0));
    const access = Math.max(0, Number(metadata["accessCount"] ?? 0));
    const prevConfidence = Number(metadata["confidence"] ?? 0);

    // ------------------------------------------------------------------
    // 5. Increment the appropriate counter
    // ------------------------------------------------------------------
    let newPos = prevPos;
    let newNeg = prevNeg;

    switch (feedback_type as FeedbackType) {
      case "helpful":
        newPos += 1;
        break;
      case "incorrect":
      case "outdated":
      case "duplicate":
        newNeg += 1;
        break;
    }

    // ------------------------------------------------------------------
    // 6. Recompute confidence
    // ------------------------------------------------------------------
    const newConfidence = computeConfidence({
      accessCount: access,
      positiveFeedbackCount: newPos,
      negativeFeedbackCount: newNeg,
    });

    // ------------------------------------------------------------------
    // 7. Merge updated fields into metadata
    // ------------------------------------------------------------------
    const updatedMetadata: Record<string, unknown> = {
      ...metadata,
      positiveFeedbackCount: newPos,
      negativeFeedbackCount: newNeg,
      confidence: newConfidence,
      lastFeedbackAt: new Date().toISOString(),
    };

    // Conditionally add optional provenance fields
    if (source !== undefined) {
      updatedMetadata["feedbackSource"] = source;
    }
    if (context !== undefined) {
      updatedMetadata["feedbackContext"] = context;
    }

    // ------------------------------------------------------------------
    // 8. Persist updated metadata
    // ------------------------------------------------------------------
    const updateResult = await vectorStore.updateMetadata(memory_id, updatedMetadata);
    if (!updateResult.success) {
      logger.error("feedback_update_failed", {
        memory_id,
        error: updateResult.error,
      });
      return {
        success: false,
        error: updateResult.error ?? "Failed to persist feedback",
        code: updateResult.code ?? "EUNEXPECTED",
        reason: "persistence",
      };
    }

    // ------------------------------------------------------------------
    // 9. Log and return success
    // ------------------------------------------------------------------
    const totalFeedback = newPos + newNeg;

    logger.info("feedback_recorded", {
      memory_id,
      feedback_type,
      previous_confidence: prevConfidence,
      new_confidence: newConfidence,
      total_feedback: totalFeedback,
    });

    return {
      success: true,
      data: {
        memory_id,
        feedback_type,
        previous_confidence: prevConfidence,
        new_confidence: newConfidence,
        total_feedback_count: totalFeedback,
      },
    };
  };
}
