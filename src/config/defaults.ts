import type { RuVectorMemoryConfig } from "../shared/types.js";

export const DEFAULT_CONFIG: RuVectorMemoryConfig = {
  db_path: ".opencode/ruvector-memory.db",
  cache_size: 512,
  log_level: "info",
  preload_top_memories: 5,
};
