# Configuration Guide

`@ruvector/opencode-memory` works with zero configuration. All options have sensible defaults. This guide describes every configuration option available.

---

## Configuration Priority Order

Settings are merged from three sources in order of precedence:

```
1. YAML config file  (highest priority — overrides everything)
2. Environment variables  (overrides defaults)
3. Built-in defaults  (lowest priority — always available)
```

---

## YAML Configuration File

**Default path:** `.opencode/ruvector_memory_config.yaml` (relative to project root)

**Custom path:** pass `configPath` to `activatePlugin()` or set it in context.

### Example: Full Configuration

```yaml
# .opencode/ruvector_memory_config.yaml

# ── Database ─────────────────────────────────────────────────────────────────
# Path to SQLite vector database file (relative to project root)
# Default: .opencode/ruvector_memory.db
db_path: .opencode/ruvector-memory.db

# Number of in-memory cache entries before accessing disk
# Default: 1000
cache_size: 1000

# ── Logging ───────────────────────────────────────────────────────────────────
# Logging verbosity: debug | info | warn | error
# Default: info
log_level: info

# ── Memory Preloading ─────────────────────────────────────────────────────────
# Number of memories injected into agent context at session start
# Default: 5
preload_top_memories: 5

# ── Vector Settings ───────────────────────────────────────────────────────────
# Embedding vector dimensions (must match the embedding model)
# Default: 384
vector_dimensions: 384

# Minimum cosine similarity score for search results [0.0 – 1.0]
# Lower = more results but less relevant; Higher = fewer but very relevant
# Default: 0.75
similarity_threshold: 0.75

# Vector index algorithm (only "hnsw" supported currently)
vector_index_type: hnsw

# Distance metric (only "cosine" supported currently)
vector_metric: cosine

# ── Learning & Feedback ───────────────────────────────────────────────────────
# Weight applied to feedback signals when recalculating confidence [0.0 – 1.0]
# Default: 0.1
feedback_weight: 0.1

# Time decay multiplier for memory importance [0.0 – 1.0]
# Default: 0.95
importance_decay: 0.95

# ── Backup Retention ──────────────────────────────────────────────────────────
# Number of daily backups to retain
# Default: 7
backup_retention_days: 7

# Number of weekly backups to retain
# Default: 4
backup_retention_weeks: 4

# Number of monthly backups to retain
# Default: 12
backup_retention_months: 12

# ── Context Injection ─────────────────────────────────────────────────────────
# Whether to automatically inject memories into agent context
# Default: true
memory_injection_enabled: true

# Minimum relevance score for a memory to be injected passively [0.0 – 1.0]
# Default: 0.7
memory_injection_relevance_threshold: 0.7

# Maximum token budget for injected memory context
# Default: 2000
memory_injection_max_token_budget: 2000
```

---

## Environment Variables

All environment variables use the prefix `RUVECTOR_MEMORY_`.

| Variable | Config Key | Type | Example |
|---|---|---|---|
| `RUVECTOR_MEMORY_DB_PATH` | `db_path` | string | `/data/memory.db` |
| `RUVECTOR_MEMORY_CACHE_SIZE` | `cache_size` | integer | `512` |
| `RUVECTOR_MEMORY_LOG_LEVEL` | `log_level` | enum | `debug` |
| `RUVECTOR_MEMORY_PRELOAD_TOP` | `preload_top_memories` | integer | `10` |

**Example:**

```bash
export RUVECTOR_MEMORY_LOG_LEVEL=debug
export RUVECTOR_MEMORY_DB_PATH=/tmp/my-memory.db
export RUVECTOR_MEMORY_PRELOAD_TOP=10
```

> Environment variables override defaults but are overridden by YAML file values.

---

## Default Values Reference

| Config Key | Default | Type | Description |
|---|---|---|---|
| `db_path` | `.opencode/ruvector_memory.db` | `string` | SQLite database file path |
| `cache_size` | `1000` | `number` | In-memory cache size |
| `log_level` | `"info"` | `"debug" \| "info" \| "warn" \| "error"` | Logging verbosity |
| `preload_top_memories` | `5` | `number` | Memories preloaded at start |
| `vector_dimensions` | `384` | `number` | Embedding dimensions |
| `similarity_threshold` | `0.75` | `number` | Min search score |
| `vector_index_type` | `"hnsw"` | `"hnsw"` | Index algorithm |
| `vector_metric` | `"cosine"` | `"cosine"` | Distance metric |
| `feedback_weight` | `0.1` | `number` | Feedback impact weight |
| `importance_decay` | `0.95` | `number` | Time decay factor |
| `backup_retention_days` | `7` | `number` | Daily backup count |
| `backup_retention_weeks` | `4` | `number` | Weekly backup count |
| `backup_retention_months` | `12` | `number` | Monthly backup count |
| `memory_injection_enabled` | `true` | `boolean` | Enable passive injection |
| `memory_injection_relevance_threshold` | `0.7` | `number` | Injection relevance cutoff |
| `memory_injection_max_token_budget` | `2000` | `number` | Max tokens for injection |

---

## Configuration Profiles

### Minimal (just defaults)

No configuration file needed. Works out of the box.

### Development / Debug

```yaml
log_level: debug
preload_top_memories: 3
memory_injection_max_token_budget: 500
```

### Production / Large Projects

```yaml
cache_size: 5000
preload_top_memories: 10
memory_injection_max_token_budget: 4000
similarity_threshold: 0.8
```

### Memory-Constrained Environments

```yaml
cache_size: 100
preload_top_memories: 2
memory_injection_max_token_budget: 500
memory_injection_enabled: false
```

### High-Confidence Search Only

```yaml
similarity_threshold: 0.9
memory_injection_relevance_threshold: 0.85
```

---

## Configuration Validation

All configuration values are validated using a Zod schema at startup. If any value is invalid, the plugin falls back to the default value for that field (soft validation — it does not block activation).

### Validated Constraints

| Field | Constraint |
|---|---|
| `log_level` | Must be one of: `debug`, `info`, `warn`, `error` |
| `similarity_threshold` | Float in range `[0, 1]` |
| `memory_injection_relevance_threshold` | Float in range `[0, 1]` |
| `feedback_weight` | Float in range `[0, 1]` |
| `importance_decay` | Float in range `[0, 1]` |
| `cache_size` | Positive integer |
| `preload_top_memories` | Positive integer |
| `vector_dimensions` | Positive integer |
| `vector_index_type` | Must be `"hnsw"` |
| `vector_metric` | Must be `"cosine"` |

---

## Tuning Guide

### `similarity_threshold`

Controls how strict semantic matching is:

- **0.5** — Very permissive. Returns many results, including loosely related.
- **0.75** (default) — Balanced. Good for general use.
- **0.9** — Very strict. Returns only highly similar memories.

### `preload_top_memories`

How many memories are injected into the agent's context at session start:

- **1–3** — Light context; faster session start.
- **5** (default) — Balanced.
- **10+** — Rich context; good for large projects with many conventions.

### `memory_injection_max_token_budget`

Guards the agent's context window:

- **500–1000** — For small context windows or lightweight models.
- **2000** (default) — Good for most models.
- **4000+** — For large context models (GPT-4, Claude Sonnet, etc.) with many complex memories.

### `feedback_weight`

How much user feedback affects confidence scores:

- **0.1** (default) — Gradual learning. Requires several feedbacks to significantly change scores.
- **0.5** — Aggressive learning. One positive feedback significantly boosts confidence.
- **0.0** — Disable feedback learning.

### `importance_decay`

Time decay multiplier applied to memory relevance over time:

- **1.0** — No decay. Old memories remain as relevant as new ones.
- **0.95** (default) — Slight decay. Very old memories lose slight importance.
- **0.8** — Aggressive decay. Quickly deprioritizes old memories.
