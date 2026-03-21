import {
  getVectorStoreAdapterForTools,
  initializeMemoryOnFirstOperation,
} from "../../core/plugin.js";
import { createHash } from "node:crypto";
import { logger } from "../../shared/logger.js";
import type {
  FeedbackType,
  MemoryFeedbackResult,
  ToolResponse,
} from "../../shared/types.js";
import { computeConfidence } from "../../vector/confidence-calculator.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schema for input validation (input arrives as unknown from tool registry)
// ---------------------------------------------------------------------------

const VALID_FEEDBACK_TYPES = [
  "helpful",
  "incorrect",
  "duplicate",
  "outdated",
] as const;
const PATTERN_DEPRIORITIZATION_THRESHOLD = 3;
const RELATED_MEMORY_SCAN_LIMIT = 25;
const RELATED_PATTERN_MAX_SCORE = 0.35;

const MemoryFeedbackInputSchema = z
  .object({
    memory_id: z.string().min(1, "memory_id must be a non-empty string"),
    feedback_type: z.enum(VALID_FEEDBACK_TYPES, {
      errorMap: () => ({
        message:
          "feedback_type must be one of: helpful, incorrect, duplicate, outdated",
      }),
    }),
    source: z.string().optional(),
    context: z.string().optional(),
    canonical_id: z.string().optional(),
  })
  .refine(
    (data) => {
      // If feedback_type is duplicate, canonical_id MUST be provided
      if (
        data.feedback_type === "duplicate" &&
        (!data.canonical_id || data.canonical_id.trim() === "")
      ) {
        return false;
      }
      return true;
    },
    {
      message: "canonical_id is required when feedback_type is 'duplicate'",
      path: ["canonical_id"],
    },
  );

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
      const code = firstIssue?.path.includes("canonical_id")
        ? "MISSING_CANONICAL_ID"
        : firstIssue?.path.includes("feedback_type")
          ? "INVALID_FEEDBACK_TYPE"
          : firstIssue?.path.includes("memory_id")
            ? "INVALID_MEMORY_ID"
            : "INVALID_FEEDBACK_INPUT";
      return {
        success: false,
        error: message,
        code,
        reason: "validation",
      };
    }

    const { memory_id, feedback_type, source, context, canonical_id } =
      parseResult.data;

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
      logger.error("feedback_tool_not_ready", {
        reason: "plugin not activated",
      });
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
    const normalizeForPattern = (value: string): string =>
      value.trim().toLowerCase().replace(/\s+/g, " ");
    const derivePatternKey = (
      content: string,
      category: FeedbackType,
      sourceForPattern: string,
    ): string => {
      const normalized = `${normalizeForPattern(content)}|${category}|${normalizeForPattern(sourceForPattern)}`;
      return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
    };
    const parseString = (value: unknown): string | undefined => {
      if (typeof value !== "string") {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };
    const parseMetadataRecord = (value: unknown): Record<string, unknown> => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
      return {};
    };
    const shouldApplyPatternPolicy = (type: FeedbackType): boolean =>
      type === "incorrect" || type === "outdated" || type === "duplicate";
    const isRelatedByScore = (score: unknown): boolean => {
      if (typeof score !== "number" || !Number.isFinite(score)) {
        return false;
      }
      return score <= RELATED_PATTERN_MAX_SCORE;
    };
    const toTokenSet = (value: string): Set<string> => {
      const cleaned = value.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
      return new Set(
        cleaned
          .split(/\s+/)
          .map((token) => token.trim())
          .filter((token) => token.length >= 4),
      );
    };
    const hasLexicalRelatedness = (a: string, b: string): boolean => {
      const setA = toTokenSet(a);
      const setB = toTokenSet(b);
      if (setA.size === 0 || setB.size === 0) {
        return false;
      }
      let intersection = 0;
      for (const token of setA) {
        if (setB.has(token)) {
          intersection += 1;
        }
      }
      const union = new Set([...setA, ...setB]).size;
      const jaccard = union > 0 ? intersection / union : 0;
      return jaccard >= 0.35;
    };

    // ------------------------------------------------------------------
    // 3. Validate existence of canonical memory if this is a duplicate feedback
    // ------------------------------------------------------------------
    if (feedback_type === "duplicate" && canonical_id) {
      const canonicalCheck = await vectorStore.getById(canonical_id);
      if (!canonicalCheck.success) {
        return {
          success: false,
          error: `Canonical memory "${canonical_id}" not found. Cannot mark as duplicate of an unknown memory.`,
          code: "CANONICAL_NOT_FOUND",
          reason: "not_found",
        };
      }
    }
    const currentMemory = await vectorStore.getById(memory_id);
    if (!currentMemory.success) {
      return {
        success: false,
        error: currentMemory.error ?? "Memory not found",
        code: currentMemory.code ?? "MEMORY_NOT_FOUND",
        reason: currentMemory.reason ?? "not_found",
      };
    }
    const currentMetadata = parseMetadataRecord(currentMemory.data.metadata);
    const currentContent = parseString(currentMemory.data.content);
    if (!currentContent) {
      return {
        success: false,
        error: `Memory "${memory_id}" has no retrievable content for feedback pattern analysis.`,
        code: "MEMORY_CONTENT_UNAVAILABLE",
        reason: "validation",
      };
    }
    const sourceForPattern =
      source?.trim() ||
      parseString(currentMetadata?.["source"]) ||
      parseString(currentMetadata?.["feedbackSource"]) ||
      "unknown";
    const patternKey = derivePatternKey(
      currentContent,
      feedback_type,
      sourceForPattern,
    );
    const isPatternPolicyFeedback = shouldApplyPatternPolicy(feedback_type);
    const relatedMemoryIds = new Set<string>([memory_id]);

    if (isPatternPolicyFeedback) {
      const similar = await vectorStore.search(
        currentContent,
        RELATED_MEMORY_SCAN_LIMIT,
      );
      if (similar.success) {
        for (const item of similar.data.items) {
          if (typeof item.id !== "string" || item.id.trim().length === 0) {
            continue;
          }
          const itemMetadata = parseMetadataRecord(item.metadata);
          const itemContent = parseString(item.content);
          if (!itemContent) {
            continue;
          }
          const itemSourceForPattern =
            source?.trim() ||
            parseString(itemMetadata["source"]) ||
            parseString(itemMetadata["feedbackSource"]) ||
            "unknown";
          if (itemSourceForPattern !== sourceForPattern) {
            continue;
          }
          const isRelated =
            isRelatedByScore(item.score) ||
            hasLexicalRelatedness(currentContent, itemContent);
          if (item.id !== memory_id && !isRelated) {
            continue;
          }
          const itemPatternKey = derivePatternKey(
            itemContent,
            feedback_type,
            itemSourceForPattern,
          );
          if (itemPatternKey === patternKey || isRelated) {
            relatedMemoryIds.add(item.id);
          }
        }
      }
    }
    const computeGlobalPatternNegativeCount = async (): Promise<number> => {
      if (!isPatternPolicyFeedback) {
        return parseCounter(currentMetadata["patternNegativeCount"]);
      }
      let accumulated = 0;
      for (const relatedId of relatedMemoryIds) {
        const relatedEntry = await vectorStore.getById(relatedId);
        if (!relatedEntry.success) {
          continue;
        }
        const relatedMetadata = parseMetadataRecord(relatedEntry.data.metadata);
        accumulated += parseCounter(relatedMetadata["negativeFeedbackCount"]);
      }
      return accumulated + 1;
    };
    const globalPatternNegativeCount =
      await computeGlobalPatternNegativeCount();
    let patternNegativeCount = 0;
    let policyTriggered = false;
    let impactedMemoryIds: string[] = [];
    let policyRationale = "";
    const feedbackTimestamp = new Date().toISOString();
    const feedbackActor = source?.trim() || "agent";
    const compactContext =
      typeof context === "string" ? context.trim().replace(/;/g, ",") : "";

    const updateResult = await vectorStore.updateMetadata(
      memory_id,
      (metadata) => {
        const prevPos = parseCounter(metadata["positiveFeedbackCount"]);
        const prevNeg = parseCounter(metadata["negativeFeedbackCount"]);
        const access = parseCounter(metadata["accessCount"]);

        const rawConf = metadata["confidence"];
        prevConfidence =
          typeof rawConf === "number" && Number.isFinite(rawConf) ? rawConf : 0;

        let newPos = prevPos;
        let newNeg = prevNeg;

        // Note: feedback does NOT increment accessCount. Only memory_search (agent-context reads)
        // counts as an "access" for the confidence formula. Feedback is a separate signal.
        let newIncorrect = parseCounter(metadata["incorrectCount"]);
        let newOutdated = parseCounter(metadata["outdatedCount"]);

        switch (feedback_type as FeedbackType) {
          case "helpful":
            newPos += 1;
            break;
          case "incorrect":
            newNeg += 1;
            newIncorrect += 1;
            break;
          case "outdated":
            newNeg += 1;
            newOutdated += 1;
            break;
          case "duplicate":
            newNeg += 1;
            break;
        }
        const newPatternNegativeCount = isPatternPolicyFeedback
          ? globalPatternNegativeCount
          : parseCounter(metadata["patternNegativeCount"]);
        patternNegativeCount = newPatternNegativeCount;
        policyTriggered =
          newPatternNegativeCount >= PATTERN_DEPRIORITIZATION_THRESHOLD;
        if (policyTriggered) {
          policyRationale = `threshold_reached:${newPatternNegativeCount}>=${PATTERN_DEPRIORITIZATION_THRESHOLD}`;
        }

        const isDuplicate =
          feedback_type === "duplicate" ||
          metadata["mergedIntoId"] !== undefined;

        newConfidence = computeConfidence({
          accessCount: access,
          positiveFeedbackCount: newPos,
          negativeFeedbackCount: newNeg,
          isDuplicate,
        });
        totalFeedback = newPos + newNeg;

        const updatedMetadata: Record<string, unknown> = {
          ...metadata,
          positiveFeedbackCount: newPos,
          negativeFeedbackCount: newNeg,
          incorrectCount: newIncorrect,
          outdatedCount: newOutdated,
          confidence: newConfidence,
          lastFeedbackAt: feedbackTimestamp,
          patternKey,
          patternCategory: feedback_type,
          patternSource: sourceForPattern,
          patternNegativeCount: newPatternNegativeCount,
          patternThreshold: PATTERN_DEPRIORITIZATION_THRESHOLD,
          patternAutoDeprioritized: policyTriggered,
        };
        const existingHistoryRaw = metadata["feedbackHistory"];
        const existingHistory = Array.isArray(existingHistoryRaw)
          ? existingHistoryRaw.filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [];
        const nextHistoryEntry = [
          `ts=${feedbackTimestamp}`,
          `actor=${feedbackActor}`,
          `action=${feedback_type}`,
          `memory_id=${memory_id}`,
          ...(compactContext.length > 0 ? [`context=${compactContext}`] : []),
        ].join(";");
        updatedMetadata["feedbackHistory"] = [
          ...existingHistory,
          nextHistoryEntry,
        ];
        if (policyTriggered) {
          updatedMetadata["patternDeprioritizedAt"] = new Date().toISOString();
          updatedMetadata["patternRationale"] = policyRationale;
          updatedMetadata["confidence"] = -1.0;
          newConfidence = -1.0;
        }

        if (feedback_type === "duplicate" && canonical_id) {
          updatedMetadata["mergedIntoId"] = canonical_id;
          updatedMetadata["duplicateOf"] = canonical_id;
        }

        if (source !== undefined) {
          updatedMetadata["feedbackSource"] = source;
        } else {
          delete updatedMetadata["feedbackSource"];
        }

        if (context !== undefined) {
          updatedMetadata["feedbackContext"] = context;
        } else {
          delete updatedMetadata["feedbackContext"];
        }

        return updatedMetadata;
      },
    );

    if (!updateResult.success) {
      if (updateResult.code === "MEMORY_NOT_FOUND") {
        logger.warn("feedback_memory_not_found", { memory_id });
      } else {
        logger.error("feedback_update_failed", {
          memory_id,
          error: updateResult.error,
        });
      }

      return {
        success: false,
        error: updateResult.error ?? "Failed to persist feedback",
        code: updateResult.code ?? "EUNEXPECTED",
        reason:
          updateResult.code === "MEMORY_NOT_FOUND"
            ? "not_found"
            : "persistence",
      };
    }
    if (policyTriggered && isPatternPolicyFeedback) {
      impactedMemoryIds = Array.from(relatedMemoryIds).sort();
      const policyTimestamp = new Date().toISOString();
      for (const relatedId of impactedMemoryIds) {
        if (relatedId === memory_id) {
          continue;
        }
        const relatedUpdate = await vectorStore.updateMetadata(
          relatedId,
          (metadata): Record<string, unknown> => {
            const relatedMergedIntoId =
              parseString(metadata["mergedIntoId"]) ??
              parseString(metadata["duplicateOf"]);
            return {
              ...metadata,
              confidence: -1.0,
              patternKey,
              patternCategory: feedback_type,
              patternSource: sourceForPattern,
              patternNegativeCount: patternNegativeCount,
              patternThreshold: PATTERN_DEPRIORITIZATION_THRESHOLD,
              patternAutoDeprioritized: true,
              patternDeprioritizedAt: policyTimestamp,
              patternRationale: policyRationale,
              ...(relatedMergedIntoId
                ? { mergedIntoId: relatedMergedIntoId }
                : {}),
            };
          },
        );
        if (!relatedUpdate.success) {
          logger.warn("pattern_deprioritization_partial_failure", {
            pattern_key: patternKey,
            memory_id: relatedId,
            error_code: relatedUpdate.code ?? "UNKNOWN",
          });
        }
      }
      logger.info("pattern_auto_deprioritized", {
        pattern_key: patternKey,
        pattern_category: feedback_type,
        pattern_source: sourceForPattern,
        threshold: PATTERN_DEPRIORITIZATION_THRESHOLD,
        pattern_negative_count: patternNegativeCount,
        rationale: policyRationale,
        impacted_memory_count: impactedMemoryIds.length,
        impacted_memory_ids_csv: impactedMemoryIds.join(","),
      });
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
    logger.info("feedback_audit_recorded", {
      actor: feedbackActor,
      action: feedback_type,
      memory_id,
      timestamp: feedbackTimestamp,
      has_context: compactContext.length > 0 ? "true" : "false",
    });

    return {
      success: true,
      data: {
        memory_id,
        feedback_type,
        previous_confidence: prevConfidence,
        new_confidence: newConfidence,
        total_feedback_count: totalFeedback,
        merged_into_id: canonical_id,
      },
    };
  };
}
