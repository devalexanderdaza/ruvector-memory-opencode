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
