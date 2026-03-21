import { describe, expect, it } from "vitest";
import { 
  NodeVersionError, 
  InitializationError, 
  FeedbackValidationError, 
  MemoryNotFoundError, 
  NotReadyError,
  RuVectorMemoryError 
} from "../../../src/shared/errors.js";

describe("shared/errors", () => {
  it("NodeVersionError has correct code and message", () => {
    const error = new NodeVersionError("18.0.0");
    expect(error.code).toBe("NODE_VERSION_UNSUPPORTED");
    expect(error.message).toContain("18.0.0");
    expect(error.name).toBe("NodeVersionError");
  });

  it("InitializationError has correct code and message", () => {
    const error = new InitializationError("failure");
    expect(error.code).toBe("DB_INIT_FAILED");
    expect(error.message).toBe("failure");
    expect(error.name).toBe("InitializationError");

    const error2 = new InitializationError("failure", "CUSTOM_CODE");
    expect(error2.code).toBe("CUSTOM_CODE");
  });

  it("FeedbackValidationError has correct code and message", () => {
    const error = new FeedbackValidationError();
    expect(error.code).toBe("INVALID_FEEDBACK_TYPE");
    expect(error.message).toContain("helpful, incorrect, duplicate, outdated");
    expect(error.name).toBe("FeedbackValidationError");
  });

  it("MemoryNotFoundError has correct code and message", () => {
    const error = new MemoryNotFoundError("not found");
    expect(error.code).toBe("MEMORY_NOT_FOUND");
    expect(error.message).toBe("not found");
    expect(error.name).toBe("MemoryNotFoundError");
  });

  it("NotReadyError has correct code and message", () => {
    const error = new NotReadyError();
    expect(error.code).toBe("ENOTREADY");
    expect(error.message).toContain("activated");
    expect(error.name).toBe("NotReadyError");
  });

  it("RuVectorMemoryError defaults code correctly", () => {
    const error = new RuVectorMemoryError("generic error");
    expect(error.code).toBe("RUVECTOR_MEMORY_ERROR");
  });
});
