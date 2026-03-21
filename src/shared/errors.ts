export class RuVectorMemoryError extends Error {
  public readonly code: string;

  public constructor(message: string, code = "RUVECTOR_MEMORY_ERROR") {
    super(message);
    this.name = "RuVectorMemoryError";
    this.code = code;
  }
}

export class NodeVersionError extends RuVectorMemoryError {
  public constructor(currentVersion: string, requiredVersion = ">=22.0.0") {
    super(
      `ruvector-memory requires Node.js ${requiredVersion}. Current: ${currentVersion}. Please upgrade: https://nodejs.org`,
      "NODE_VERSION_UNSUPPORTED",
    );
    this.name = "NodeVersionError";
  }
}

export class InitializationError extends RuVectorMemoryError {
  public constructor(message: string, code = "DB_INIT_FAILED") {
    super(message, code);
    this.name = "InitializationError";
  }
}

/**
 * Thrown (and immediately caught) when feedback_type is not one of the allowed
 * enum values: "helpful" | "incorrect" | "duplicate" | "outdated".
 */
export class FeedbackValidationError extends RuVectorMemoryError {
  public constructor(
    message = "Invalid feedback_type. Accepted values: helpful, incorrect, duplicate, outdated",
  ) {
    super(message, "INVALID_FEEDBACK_TYPE");
    this.name = "FeedbackValidationError";
  }
}

/**
 * Thrown (and immediately caught) when the requested memory_id does not exist
 * in the vector database.
 */
export class MemoryNotFoundError extends RuVectorMemoryError {
  public constructor(message: string) {
    super(message, "MEMORY_NOT_FOUND");
    this.name = "MemoryNotFoundError";
  }
}

/**
 * Thrown (and immediately caught) when the plugin / vector store is not yet
 * activated at the time the tool is invoked.
 */
export class NotReadyError extends RuVectorMemoryError {
  public constructor(message = "Plugin not activated – vector store unavailable") {
    super(message, "ENOTREADY");
    this.name = "NotReadyError";
  }
}
