export interface PluginActivationContext {
  projectRoot?: string;
  configPath?: string;
  runtimeNodeVersion?: string;
}

export interface RuVectorMemoryConfig {
  db_path: string;
  cache_size: number;
  log_level: "debug" | "info" | "warn" | "error";
  preload_top_memories: number;
}

export type ToolResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; reason?: string; code?: string };

export interface ActivationResult {
  activated: boolean;
  degraded: boolean;
  message: string;
}

export interface LoggerLike {
  debug(event: string, metadata?: Record<string, unknown>): void;
  info(event: string, metadata?: Record<string, unknown>): void;
  warn(event: string, metadata?: Record<string, unknown>): void;
  error(event: string, metadata?: Record<string, unknown>): void;
}
