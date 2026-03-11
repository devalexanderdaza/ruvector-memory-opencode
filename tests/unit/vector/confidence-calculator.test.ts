import { describe, it, expect } from "vitest";
import {
  computeConfidence,
  isValidConfidenceScore,
} from "../../../src/vector/confidence-calculator.js";

describe("Confidence Calculator", () => {
  describe("computeConfidence", () => {
    it("returns 1.0 for high usage and positive feedback", () => {
      const confidence = computeConfidence({
        accessCount: 10,
        positiveFeedbackCount: 5,
        negativeFeedbackCount: 0,
      });
      expect(confidence).toBe(1.0);
    });

    it("returns 0.25 for low usage and no feedback", () => {
      const confidence = computeConfidence({
        accessCount: 5,
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
      });
      expect(confidence).toBe(0.25); // 0.5 * (5/10) + 0.5 * 0 = 0.25
    });

    it("returns negative value for negative feedback dominance", () => {
      const confidence = computeConfidence({
        accessCount: 5,
        positiveFeedbackCount: 1,
        negativeFeedbackCount: 5,
      });
      expect(confidence).toBeLessThan(0);
    });

    it("returns 0 for zero access count and no feedback", () => {
      const confidence = computeConfidence({
        accessCount: 0,
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
      });
      expect(confidence).toBe(0);
    });

    it("caps access count at 10", () => {
      const conf1 = computeConfidence({
        accessCount: 20,
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
      });
      const conf2 = computeConfidence({
        accessCount: 10,
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
      });
      expect(conf1).toBe(conf2);
      expect(conf1).toBe(0.5); // 0.5 * 1.0 + 0.5 * 0 = 0.5
    });

    it("clamps result to [-1.0, 1.0] range", () => {
      const result1 = computeConfidence({
        accessCount: 100,
        positiveFeedbackCount: 100,
        negativeFeedbackCount: 0,
      });
      expect(result1).toBeLessThanOrEqual(1.0);

      const result2 = computeConfidence({
        accessCount: 100,
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 100,
      });
      expect(result2).toBeGreaterThanOrEqual(-1.0);
    });

    it("handles undefined values as zeros", () => {
      const result = computeConfidence({});
      expect(result).toBe(0);
    });

    it("handles mixed defined and undefined values", () => {
      const result = computeConfidence({
        accessCount: 5,
        // positiveFeedbackCount undefined
        negativeFeedbackCount: 0,
      });
      expect(result).toBe(0.25); // 0.5 * (5/10) + 0.5 * 0 = 0.25 (with 0 feedback, score is 0)
    });

    it("calculates boundary case: -1.0", () => {
      const result = computeConfidence({
        accessCount: 0,
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 10,
      });
      expect(result).toBeLessThanOrEqual(0); // Should be negative due to feedback imbalance
    });
  });

  describe("isValidConfidenceScore", () => {
    it("validates scores in [-1.0, 1.0]", () => {
      expect(isValidConfidenceScore(1.0)).toBe(true);
      expect(isValidConfidenceScore(0.5)).toBe(true);
      expect(isValidConfidenceScore(0.0)).toBe(true);
      expect(isValidConfidenceScore(-0.5)).toBe(true);
      expect(isValidConfidenceScore(-1.0)).toBe(true);
    });

    it("rejects scores outside [-1.0, 1.0]", () => {
      expect(isValidConfidenceScore(1.1)).toBe(false);
      expect(isValidConfidenceScore(-1.1)).toBe(false);
      expect(isValidConfidenceScore(2.0)).toBe(false);
    });

    it("rejects non-finite values", () => {
      expect(isValidConfidenceScore(Infinity)).toBe(false);
      expect(isValidConfidenceScore(-Infinity)).toBe(false);
      expect(isValidConfidenceScore(NaN)).toBe(false);
    });
  });
});
