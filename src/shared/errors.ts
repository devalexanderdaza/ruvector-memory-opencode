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
 * Semantic error class for invalid feedback_type values.
 *
 * **Note:** Tool handlers return plain `ToolResponse` literals (never throw),
 * so this class is not instantiated in production code. It serves as:
 *  1. A canonical definition of the `"INVALID_FEEDBACK_TYPE"` error code.
 *  2. A reusable constructor for future higher-level error handling layers.
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
 * Semantic error class for when a memory_id does not exist in the database.
 *
 * **Note:** Tool handlers return plain `ToolResponse` literals (never throw),
 * so this class is not instantiated in production code. It serves as a
 * canonical definition of the `"MEMORY_NOT_FOUND"` error code.
 */
export class MemoryNotFoundError extends RuVectorMemoryError {
  public constructor(message: string) {
    super(message, "MEMORY_NOT_FOUND");
    this.name = "MemoryNotFoundError";
  }
}

/**
 * Semantic error class for when the plugin / vector store is not yet activated.
 *
 * **Note:** Tool handlers return plain `ToolResponse` literals (never throw),
 * so this class is not instantiated in production code. It serves as a
 * canonical definition of the `"ENOTREADY"` error code.
 */
export class NotReadyError extends RuVectorMemoryError {
  public constructor(message = "Plugin not activated – vector store unavailable") {
    super(message, "ENOTREADY");
    this.name = "NotReadyError";
  }
}

