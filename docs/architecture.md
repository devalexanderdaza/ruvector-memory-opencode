# Architecture

This document describes the technical architecture of `@ruvector/opencode-memory` — its components, data flow, key design decisions, and how everything fits together.

---

## Overview

The plugin is designed around three principles:

1. **Zero-friction activation** — works out of the box with no configuration
2. **Local-first** — all data stored locally, no network dependencies
3. **Graceful degradation** — if any subsystem fails, the plugin continues in reduced mode

---

## Directory Structure

```
src/
├── index.ts                    # Public API entry point
├── plugin-manifest.ts          # OpenCode plugin descriptor
│
├── core/                       # Plugin lifecycle management
│   ├── index.ts                # Core exports
│   ├── plugin.ts               # Activation logic, state management
│   └── lifecycle.ts            # Deactivation handler
│
├── config/                     # Configuration pipeline
│   ├── index.ts                # loadConfig() — merges YAML + env + defaults
│   ├── config-schema.ts        # Zod validation schema
│   ├── env-loader.ts           # RUVECTOR_MEMORY_* env var parsing
│   └── defaults.ts             # Built-in default values
│
├── detection/                  # Project context auto-detection
│   └── project-detector.ts     # Git root, package.json, frameworks, languages
│
├── tools/                      # OpenCode memory tools
│   ├── index.ts                # Tool registration
│   ├── tool-injector.ts        # Registers tools with OpenCode tool registry
│   ├── memory-context-injector.ts  # Passive context injection
│   ├── memory-response-formatter.ts # Result formatting
│   └── tools/
│       ├── memory-save-tool.ts     # memory_save() implementation
│       ├── memory-search-tool.ts   # memory_search() implementation
│       └── memory-learn-tool.ts    # memory_learn_from_feedback() implementation
│
├── vector/                     # Vector store adapter
│   ├── index.ts                # VectorStoreAdapter interface + factory
│   ├── vector-store.ts         # Adapter with save/search/ranking logic
│   ├── initialization.ts       # Database initialization, backup handling
│   ├── confidence-calculator.ts # Confidence score computation
│   └── defaults.ts             # Vector-specific defaults
│
└── shared/                     # Cross-cutting utilities
    ├── types.ts                # All TypeScript interfaces (source of truth)
    ├── errors.ts               # Custom error classes
    ├── logger.ts               # Structured logger
    ├── utils.ts                # Node version validation, text embedding, token counting
    └── token-counter.ts        # Token estimation for context budgeting
```

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenCode Agent                           │
│  (calls activate() automatically on session start)              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    activatePlugin()
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      core/plugin.ts                             │
│                                                                 │
│  1. validateNodeVersion()  ──► NodeVersionError if < 22         │
│  2. loadConfig()           ──► config/index.ts                  │
│  3. createVectorStoreAdapter() ──► vector/index.ts              │
│  4. new MemoryContextInjector() ──► tools/                      │
│  5. injectTools(context)   ──► tools/tool-injector.ts           │
│  6. Background (non-blocking):                                  │
│     ├── initializeVectorStore()                                 │
│     ├── ensureProjectContextForTools() ──► detection/           │
│     └── preloadTopMemories()                                    │
└─────────────────────────────────────────────────────────────────┘
         │              │                │
         ▼              ▼                ▼
   ┌──────────┐  ┌─────────────┐  ┌─────────────────────┐
   │  config/ │  │  detection/ │  │      vector/         │
   │          │  │             │  │                      │
   │ YAML     │  │ Git root    │  │ VectorStoreAdapter   │
   │ env vars │  │ package.json│  │ (HNSW + SQLite)      │
   │ defaults │  │ frameworks  │  │ save / search        │
   └──────────┘  └─────────────┘  └─────────────────────┘
                                          │
                                   ┌──────▼──────┐
                                   │   tools/    │
                                   │             │
                                   │ memory_save │
                                   │ memory_search│
                                   │ memory_learn │
                                   └─────────────┘
```

---

## Activation Flow

```
activatePlugin(context?)
    │
    ├─ [SYNC] validateNodeVersion()
    │   └─ Throws NodeVersionError if Node.js < 22
    │
    ├─ [SYNC] loadConfig(projectRoot, configPath)
    │   └─ Merges: YAML file > env vars > defaults
    │   └─ Validates via Zod schema
    │
    ├─ [SYNC] createVectorStoreAdapter(config, projectRoot)
    │   └─ Returns adapter (stub or real @ruvector/core adapter)
    │
    ├─ [SYNC] new MemoryContextInjector(injectionConfig)
    │   └─ Sets up passive memory injection pipeline
    │
    ├─ [SYNC] injectTools(context)
    │   └─ Registers memory_save, memory_search, memory_learn_from_feedback
    │   └─ With OpenCode tool registry
    │
    └─ [ASYNC, non-blocking] Promise.all([
           initializeVectorStore(),         // Initialize DB on disk
           ensureProjectContextForTools(),  // Detect git root, language
           preloadTopMemories(),            // Inject top-N into context
       ]).catch(error => {
           isDegraded = true;              // Background failure → degraded mode
       });
    │
    └─ Returns: { success: true, data: { activated: true, degraded: false } }
```

**Key Design Choice:** Background tasks are non-blocking. The plugin returns `activated: true` immediately, while database initialization and project detection run in the background. This ensures the agent starts quickly even on first run.

---

## Module Descriptions

### `core/plugin.ts` — Plugin Lifecycle

The central module. Manages global state:

| Variable | Type | Purpose |
|---|---|---|
| `isDegraded` | `boolean` | True if any background init failed |
| `activeProjectRoot` | `string` | Resolved project root path |
| `activeConfig` | `RuVectorMemoryConfig \| null` | Active configuration |
| `vectorStore` | `VectorStoreAdapter \| null` | Active vector store instance |
| `memoryInjector` | `MemoryContextInjector \| null` | Context injection pipeline |
| `preloadedMemoryContext` | `string` | Cached top-N memory context string |
| `activeProjectContext` | `ProjectDetectionResult \| null` | Detected project metadata |

**Key functions:**

- `activatePlugin(context?)` — Main entry point, orchestrates activation
- `ensureProjectContextForTools()` — Deduplicates concurrent project detection
- `preloadTopMemories()` — Runs context injection pipeline on startup
- `refreshPreloadedContext(query?)` — Manual context refresh
- `getPluginState()` — Returns `{ degraded: boolean }`

---

### `config/index.ts` — Configuration Pipeline

Three-level merge:

```
YAML file (.opencode/ruvector_memory_config.yaml)
    ↓ overrides ↓
Environment variables (RUVECTOR_MEMORY_*)
    ↓ overrides ↓
Built-in defaults (config/defaults.ts)
    ↓ validated by ↓
Zod schema (config/config-schema.ts)
```

If YAML file doesn't exist, the plugin silently uses defaults — no error.

---

### `detection/project-detector.ts` — Project Context

Walks up the directory tree to find:

- **Git root** (presence of `.git/`)
- **Package name** (from `package.json`)
- **Primary language** — TypeScript, JavaScript, Python, Go, Rust
- **Frameworks** — React, Vue, Next.js, Express, NestJS, Svelte, Astro, and 8+ more
- **Stack signals** — additional metadata for memory tagging

The result is attached to every saved memory automatically, enabling project-scoped queries.

---

### `vector/vector-store.ts` — Vector Store Adapter

Adapts `@ruvector/core` (or a stub fallback) to the plugin's interface.

#### Save Flow

```
memory_save(content, metadata)
    ↓
vectorStore.save(content, metadata)
    ↓
@ruvector/core.insert(content, embedding, metadata)
    ↓
HNSW index updated
SQLite row persisted
```

#### Search Flow + Ranking Algorithm

```
memory_search(query, limit, filters)
    ↓
vectorStore.search(query, k, filters)
    ↓
@ruvector/core.knn(queryEmbedding, k)  →  raw candidates
    ↓
Apply filters (tags, source, project_name, date range)
    ↓
Composite ranking for each candidate:

  compositeScore = cosineDist
                 - priorityBoost
                 - recencyBoost
                 - confidenceBoost

  where:
    priorityBoost = +0.05 (critical) | -0.02 (low) | 0 (normal)
    recencyBoost  = +0.02 (<1 day)  | +0.01 (<7 days) | 0
    confidenceBoost = (confidence - 0.5) × 0.04

    Lower compositeScore = better result (closer to query)
    ↓
Sort ascending by compositeScore
Return top-K results
```

**Effect:** High-priority, recent, high-confidence memories are ranked higher than raw cosine similarity alone would rank them.

---

### `tools/memory-context-injector.ts` — Passive Injection

Runs at plugin startup and on explicit refresh. Retrieves top-N relevant memories and formats them as a Markdown block for injection into the agent's system prompt.

#### Token Budget Management

The injector uses `token-counter.ts` to estimate token usage and stops adding memories when `maxTokenBudget` would be exceeded. This ensures the injected context doesn't crowd out the agent's working memory.

---

### `shared/errors.ts` — Error Classes

| Class | Code | When Used |
|---|---|---|
| `NodeVersionError` | `ENODESEMVER` | Node.js version is below 22.0.0 |
| `RuVectorMemoryError` | `ERUVECTORMEMORY` | General plugin errors |
| `InitializationError` | `EINIT` | Database initialization failures |

---

## State Machine

```
         IDLE
           │
     activatePlugin()
           │
           ▼
       ACTIVATED ────────────────────────────────┐
    (degraded: false)                             │
           │                                      │
    Background tasks fail                         │
           │                                deactivatePlugin()
           ▼                                      │
       DEGRADED                                   │
    (degraded: true)                              │
    (tools still work, no vector search)          │
           │                                      │
           └──────────────────────────────────────┘
                                                  ▼
                                               IDLE
```

---

## Design Decisions

### Why HNSW?

HNSW (Hierarchical Navigable Small World) provides:
- **O(log N)** query time (vs. O(N) for brute-force)
- **High recall** with tunable precision
- **In-memory graph** with disk persistence

It is the industry-standard algorithm for approximate nearest-neighbor search, used by Faiss, Weaviate, Qdrant, and Pinecone.

### Why Cosine Similarity?

Cosine similarity is direction-based — it measures the angle between two vectors regardless of magnitude. This is ideal for text embeddings because:
- Two texts with the same meaning but different lengths score high
- Works with both normalized and unnormalized embeddings

### Why Local SQLite?

- No external network dependencies
- Works in air-gapped environments
- Simple backup (copy one file)
- Supports concurrent reads natively

### Why Graceful Degradation?

Background initialization (DB setup, project detection, memory preload) runs asynchronously so that:
- The agent starts immediately, without waiting for DB
- If `@ruvector/core` is not installed, tools still register (just return errors gracefully)
- If the DB file is locked or corrupted, the plugin still responds to queries with a clear error message
