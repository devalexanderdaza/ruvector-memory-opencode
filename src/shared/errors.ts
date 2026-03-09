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
