export interface PluginActivationContext {
  projectRoot?: string;
  configPath?: string;
  runtimeNodeVersion?: string;
  toolRegistry?: unknown;
}

export interface ProjectDetectionOptions {
  projectRoot?: string;
}

export interface ProjectDetectionResult {
  projectRoot: string;
  projectName: string;
  projectType: string;
  primaryLanguage: string;
  frameworks: string[];
  stackSignals: string[];
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
  memory_injection_enabled: boolean;
  memory_injection_relevance_threshold: number;
  memory_injection_max_token_budget: number;
}

/**
 * Payload shape for a single memory entry prepared for agent context injection.
 */
export interface MemoryContextPayload {
  id: string;
  content: string;
  source: string;
  confidence: number;
  relevance_score: number;
  timestamp: string;
  tags?: string[];
}

/**
 * Configuration for the passive memory context injection subsystem.
 * Populated from RuVectorMemoryConfig fields at plugin activation time.
 */
export interface MemoryInjectionConfig {
  /** Whether to automatically inject memories into agent context. Default: true */
  enablePassiveInjection: boolean;
  /** Maximum number of memories to inject. Maps to preload_top_memories. Default: 5 */
  maxMemoriesToInject: number;
  /** Minimum relevance score [0,1] for a memory to be injected. Default: 0.7 */
  relevanceThreshold: number;
  /** Estimated token budget for injected memory content. Default: 2000 */
  maxTokenBudget: number;
  /** Output format for the injected memory block. Default: 'markdown' */
  formattingStyle: "markdown" | "json";
}

/**
 * Result returned by MemoryContextInjector.inject().
 */
export interface MemoryInjectionResult {
  /** Formatted memory context string ready for injection into system prompt */
  context: string;
  /** Number of memories actually included in context */
  memoriesInjected: number;
  /** Estimated token count of the full context string */
  tokensUsed: number;
  /** True if injection was skipped (disabled, circuit breaker open) */
  skipped: boolean;
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

export interface MemorySaveInput {
  content: string;
  /**
   * Optional tags that help classify this memory.
   * Non‑string values are ignored at runtime.
   */
  tags?: string[];
  /**
   * Logical source of the memory (e.g. "documentation", "conversation").
   * Defaults to "unknown" when not provided.
   */
  source?: string;
  /**
   * Importance level used for retrieval and ranking policies.
   * Defaults to "normal" when not provided or invalid.
   */
  priority?: "critical" | "normal" | "low";
  /**
   * Optional confidence score in range [0, 1].
   * Defaults to 0.5 when not provided or invalid.
   */
  confidence?: number;
}

export interface MemorySaveResult {
  id: string;
}

export interface MemorySearchItem {
  id: string;
  score: number;
  content?: string;
  metadata?: Record<string, unknown> | string;
}

/**
 * Represents a single memory item in enriched search results.
 * Includes all metadata needed for agents to understand memory reliability and context.
 *
 * @property id - Unique memory identifier (UUID) for traceability
 * @property content - Original captured text (max 8KB)
 * @property relevance - Composite similarity score in range [0.0, 1.0]
 * @property confidence - Learning signal based on usage + feedback in range [-1.0, 1.0]
 *   - 1.0: High confidence (max usage reached, consistently positive feedback)
 *   - 0.5: Mid-range (usage cap of 10 reached with zero feedback, or moderate usage with strong positive feedback)
 *   - 0.0: Neutral (zero accesses and no feedback)
 *   - <0.0: Low confidence (corrected multiple times)
 * @property timestamp - ISO-8601 datetime when memory was created
 * @property source - Origin of memory: "manual" (user saved), "agent" (auto-captured), or "import" (from .rvf)
 * @property tags - Optional user-supplied classification tags
 * @property importance - Optional importance level on 1-5 scale
 * @property projectContext - Optional auto-detected project identifier
 */
export interface SearchResult {
  id: string;
  content: string;
  relevance: number;
  confidence: number;
  timestamp: string;
  source: "manual" | "agent" | "import";
  tags?: string[];
  importance?: number;
  projectContext?: string;
  projectName?: string;
  projectType?: string;
  primaryLanguage?: string;
  frameworks?: string[];
  /** Optional reference to a canonical memory if this is a duplicate. */
  mergedIntoId?: string | undefined;
}

/**
 * Response format for memory_search() tool.
 * Includes enriched results and performance metadata for agent insight.
 */
export interface MemorySearchResponse {
  success: boolean;
  results: SearchResult[];
  count: number;
  _meta?: {
    query: string;
    timestamp: string;
    queryLatencyMs: number;
  };
}

export interface MemorySearchResult {
  items: MemorySearchItem[];
}

export interface MemorySearchFilters {
  tags?: string[];
  source?: string;
  created_after?: string | number;
  created_before?: string | number;
  project_name?: string;
  project_type?: string;
  primary_language?: string;
  frameworks?: string[];
}

export interface MemorySearchInput {
  query: string;
  limit?: number;
  filters?: MemorySearchFilters;
}

export interface LoggerLike {
  debug(event: string, metadata?: Record<string, unknown>): void;
  info(event: string, metadata?: Record<string, unknown>): void;
  warn(event: string, metadata?: Record<string, unknown>): void;
  error(event: string, metadata?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Feedback types (Story 3.1)
// ---------------------------------------------------------------------------

/** Allowed feedback values for memory_learn_from_feedback. */
export type FeedbackType = "helpful" | "incorrect" | "duplicate" | "outdated";

/** Input shape for the memory_learn_from_feedback tool. */
export interface MemoryFeedbackInput {
  memory_id: string;
  feedback_type: FeedbackType;
  /** Optional actor/caller identifier – defaults to "agent". */
  source?: string;
  /** Optional free-text reason surfaced alongside feedback in metadata. */
  context?: string;
  /** Optional ID of the canonical memory if feedback_type is 'duplicate'. */
  canonical_id?: string;
}

/** Result returned by memory_learn_from_feedback on success. */
export interface MemoryFeedbackResult {
  memory_id: string;
  feedback_type: FeedbackType;
  previous_confidence: number;
  new_confidence: number;
  total_feedback_count: number;
  /** Present if feedback_type was "duplicate" and a canonical ID was linked. */
  merged_into_id?: string | undefined;
}

export interface LearningMetricsInput {
  lookback_days?: number;
  sample_limit?: number;
}

export interface LearningMetricsResult {
  hit_rate: number;
  helpful_feedback_count: number;
  negative_feedback_count: number;
  total_feedback_count: number;
  feedback_trend: "up" | "down" | "stable" | "insufficient_data";
  trend_delta: number;
  learning_velocity_per_day: number;
  learning_velocity_window_days: number;
  evaluated_memory_count: number;
  sampled_memory_count: number;
}

export interface LearningAuditHistoryInput {
  limit?: number;
  memory_id?: string;
}

export interface LearningAuditHistoryEvent {
  actor: string;
  action: FeedbackType;
  memory_id: string;
  timestamp: string;
  context?: string;
}

export interface LearningAuditHistoryResult {
  events: LearningAuditHistoryEvent[];
  count: number;
  limit: number;
  sampled_memory_count: number;
}


// ---------------------------------------------------------------------------
// Export/Import types (Story 4.1+)
// ---------------------------------------------------------------------------

/** Current version of the portable .rvf format. */
export const RVF_FORMAT_VERSION = "1.0.0";

/** Manifest header for the .rvf export file. */
export interface RvfManifest {
  format_version: string;
  export_timestamp: string;
  source_project: string;
  memory_count: number;
  vector_dimensions: number;
}

/** Input for the memory_export tool. */
export interface MemoryExportInput {
  /** Optional directory or full file path for the export. Defaults to .opencode/ */
  output_path?: string;
  /** Whether to include the high-dimensional vectors. Default: true */
  include_vectors?: boolean;
  /** Optional metadata filters to limit exported memories. */
  filters?: {
    source?: string;
    tags?: string[];
  };
}

/** Result returned by memory_export tool on success. */
export interface MemoryExportResult {
  file_path: string;
  memory_count: number;
  file_size_bytes: number;
  export_timestamp: string;
  format_version: string;
}

/** Input for the memory_import tool (Story 4.2). */
export interface MemoryImportInput {
  /** Absolute or relative path to the .rvf file to import. */
  file_path: string;
  /**
   * When true, validate the file and count importable entries without
   * writing anything to the vector store. Default: false.
   */
  dry_run?: boolean;
  /**
   * When true, overwrite the `source` field of each imported memory with
   * "import" to track provenance. Default: true.
   */
  overwrite_source?: boolean;
}

/** Result returned by memory_import tool on success (Story 4.2). */
export interface MemoryImportResult {
  /** Number of memory entries successfully written to the store. */
  imported_count: number;
  /** Number of entries skipped (e.g. in dry_run mode or parse errors). */
  skipped_count: number;
  /** Project name from the .rvf manifest. */
  source_project: string;
  /** Format version string from the .rvf manifest. */
  format_version: string;
  /** Path of the file that was imported. */
  file_path: string;
  /** Whether the import was a dry run (no writes performed). */
  dry_run: boolean;
}

/** Specific error codes for feedback logic. */
export enum FeedbackErrorCode {
  CANONICAL_NOT_FOUND = "CANONICAL_NOT_FOUND",
  MEMORY_NOT_FOUND = "MEMORY_NOT_FOUND",
  INVALID_FEEDBACK_TYPE = "INVALID_FEEDBACK_TYPE",
  MISSING_CANONICAL_ID = "MISSING_CANONICAL_ID",
}
