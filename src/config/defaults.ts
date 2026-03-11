import type { RuVectorMemoryConfig } from "../shared/types.js";

export const DEFAULT_CONFIG: RuVectorMemoryConfig = {
  db_path: ".opencode/ruvector_memory.db",
  cache_size: 1000,
  log_level: "info",
  preload_top_memories: 5,
  vector_dimensions: 384,
  similarity_threshold: 0.75,
  vector_index_type: "hnsw",
  vector_metric: "cosine",
  feedback_weight: 0.1,
  importance_decay: 0.95,
  backup_retention_days: 7,
  backup_retention_weeks: 4,
  backup_retention_months: 12,
  memory_injection_enabled: true,
  memory_injection_relevance_threshold: 0.7,
  memory_injection_max_token_budget: 2000,
};
