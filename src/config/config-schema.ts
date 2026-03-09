import { z } from "zod";

export const configSchema = z.object({
  db_path: z.string().min(1),
  cache_size: z.number().int().positive(),
  log_level: z.enum(["debug", "info", "warn", "error"]),
  preload_top_memories: z.number().int().min(0),
  vector_dimensions: z.number().int().positive(),
  similarity_threshold: z.number().min(0).max(1),
  vector_index_type: z.literal("hnsw"),
  vector_metric: z.literal("cosine"),
  feedback_weight: z.number().positive(),
  importance_decay: z.number().positive().max(1),
  backup_retention_days: z.number().int().positive(),
  backup_retention_weeks: z.number().int().positive(),
  backup_retention_months: z.number().int().positive(),
});

export type ConfigSchema = z.infer<typeof configSchema>;
