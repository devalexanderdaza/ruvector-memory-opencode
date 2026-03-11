# Memory Tools Reference

The plugin registers three memory tools with the OpenCode tool registry:

| Tool | Purpose |
|---|---|
| [`memory_save`](#memory_save) | Save a memory with metadata |
| [`memory_search`](#memory_search) | Semantic search over stored memories |
| [`memory_learn_from_feedback`](#memory_learn_from_feedback) | Adjust confidence via feedback |

These tools are available to the OpenCode agent automatically after plugin activation. They can also be called directly in TypeScript using the tool factory functions.

---

## `memory_save`

Saves a piece of text as a memory in the vector database, along with metadata and automatically detected project context.

### Input Schema

```typescript
// Accepts either a plain string or an object:
type MemorySaveInput =
  | string               // shorthand: just the content
  | {
      content: string;               // required: text to remember
      tags?: string[];               // optional: classification tags
      source?: string;               // optional: origin of the memory
      priority?: "critical" | "normal" | "low"; // optional: importance level
      confidence?: number;           // optional: initial confidence [0, 1]
    }
```

### Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `content` | `string` | **Yes** | — | The text content to save (max 8KB) |
| `tags` | `string[]` | No | `[]` | Classification tags for filtering |
| `source` | `string` | No | `"unknown"` | Origin label (e.g., "documentation", "convention", "conversation") |
| `priority` | `"critical" \| "normal" \| "low"` | No | `"normal"` | Affects retrieval ranking |
| `confidence` | `number` | No | `0.5` | Initial confidence score `[0, 1]` |

### Response

```typescript
// Success:
{ success: true, data: { id: string } }

// Error:
{ success: false, error: string, code: string, reason: string }
```

### Examples

**Simple save (string shorthand):**
```typescript
await memory_save("Always use named exports in this project");
// Returns: { success: true, data: { id: "uuid-..." } }
```

**Save with full metadata:**
```typescript
await memory_save({
  content: "Use React Query for all server state — never useEffect + fetch directly",
  tags: ["react", "state", "conventions", "data-fetching"],
  source: "architecture-decision",
  priority: "critical",
  confidence: 0.95,
});
```

**Save from conversation:**
```typescript
await memory_save({
  content: "The team prefers snake_case for database column names",
  tags: ["database", "naming", "conventions"],
  source: "conversation",
  priority: "normal",
});
```

### Behavior

1. Validates `content` is a non-empty string
2. Ensures vector store is initialized (lazy init on first operation)
3. Detects project context automatically (language, frameworks, git root)
4. Generates a vector embedding for the content
5. Persists to SQLite + HNSW index
6. Returns the UUID of the saved memory

### Auto-Attached Metadata

The following project context is automatically attached to every saved memory:

| Field | Source | Example |
|---|---|---|
| `projectContext` | Package name | `"my-app"` |
| `projectName` | Package name | `"my-app"` |
| `projectType` | Detected type | `"node"` |
| `primaryLanguage` | File analysis | `"TypeScript"` |
| `frameworks` | Dependency analysis | `["react", "next.js"]` |
| `projectRoot` | Git root path | `"/home/user/projects/my-app"` |

---

## `memory_search`

Performs semantic search over stored memories using HNSW approximate nearest-neighbor search, with composite ranking.

### Input Schema

```typescript
type MemorySearchInput =
  | string              // shorthand: just the query
  | {
      query: string;                  // required: search query
      limit?: number;                 // optional: max results (1–100, default: 5)
      filters?: MemorySearchFilters;  // optional: filter criteria
    }
```

### Filter Parameters

```typescript
interface MemorySearchFilters {
  tags?: string[];           // Any-match on tags
  source?: string;           // Exact source match
  project_name?: string;     // Exact project name match
  project_type?: string;     // Exact project type match
  primary_language?: string; // Exact language match
  frameworks?: string[];     // Any-match on frameworks
  created_after?: string | number;  // ISO date string or epoch ms
  created_before?: string | number; // ISO date string or epoch ms
}
```

### Response

```typescript
// Success:
{
  success: true,
  data: {
    success: boolean;
    results: SearchResult[];
    count: number;
    _meta?: {
      query: string;
      timestamp: string;
      queryLatencyMs: number;
    };
  }
}
```

Each `SearchResult`:

```typescript
interface SearchResult {
  id: string;           // UUID
  content: string;      // Original text
  relevance: number;    // Composite similarity score [0, 1]
  confidence: number;   // Learning signal [-1, 1]
  timestamp: string;    // ISO-8601 creation time
  source: "manual" | "agent" | "import";
  tags?: string[];
  importance?: number;       // 1–5
  projectContext?: string;
  projectName?: string;
  projectType?: string;
  primaryLanguage?: string;
  frameworks?: string[];
}
```

### Ranking Algorithm

Results are ranked using a composite score:

```
compositeScore = cosineDist
               - priorityBoost
               - recencyBoost
               - confidenceBoost

priorityBoost  = +0.05 if priority == "critical"
                 -0.02 if priority == "low"
                  0    otherwise

recencyBoost   = +0.02 if created within 24 hours
                 +0.01 if created within 7 days
                  0    otherwise

confidenceBoost = (confidence - 0.5) × 0.04
```

Lower score = better result. High-priority, recent, high-confidence memories bubble up.

### Examples

**Simple query (string shorthand):**
```typescript
const result = await memory_search("export conventions");
// Returns top 5 results matching "export conventions"
```

**Query with limit:**
```typescript
const result = await memory_search({
  query: "database schema design decisions",
  limit: 10,
});
```

**Query with filters:**
```typescript
const result = await memory_search({
  query: "state management patterns",
  limit: 5,
  filters: {
    tags: ["react", "state"],
    primary_language: "TypeScript",
    created_after: "2025-01-01",
  },
});
```

**Filter by project:**
```typescript
const result = await memory_search({
  query: "authentication flow",
  filters: {
    project_name: "my-api",
    frameworks: ["express", "nestjs"],
  },
});
```

**Date range filter:**
```typescript
const result = await memory_search({
  query: "recent decisions",
  filters: {
    created_after: "2025-06-01",
    created_before: "2025-07-01",
  },
});
```

### Limits

- Maximum `limit`: **100** (hard cap to prevent resource exhaustion)
- `created_after` must be less than `created_before` if both are provided
- At most **100 candidates** are fetched from HNSW before filtering

---

## `memory_learn_from_feedback`

Adjusts the confidence score of a memory based on feedback. Used by the agent to signal whether a retrieved memory was helpful, correct, or misleading.

> ⚠️ **Status:** This tool is registered but not yet implemented in version 0.2.0. It returns `ENOTIMPLEMENTED` when called. Full implementation is planned in a future release.

### Input Schema (planned)

```typescript
{
  memory_id: string;                             // UUID of the memory to update
  feedback: "positive" | "negative" | "neutral"; // Feedback type
  note?: string;                                 // Optional human note
}
```

### Response (current behavior)

```typescript
{
  success: false,
  error: "memory_learn_from_feedback is registered but not implemented yet",
  code: "ENOTIMPLEMENTED",
  reason: "tool-not-implemented"
}
```

### Planned Behavior (future)

When implemented, this tool will:

1. Look up the memory by `memory_id`
2. Apply the confidence adjustment formula:
   ```
   new_confidence = current_confidence
     + (positive_feedback × feedback_weight)
     - (negative_feedback × feedback_weight)
   ```
3. Clamp confidence to `[-1.0, 1.0]`
4. Persist updated confidence to the database
5. Return the updated confidence score

---

## Passive Context Injection

In addition to the three explicit tools, the plugin also performs **passive memory injection** at session start.

At activation time, the plugin:

1. Retrieves the top `preload_top_memories` (default: 5) memories
2. Filters by `memory_injection_relevance_threshold` (default: 0.7)
3. Formats them as a Markdown block
4. Injects them into the agent's context under the token budget (`memory_injection_max_token_budget`)

The agent sees this injected context automatically, without calling any tool.

**To retrieve the injected context:**

```typescript
import { getPreloadedMemoryContext } from "@ruvector/opencode-memory/core/plugin.js";

const context = getPreloadedMemoryContext();
console.log(context); // Markdown-formatted memory block
```

**To refresh the context mid-session:**

```typescript
import { refreshPreloadedContext } from "@ruvector/opencode-memory/core/plugin.js";

const result = await refreshPreloadedContext("what are the coding conventions?");
console.log(result?.memoriesInjected, "memories injected");
```

---

## Error Handling

All tools return a `ToolResponse<T>` that must be checked for `success`:

```typescript
const result = await memory_save("some content");

if (!result.success) {
  // Handle error
  console.error(result.error);    // Human-readable message
  console.error(result.code);     // Machine-readable code
  console.error(result.reason);   // Error category
}
```

### Common Error Codes

| Code | Condition |
|---|---|
| `EINVALID` | Missing required fields or invalid types |
| `PLUGIN_NOT_ACTIVATED` | Tool called before `activatePlugin()` |
| `EINIT` | Vector store failed to initialize |
| `EUNEXPECTED` | Unexpected runtime error |
| `ENOTIMPLEMENTED` | Tool not implemented yet |
