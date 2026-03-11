# Integration Guide

This guide explains how to integrate `@ruvector/opencode-memory` into your projects, tools, and workflows.

---

## Use Cases

### 1. AI Coding Agent with Memory (Primary Use Case)

The most common use case: give your OpenCode agent persistent memory across sessions.

**Setup:**
```bash
# In your project directory
npm install @ruvector/opencode-memory @ruvector/core
```

That's all. The plugin auto-activates with OpenCode on next session start.

**What happens automatically:**
- Project conventions stored by the agent persist between sessions
- Architecture decisions are searchable by future agents
- Code patterns the agent learns are remembered
- The agent automatically injects relevant memories into its context

---

### 2. Programmatic Plugin Integration

If you're building a tool that uses OpenCode plugins or want to control activation manually:

```typescript
import { activatePlugin, deactivatePlugin, getPluginState } from "@ruvector/opencode-memory";

// Activate with custom configuration
const result = await activatePlugin({
  projectRoot: "/path/to/project",
  configPath: "/path/to/custom-config.yaml",
});

if (!result.success) {
  console.error("Plugin failed to activate:", result.error);
  process.exit(1);
}

if (result.data.degraded) {
  console.warn("Plugin activated in degraded mode — vector search may not work");
}

// ... use plugin tools ...

// Clean shutdown
await deactivatePlugin();
```

---

### 3. RAG (Retrieval-Augmented Generation) Pipeline

Use the plugin as a local RAG memory store for any LLM application:

```typescript
import { activatePlugin } from "@ruvector/opencode-memory";

// 1. Activate the memory store
await activatePlugin({ projectRoot: process.cwd() });

// 2. Index your knowledge base
const documents = await loadDocuments("./docs");
for (const doc of documents) {
  await memory_save({
    content: doc.content,
    tags: [doc.category, "documentation"],
    source: "documentation",
    priority: "normal",
  });
}

// 3. Retrieve relevant context for a query
async function getContext(userQuery: string): Promise<string> {
  const result = await memory_search({
    query: userQuery,
    limit: 5,
    filters: { source: "documentation" },
  });

  if (!result.success) return "";

  return result.data.results
    .map((r) => r.content)
    .join("\n\n---\n\n");
}

// 4. Use context in LLM call
const context = await getContext("How do I authenticate users?");
const prompt = `Context:\n${context}\n\nUser: How do I authenticate users?`;
// Pass prompt to your LLM...
```

---

### 4. Team Knowledge Base

Build a searchable team knowledge base:

```typescript
// Save architecture decisions
await memory_save({
  content: `
    ADR-001: Use PostgreSQL for primary data storage.
    Rationale: Team familiarity, JSONB support, pgvector extension available.
    Status: Accepted. Date: 2025-01-15.
  `,
  tags: ["adr", "database", "architecture"],
  source: "architecture-decision",
  priority: "critical",
  confidence: 1.0,
});

// Search for relevant decisions
const decisions = await memory_search({
  query: "database choice rationale",
  filters: { source: "architecture-decision" },
});
```

---

### 5. Code Review Memory

Store recurring code review findings for agents to reference:

```typescript
// Store a pattern found in review
await memory_save({
  content: "When using React's useEffect with an async function, always check if the component is still mounted before calling setState to avoid memory leaks.",
  tags: ["react", "hooks", "memory-leak", "code-review"],
  source: "code-review",
  priority: "critical",
});

// Agent finds this automatically when reviewing React hooks
const patterns = await memory_search({
  query: "useEffect async setState",
  filters: { tags: ["code-review"] },
});
```

---

## Integration Patterns

### Pattern 1: Session-Level Memory

Save important context at the start of each session and retrieve it at the end:

```typescript
// At session start: retrieve project context
const projectContext = await memory_search({
  query: "current sprint goals and active features",
  limit: 3,
  filters: { tags: ["sprint", "active"] },
});

// During session: save discoveries
await memory_save({
  content: "The UserService is responsible for both auth and profile management — split these in next refactor",
  tags: ["refactor", "architecture", "tech-debt"],
  source: "agent",
  priority: "normal",
});

// At session end: summarize and save conclusions
await memory_save({
  content: "Completed refactoring of UserService. Auth logic moved to AuthService. Profile logic remains in UserService.",
  tags: ["refactor", "completed", "userservice"],
  source: "agent",
  priority: "normal",
  confidence: 0.9,
});
```

---

### Pattern 2: Priority-Based Memory System

Use priority levels to create a memory hierarchy:

```typescript
// Critical: architectural invariants that must never be violated
await memory_save({
  content: "NEVER commit secrets to the repository. Use environment variables or secrets manager.",
  tags: ["security", "critical"],
  priority: "critical",
  confidence: 1.0,
});

// Normal: standard conventions
await memory_save({
  content: "All API endpoints return { data, error, meta } envelope format",
  tags: ["api", "convention"],
  priority: "normal",
});

// Low: nice-to-have preferences
await memory_save({
  content: "Prefer single-letter variable names for loop indices (i, j, k)",
  tags: ["style"],
  priority: "low",
});
```

---

### Pattern 3: Project-Scoped Isolation

Memories automatically include project context. Use filters to isolate memories by project:

```typescript
// These memories are automatically tagged with project context
await memory_save({
  content: "Frontend uses React 18 with Zustand for state management",
  tags: ["state", "frontend"],
});

// Later, when working on the frontend project specifically:
const frontendMemories = await memory_search({
  query: "state management",
  filters: {
    project_name: "my-frontend",
    frameworks: ["react"],
  },
});
```

---

### Pattern 4: Tagging Strategy

A consistent tagging strategy makes memories much more useful:

```typescript
// Recommended tag categories:
const TAGS = {
  // Lifecycle
  ACTIVE: "active",
  DEPRECATED: "deprecated",
  COMPLETED: "completed",

  // Type
  CONVENTION: "convention",
  DECISION: "decision",
  BUG_FIX: "bug-fix",
  PATTERN: "pattern",
  WARNING: "warning",

  // Domain
  AUTH: "auth",
  DATABASE: "database",
  API: "api",
  FRONTEND: "frontend",
  BACKEND: "backend",
  TESTING: "testing",
  SECURITY: "security",

  // Frameworks
  REACT: "react",
  NEXTJS: "next.js",
  NESTJS: "nestjs",
  PRISMA: "prisma",
};

// Apply consistently:
await memory_save({
  content: "Use Prisma migrations for all database schema changes",
  tags: [TAGS.CONVENTION, TAGS.DATABASE, TAGS.PRISMA, TAGS.ACTIVE],
  priority: "critical",
});
```

---

## Integration with CI/CD

### Export/Import Memories Between Environments

> Note: Export/import functionality is planned for a future release. The following shows the planned workflow.

```bash
# Export memories to .rvf format (planned)
npx ruvector-memory export --output memories.rvf

# Import memories on CI agent (planned)
npx ruvector-memory import --input memories.rvf
```

### Environment-Specific Configuration

```bash
# Development
RUVECTOR_MEMORY_LOG_LEVEL=debug
RUVECTOR_MEMORY_DB_PATH=.opencode/dev-memory.db

# Production / CI
RUVECTOR_MEMORY_LOG_LEVEL=warn
RUVECTOR_MEMORY_DB_PATH=/persistent/storage/memory.db
RUVECTOR_MEMORY_PRELOAD_TOP=10
```

---

## Node.js Version Management

The plugin requires Node.js 22+. In projects that use multiple Node.js versions:

### `.nvmrc`

```
22
```

### `.tool-versions` (asdf)

```
nodejs 22.0.0
```

### `engines` in `package.json`

```json
{
  "engines": {
    "node": ">=22.0.0"
  }
}
```

---

## TypeScript Integration

The plugin ships full TypeScript types. For type-safe usage:

```typescript
import type {
  PluginActivationContext,
  RuVectorMemoryConfig,
  ToolResponse,
  ActivationResult,
} from "@ruvector/opencode-memory";

const context: PluginActivationContext = {
  projectRoot: process.cwd(),
  configPath: ".opencode/config.yaml",
};

const result: ToolResponse<ActivationResult> = await activatePlugin(context);

if (result.success) {
  // TypeScript knows result.data is ActivationResult here
  console.log(result.data.activated, result.data.degraded);
} else {
  // TypeScript knows result.error is string here
  console.error(result.error, result.code);
}
```

---

## Testing with the Plugin

### Reset State Between Tests

```typescript
import { resetPluginStateForTests } from "@ruvector/opencode-memory/core/plugin.js";
import { afterEach, beforeEach } from "vitest";

beforeEach(async () => {
  await activatePlugin({ projectRoot: "/tmp/test-project" });
});

afterEach(() => {
  resetPluginStateForTests(); // Clean global state
});
```

### Mock the Node.js Version

```typescript
// Test activation failure on old Node.js
const result = await activatePlugin({
  runtimeNodeVersion: "v18.0.0", // Simulates old Node.js
});

expect(result.success).toBe(false);
expect(result.code).toBe("ENODESEMVER");
```

---

## Security Considerations

1. **Local-only**: All memories are stored locally. Nothing is sent to external services.
2. **Sensitive content**: Be mindful of what you save. The database file is at `.opencode/ruvector-memory.db` — add it to `.gitignore` if you don't want to commit memories.
3. **Database access**: The plugin needs write access to the `.opencode/` directory.
4. **No authentication**: The vector database has no built-in auth — it's a single-user local store.

### Add to `.gitignore`

```gitignore
# RuVector Memory Database (contains project-specific memories)
.opencode/ruvector-memory.db
.opencode/ruvector-memory.db-wal
.opencode/ruvector-memory.db-shm
```
