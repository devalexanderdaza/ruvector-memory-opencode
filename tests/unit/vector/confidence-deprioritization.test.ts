import { describe, it, expect } from "vitest";
import {
  computeConfidence,
} from "../../../src/vector/confidence-calculator.js";

describe("Confidence Calculator - Negative Feedback Deprioritization", () => {
  it("penalizes incorrect/outdated feedback aggressively", () => {
    // 10 accesses (high trust) + 1 negative feedback
    // Currently: 0.5 * 1.0 + 0.5 * (-1/1) = 0
    const conf1 = computeConfidence({
      accessCount: 10,
      negativeFeedbackCount: 1,
    });
    
    // We expect it to drop faster than just 0.0
    // If it's incorrect, it should arguably be sub-zero even after 1 correction if trust was only moderate.
    expect(conf1).toBeLessThanOrEqual(0);
  });

  it("reaches strongly negative confidence after 3 negative feedbacks (FR16)", () => {
    // 10 accesses + 3 negative feedbacks
    // Currently: 0.5 * 1.0 + 0.5 * (-3/3) = 0
    const conf3 = computeConfidence({
      accessCount: 10,
      negativeFeedbackCount: 3,
    });
    
    // According to FR16, 3 corrections should trigger "auto-deprioritization".
    // This should definitely be negative.
    expect(conf3).toBeLessThan(-0.5); 
  });

  it("maintains bounds even with extreme negative feedback", () => {
    const result = computeConfidence({
      accessCount: 0,
      negativeFeedbackCount: 100,
    });
    expect(result).toBe(-1.0);
  });

  it("overrides positive feedback with heavy negative feedback", () => {
    // 5 positive vs 5 negative
    // Currently: 0.5 * 1.0 + 0.5 * (5-5)/10 = 0.5
    const conf = computeConfidence({
      accessCount: 10,
      positiveFeedbackCount: 5,
      negativeFeedbackCount: 5,
    });
    
    // If a memory has as many negative as positive, it's "controversial" and should probably
    // be lower than "neutral" (0.5)
    expect(conf).toBeLessThan(0.3);
  });
});
