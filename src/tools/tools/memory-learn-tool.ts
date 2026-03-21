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
    // 3. Atomically update the memory entry and recompute confidence
    // ------------------------------------------------------------------
    let prevConfidence = 0;
    let newConfidence = 0;
    let totalFeedback = 0;

    const parseCounter = (val: unknown): number => {
      const num = Number(val);
      return Number.isFinite(num) ? Math.max(0, num) : 0;
    };

    const updateResult = await vectorStore.updateMetadata(memory_id, (metadata) => {
      const prevPos = parseCounter(metadata["positiveFeedbackCount"]);
      const prevNeg = parseCounter(metadata["negativeFeedbackCount"]);
      const access = parseCounter(metadata["accessCount"]);
      
      const rawConf = metadata["confidence"];
      prevConfidence = typeof rawConf === "number" && Number.isFinite(rawConf) ? rawConf : 0;

      let newPos = prevPos;
      let newNeg = prevNeg;

      // Note: feedback does NOT increment accessCount. Only memory_search (agent-context reads)
      // counts as an "access" for the confidence formula. Feedback is a separate signal.
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

      newConfidence = computeConfidence({
        accessCount: access,
        positiveFeedbackCount: newPos,
        negativeFeedbackCount: newNeg,
      });
      totalFeedback = newPos + newNeg;

      const updatedMetadata: Record<string, unknown> = {
        ...metadata,
        positiveFeedbackCount: newPos,
        negativeFeedbackCount: newNeg,
        confidence: newConfidence,
        lastFeedbackAt: new Date().toISOString(),
      };

      if (source !== undefined) {
        updatedMetadata["feedbackSource"] = source;
      }
      if (context !== undefined) {
        updatedMetadata["feedbackContext"] = context;
      }
      
      return updatedMetadata;
    });

    if (!updateResult.success) {
      if (updateResult.code === "MEMORY_NOT_FOUND") {
        logger.warn("feedback_memory_not_found", { memory_id });
      } else {
        logger.error("feedback_update_failed", { memory_id, error: updateResult.error });
      }
      
      return {
        success: false,
        error: updateResult.error ?? "Failed to persist feedback",
        code: updateResult.code ?? "EUNEXPECTED",
        reason: updateResult.code === "MEMORY_NOT_FOUND" ? "not_found" : "persistence",
      };
    }

    // ------------------------------------------------------------------
    // 9. Log and return success
    // ------------------------------------------------------------------

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
