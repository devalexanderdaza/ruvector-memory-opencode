export interface PluginActivationContext {
  projectRoot?: string;
  configPath?: string;
  runtimeNodeVersion?: string;
  toolRegistry?: unknown;
}

export interface RuVectorMemoryConfig {
  db_path: string;
  cache_size: number;
  log_level: "debug" | "info" | "warn" | "error";
  preload_top_memories: number;
  vector_dimensions: number;
  similarity_threshold: number;
  vector_index_type: "hnsw";
  vector_metric: "cosine";
  feedback_weight: number;
  importance_decay: number;
  backup_retention_days: number;
  backup_retention_weeks: number;
  backup_retention_months: number;
}

export type ToolResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; reason?: string; code?: string };

export interface ActivationResult {
  activated: boolean;
  degraded: boolean;
  message: string;
}

export interface VectorInitializationData {
  firstRun: boolean;
  created: boolean;
  dbPath: string;
  initializationMs: number;
  databaseSize: number;
}

export interface InitMetricsPayload {
  initializationTime: number;
  firstOperationTime: number;
  databaseSize: number;
  success: boolean;
  errorType?: string;
}

export type InitResult = ToolResponse<VectorInitializationData>;

export interface MemorySaveResult {
  id: string;
}

export interface MemorySearchItem {
  id: string;
  score: number;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  items: MemorySearchItem[];
}

export interface LoggerLike {
  debug(event: string, metadata?: Record<string, unknown>): void;
  info(event: string, metadata?: Record<string, unknown>): void;
  warn(event: string, metadata?: Record<string, unknown>): void;
  error(event: string, metadata?: Record<string, unknown>): void;
}
