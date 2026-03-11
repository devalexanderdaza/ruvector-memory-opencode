# API Reference

This document covers the complete public TypeScript API for `@ruvector/opencode-memory`.

**Package:** `@ruvector/opencode-memory`
**Entry point:** `dist/index.js`
**Types:** `dist/index.d.ts`

---

## Import

```typescript
import {
  activatePlugin,
  deactivatePlugin,
  getPluginState,
} from "@ruvector/opencode-memory";

import type {
  ActivationResult,
  LoggerLike,
  PluginActivationContext,
  RuVectorMemoryConfig,
  ToolResponse,
} from "@ruvector/opencode-memory";
```

---

## Functions

### `activatePlugin(context?)`

Activates the plugin. Called automatically by OpenCode, but can also be called manually.

```typescript
function activatePlugin(
  context?: PluginActivationContext
): Promise<ToolResponse<ActivationResult>>;
```

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `context` | `PluginActivationContext` | No | Optional context override |
| `context.projectRoot` | `string` | No | Override project root path |
| `context.configPath` | `string` | No | Override config file path |
| `context.runtimeNodeVersion` | `string` | No | Override Node.js version for testing |
| `context.toolRegistry` | `unknown` | No | OpenCode tool registry to register tools with |

**Returns:** `Promise<ToolResponse<ActivationResult>>`

**Success response:**
```typescript
{
  success: true,
  data: {
    activated: true,
    degraded: false,         // false = fully operational
    message: "Plugin activated"
  }
}
```

**Error response (Node.js version too old):**
```typescript
{
  success: false,
  error: "ruvector-memory requires Node.js >=22.0.0. Current: v20.x.x. Please upgrade: https://nodejs.org",
  code: "ENODESEMVER",
  reason: "runtime-version"
}
```

**Error response (other activation failure):**
```typescript
{
  success: false,
  error: "...",
  code: "ERUVECTORMEMORY",
  reason: "activation"
}
```

**Example:**

```typescript
const result = await activatePlugin({
  projectRoot: "/path/to/my/project",
  configPath: "/path/to/custom-config.yaml",
});

if (result.success) {
  console.log("Plugin activated, degraded:", result.data.degraded);
} else {
  console.error("Activation failed:", result.error, result.code);
}
```

---

### `deactivatePlugin()`

Deactivates the plugin and logs a shutdown event. Called automatically by OpenCode on session end.

```typescript
function deactivatePlugin(): Promise<void>;
```

**Parameters:** None

**Returns:** `Promise<void>`

**Example:**

```typescript
await deactivatePlugin();
```

---

### `getPluginState()`

Returns the current plugin state.

```typescript
function getPluginState(): { degraded: boolean };
```

**Returns:**

| Field | Type | Description |
|---|---|---|
| `degraded` | `boolean` | `true` if background initialization failed |

**Example:**

```typescript
const { degraded } = getPluginState();

if (degraded) {
  console.warn("Plugin running in degraded mode — vector search may not work");
}
```

**When is `degraded: true`?**
- `@ruvector/core` failed to load or initialize
- Database file is locked, corrupted, or unreadable
- Background init threw an unhandled exception
- Node.js out-of-memory during HNSW graph construction

---

## Types

### `PluginActivationContext`

Context passed to `activatePlugin()` to override default behavior.

```typescript
interface PluginActivationContext {
  /** Override project root directory (default: process.cwd()) */
  projectRoot?: string;

  /** Override config file path (default: .opencode/ruvector_memory_config.yaml) */
  configPath?: string;

  /** Override Node.js version string for testing (default: process.version) */
  runtimeNodeVersion?: string;

  /** OpenCode tool registry to register tools with */
  toolRegistry?: unknown;
}
```

---

### `ActivationResult`

The data payload in a successful `activatePlugin()` response.

```typescript
interface ActivationResult {
  /** Whether the plugin successfully activated */
  activated: boolean;

  /** Whether background initialization failed (plugin may have limited functionality) */
  degraded: boolean;

  /** Human-readable status message */
  message: string;
}
```

---

### `ToolResponse<T>`

Generic response envelope for all plugin operations.

```typescript
type ToolResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; reason?: string; code?: string };
```

**Success shape:**

```typescript
{ success: true; data: T }
```

**Error shape:**

```typescript
{
  success: false;
  error: string;     // Human-readable error message
  reason?: string;   // Machine-readable error category
  code?: string;     // Error code constant
}
```

**Error codes:**

| Code | Meaning |
|---|---|
| `ENODESEMVER` | Node.js version requirement not met |
| `ERUVECTORMEMORY` | General plugin error |
| `EINIT` | Database initialization failed |
| `EINVALID` | Invalid input to a tool |
| `PLUGIN_NOT_ACTIVATED` | Tool called before plugin was activated |
| `EUNEXPECTED` | Unexpected runtime error |

---

### `RuVectorMemoryConfig`

Full configuration interface. All fields have defaults — none are required.

```typescript
interface RuVectorMemoryConfig {
  /** Path to SQLite database file (relative to project root) */
  db_path: string;

  /** Number of in-memory cache entries */
  cache_size: number;

  /** Logging verbosity */
  log_level: "debug" | "info" | "warn" | "error";

  /** Number of memories to preload into agent context on session start */
  preload_top_memories: number;

  /** Vector embedding dimensions */
  vector_dimensions: number;

  /** Minimum cosine similarity score for search results [0, 1] */
  similarity_threshold: number;

  /** Vector index algorithm (only "hnsw" supported) */
  vector_index_type: "hnsw";

  /** Distance metric (only "cosine" supported) */
  vector_metric: "cosine";

  /** Weight of feedback signals in confidence calculation [0, 1] */
  feedback_weight: number;

  /** Time decay multiplier for memory importance [0, 1] */
  importance_decay: number;

  /** Days to retain daily backups */
  backup_retention_days: number;

  /** Weeks to retain weekly backups */
  backup_retention_weeks: number;

  /** Months to retain monthly backups */
  backup_retention_months: number;

  /** Whether to inject memories passively into agent context */
  memory_injection_enabled: boolean;

  /** Minimum relevance score for passive injection [0, 1] */
  memory_injection_relevance_threshold: number;

  /** Maximum token budget for injected memory context */
  memory_injection_max_token_budget: number;
}
```

---

### `LoggerLike`

Interface for a compatible logger object.

```typescript
interface LoggerLike {
  debug(event: string, metadata?: Record<string, unknown>): void;
  info(event: string, metadata?: Record<string, unknown>): void;
  warn(event: string, metadata?: Record<string, unknown>): void;
  error(event: string, metadata?: Record<string, unknown>): void;
}
```

---

## Memory Tool Types

These types are used by the memory tools registered with the OpenCode tool registry. They are not directly exported from the main entry point but are defined in `shared/types.ts`.

### `MemorySaveInput`

```typescript
interface MemorySaveInput {
  /** The content to store (required) */
  content: string;

  /** Classification tags (optional) */
  tags?: string[];

  /** Source of the memory: "documentation", "conversation", "manual", etc. */
  source?: string;

  /** Importance level for retrieval ranking */
  priority?: "critical" | "normal" | "low";

  /** Initial confidence score [0, 1] (default: 0.5) */
  confidence?: number;
}
```

### `MemorySaveResult`

```typescript
interface MemorySaveResult {
  /** UUID of the saved memory */
  id: string;
}
```

---

### `MemorySearchInput`

```typescript
interface MemorySearchInput {
  /** Semantic search query */
  query: string;

  /** Maximum number of results (default: 5, max: 100) */
  limit?: number;

  /** Optional filters */
  filters?: MemorySearchFilters;
}
```

### `MemorySearchFilters`

```typescript
interface MemorySearchFilters {
  /** Filter by tags (any match) */
  tags?: string[];

  /** Filter by exact source value */
  source?: string;

  /** Filter by project name */
  project_name?: string;

  /** Filter by project type */
  project_type?: string;

  /** Filter by primary language */
  primary_language?: string;

  /** Filter by frameworks (any match) */
  frameworks?: string[];

  /** Filter memories created after this time (ISO date string or epoch ms) */
  created_after?: string | number;

  /** Filter memories created before this time (ISO date string or epoch ms) */
  created_before?: string | number;
}
```

### `SearchResult`

```typescript
interface SearchResult {
  /** Unique memory identifier (UUID) */
  id: string;

  /** Original captured text (max 8KB) */
  content: string;

  /** Composite similarity score [0.0, 1.0] */
  relevance: number;

  /**
   * Learning signal based on usage and feedback [-1.0, 1.0]
   * - 1.0: High confidence (max usage, consistent positive feedback)
   * - 0.5: Mid-range (moderate usage)
   * - 0.0: Neutral (zero accesses and no feedback)
   * - <0.0: Low confidence (corrected multiple times)
   */
  confidence: number;

  /** ISO-8601 datetime when memory was created */
  timestamp: string;

  /** Origin: "manual" (user), "agent" (auto-captured), "import" (from .rvf) */
  source: "manual" | "agent" | "import";

  /** User-supplied classification tags */
  tags?: string[];

  /** Importance level on 1–5 scale */
  importance?: number;

  /** Auto-detected project identifier */
  projectContext?: string;
  projectName?: string;
  projectType?: string;
  primaryLanguage?: string;
  frameworks?: string[];
}
```

### `MemorySearchResponse`

```typescript
interface MemorySearchResponse {
  success: boolean;
  results: SearchResult[];
  count: number;
  _meta?: {
    query: string;
    timestamp: string;
    queryLatencyMs: number;
  };
}
```

---

### `ProjectDetectionResult`

Returned by the project detection subsystem.

```typescript
interface ProjectDetectionResult {
  /** Resolved absolute path to project root */
  projectRoot: string;

  /** Package name or directory name */
  projectName: string;

  /** Detected project type: "node", "python", "go", "rust", "generic" */
  projectType: string;

  /** Primary programming language detected */
  primaryLanguage: string;

  /** List of detected frameworks (e.g., ["react", "next.js"]) */
  frameworks: string[];

  /** Additional stack signal metadata */
  stackSignals: string[];
}
```

---

## Plugin Manifest

The plugin manifest is the entry point for OpenCode plugin auto-discovery:

```typescript
// src/plugin-manifest.ts
export const plugin = {
  name: "ruvector-memory",
  activate: activatePlugin,
  deactivate: deactivatePlugin,
};
```

OpenCode finds this via the `main` field in `package.json` → `dist/index.js`, then calls `plugin.activate()` automatically on session start.
