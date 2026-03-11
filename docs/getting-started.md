# Getting Started

This guide walks you through installing `@ruvector/opencode-memory`, configuring it, and using it in your first session.

---

## Requirements

| Requirement | Version |
|---|---|
| **Node.js** | >= 22.0.0 |
| **npm** | >= 10 |
| **OpenCode** | Any version that supports the plugin manifest pattern |

> **Why Node.js 22?** The plugin uses native ESM, `performance.now()` precision, and modern V8 APIs that require Node.js 22 or newer. If you activate the plugin with an older version, it returns a clear error message with an upgrade link.

---

## Installation

### Step 1 — Install the Plugin

```bash
# npm
npm install @ruvector/opencode-memory

# pnpm
pnpm add @ruvector/opencode-memory

# yarn
yarn add @ruvector/opencode-memory
```

### Step 2 — (Recommended) Install the Vector Engine

For full local vector search, install the optional peer dependency:

```bash
npm install @ruvector/core
# or
pnpm add @ruvector/core
```

> Without `@ruvector/core`, the plugin still activates but operates in stub mode (no real vector search). With it, you get full HNSW-powered semantic search.

### Step 3 — Start OpenCode

That's it. On the next OpenCode session start, the plugin activates automatically. No imports, no configuration files, no manual bootstrap needed.

---

## Automatic Activation

When OpenCode starts, it discovers the plugin via `package.json → main → dist/index.js` and calls `activate()`. This happens automatically:

```
1. OpenCode Session Starts
2. Plugin discovered via package.json main field
3. activatePlugin() called automatically
4. Node.js version validated (>= 22 required)
5. Configuration loaded (YAML → env vars → defaults)
6. Vector store initialized
7. Memory tools registered with tool registry
8. Background: project context detected, top memories preloaded
9. Agent ready with memory tools available
```

You can verify activation succeeded by checking the plugin state:

```typescript
import { getPluginState } from "@ruvector/opencode-memory";

const state = getPluginState();
console.log(state.degraded); // false = fully operational
```

---

## Zero-Configuration Defaults

The plugin works immediately with sensible defaults:

| Setting | Default Value | What It Means |
|---|---|---|
| Database location | `.opencode/ruvector-memory.db` | SQLite file in your project root |
| Cache size | 512 entries | In-memory cache before disk access |
| Log level | `info` | Balanced logging |
| Preloaded memories | 5 | Memories injected at session start |
| Vector dimensions | 384 | Embedding vector size |
| Similarity threshold | 0.75 | Minimum score to include in search results |

---

## Optional Configuration

If you want to customize behavior, create a YAML file at `.opencode/ruvector_memory_config.yaml`:

```yaml
# .opencode/ruvector_memory_config.yaml

# Database location (relative to project root)
db_path: .opencode/ruvector-memory.db

# Number of memories to preload on session start
preload_top_memories: 8

# Logging verbosity: debug | info | warn | error
log_level: debug

# In-memory cache size
cache_size: 1024

# Memory injection settings
memory_injection_enabled: true
memory_injection_max_token_budget: 3000
```

See the [Configuration Guide](./configuration.md) for all options.

---

## First Use: Saving a Memory

Once the plugin is active, the agent has access to three tools. Here's how to use them:

### Save a Memory

```typescript
await memory_save({
  content: "This project uses named exports everywhere — no default exports allowed",
  tags: ["conventions", "exports", "style"],
  source: "manual",
  priority: "critical",
  confidence: 0.9,
});
// Returns: { success: true, data: { id: "uuid-..." } }
```

### Search Memories

```typescript
const result = await memory_search({
  query: "export style conventions",
  limit: 5,
});
// Returns: { success: true, data: { results: [...], count: N } }
```

### Provide Feedback

```typescript
await memory_learn_from_feedback({
  memory_id: "uuid-...",
  feedback: "positive",
});
```

---

## Verifying It Works

### Check Activation

The plugin logs to the console at activation time. Look for:

```
[ruvector-memory] plugin_activated activation_ms=12 config_source=default
```

### Run a Test Search

```typescript
const result = await memory_search({ query: "test query", limit: 1 });
console.log(result.success); // true
console.log(result.data.count); // 0 (if no memories saved yet)
```

### Check Plugin State

```typescript
import { getPluginState } from "@ruvector/opencode-memory";
const { degraded } = getPluginState();
// degraded: false = fully operational
// degraded: true = background init failed, plugin may have limited functionality
```

---

## Troubleshooting

### Node.js Version Error

```
ruvector-memory requires Node.js >=22.0.0. Current: v20.x.x
```

**Fix:** Upgrade Node.js. Use `nvm install 22` or download from [nodejs.org](https://nodejs.org).

### Plugin in Degraded Mode

If `getPluginState().degraded === true`, it means background initialization failed (e.g., database file is locked, no write permissions, or `@ruvector/core` failed to load).

**Fix:** Check write permissions on `.opencode/` directory. Ensure `@ruvector/core` is installed.

### No Memories Found

If searches return empty results after saving, the vector store might be initializing. Wait a moment and try again. Background initialization is non-blocking.

### Database Already Exists Error

The plugin handles existing databases gracefully. If you see errors, try deleting `.opencode/ruvector-memory.db` and restarting.

---

## Next Steps

- [Configuration Guide](./configuration.md) — Full list of configuration options
- [Memory Tools](./memory-tools.md) — Detailed tool reference
- [Integration Guide](./integration-guide.md) — How to integrate in your workflow
- [Architecture](./architecture.md) — How the plugin works internally
