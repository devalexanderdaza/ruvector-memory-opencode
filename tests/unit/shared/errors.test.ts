import { describe, it, expect } from "vitest";
import {
  RuVectorMemoryError,
  NodeVersionError,
  InitializationError,
  FeedbackValidationError,
  MemoryNotFoundError,
  NotReadyError,
} from "../../../src/shared/errors.js";

describe("shared/errors.ts", () => {
  it("RuVectorMemoryError should initialize properly", () => {
    const err = new RuVectorMemoryError("Test msg", "CUSTOM_CODE");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("RuVectorMemoryError");
    expect(err.message).toBe("Test msg");
    expect(err.code).toBe("CUSTOM_CODE");
  });

  it("NodeVersionError should include default and custom values", () => {
    const err = new NodeVersionError("v18.0.0", ">=22.0.0");
    expect(err.message).toContain("ruvector-memory requires Node.js >=22.0.0. Current: v18.0.0. Please upgrade: https://nodejs.org");
    expect(err.name).toBe("NodeVersionError");
    expect(err.code).toBe("NODE_VERSION_UNSUPPORTED");
  });

  it("InitializationError should initialize properly", () => {
    const err = new InitializationError("Failed init", "MY_INIT_FAIL");
    expect(err.message).toBe("Failed init");
    expect(err.name).toBe("InitializationError");
    expect(err.code).toBe("MY_INIT_FAIL");

    const err2 = new InitializationError("Def");
    expect(err2.code).toBe("DB_INIT_FAILED");
  });

  it("FeedbackValidationError should initialize properly", () => {
    const err = new FeedbackValidationError();
    expect(err.message).toContain("Invalid feedback_type");
    expect(err.name).toBe("FeedbackValidationError");
    expect(err.code).toBe("INVALID_FEEDBACK_TYPE");
    
    const err2 = new FeedbackValidationError("custom custom");
    expect(err2.message).toBe("custom custom");
  });

  it("MemoryNotFoundError should initialize properly", () => {
    const err = new MemoryNotFoundError("Id 123 not found");
    expect(err.message).toBe("Id 123 not found");
    expect(err.name).toBe("MemoryNotFoundError");
    expect(err.code).toBe("MEMORY_NOT_FOUND");
  });

  it("NotReadyError should initialize properly", () => {
    const err = new NotReadyError();
    expect(err.message).toBe("Plugin not activated – vector store unavailable");
    expect(err.name).toBe("NotReadyError");
    expect(err.code).toBe("ENOTREADY");
    
    const err2 = new NotReadyError("my not ready code");
    expect(err2.message).toBe("my not ready code");
  });
});
