/**
 * Confidence score calculation for memory reliability assessment.
 *
 * Confidence reflects how trustworthy a memory is based on:
 * - Access frequency (how often agents have used this memory)
 * - Feedback history (positive vs negative corrections)
 *
 * Formula:
 *   confidence = (0.5 * normalizeAccessCount) + (0.5 * feedbackScore)
 *
 * Where:
 *   normalizeAccessCount = min(accessCount / 10, 1.0)  // Cap at 10 accesses
 *   feedbackScore = (positive_feedback - negative_feedback) / max(1, total_feedback)
 *
 * Result is clamped to [-1.0, 1.0] range.
 *
 * Interpretation:
 *   1.0   High confidence (max usage reached, consistently positive feedback)
 *   0.5   Mid-range (max usage reached, zero feedback — OR — moderate usage + strong positive feedback)
 *   0.0   Neutral (zero access count, no feedback)
 *   <0.0  Low confidence (corrected multiple times, flagged unreliable)
 */

export interface MemoryWithFeedback {
  accessCount?: number | undefined;
  positiveFeedbackCount?: number | undefined;
  negativeFeedbackCount?: number | undefined;
}

/**
 * Calculates confidence score for a memory based on access count and feedback.
 *
 * @param memory - Memory object containing accessCount and feedback counts
 * @returns Confidence score in range [-1.0, 1.0]
 */
export function computeConfidence(memory: MemoryWithFeedback): number {
  const accessCount = Math.max(0, memory.accessCount ?? 0);
  const positiveFeedback = Math.max(0, memory.positiveFeedbackCount ?? 0);
  const negativeFeedback = Math.max(0, memory.negativeFeedbackCount ?? 0);

  // Normalize access count: cap at 10 accesses
  const normalizeAccessCount = Math.min(accessCount / 10, 1.0);

  // Calculate feedback score
  const totalFeedback = positiveFeedback + negativeFeedback;
  const feedbackScore =
    totalFeedback > 0
      ? (positiveFeedback - negativeFeedback) / totalFeedback
      : 0;

  // Compute weighted average
  const confidence = 0.5 * normalizeAccessCount + 0.5 * feedbackScore;

  // Clamp to [-1.0, 1.0]
  return Math.max(-1.0, Math.min(1.0, confidence));
}

/**
 * Validates confidence score is within valid bounds.
 *
 * @param score - The confidence score to validate
 * @returns true if score is in [-1.0, 1.0]
 */
export function isValidConfidenceScore(score: number): boolean {
  return Number.isFinite(score) && score >= -1.0 && score <= 1.0;
}
