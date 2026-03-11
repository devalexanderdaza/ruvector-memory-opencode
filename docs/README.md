# @ruvector/opencode-memory — Documentation

**Local-first memory plugin for OpenCode** with automatic activation, semantic search, and zero-configuration setup.

> Version: **0.2.0** | Runtime: **Node.js ≥ 22** | Language: **TypeScript 5.7 / ESM**

---

## What Is This?

`@ruvector/opencode-memory` is an **OpenCode plugin** that gives AI coding agents persistent, searchable memory. It stores notes, decisions, patterns, and context in a local vector database, and automatically injects the most relevant memories into every agent session — without any manual configuration.

### Core Capabilities

| Capability | Description |
|---|---|
| 🧠 **Persistent Memory** | Stores knowledge in a local SQLite + HNSW vector database |
| 🔍 **Semantic Search** | Finds relevant memories using cosine similarity, not keyword matching |
| ⚡ **Auto-Activation** | Activates automatically when OpenCode starts — no manual setup needed |
| 📌 **Context Injection** | Injects top-N relevant memories into every agent session passively |
| 🏗️ **Project Awareness** | Automatically detects project type, language, and frameworks |
| 🎓 **Learning** | Adjusts confidence scores based on feedback |
| 🔒 **Local-First** | All data stays on your machine — no external APIs |
| 🟢 **Graceful Degradation** | Plugin activates even if background tasks fail |

---

## Documentation Index

| Document | Description |
|---|---|
| [Getting Started](./getting-started.md) | Installation, quick start, and first use |
| [Architecture](./architecture.md) | Technical architecture, components, and data flow |
| [API Reference](./api-reference.md) | Public TypeScript API and type definitions |
| [Configuration](./configuration.md) | All configuration options, YAML, and environment variables |
| [Memory Tools](./memory-tools.md) | `memory_save`, `memory_search`, `memory_learn_from_feedback` |
| [Integration Guide](./integration-guide.md) | How to integrate in your projects and workflows |
| [Development Guide](./development.md) | Contributing, building, testing, and code style |
| [Project Status](./project-status.md) | Current state, known issues, and roadmap |

### Additional Reference

| Document | Description |
|---|---|
| [RuVector Base Explanation](./RUVECTOR_BASE_EXPLAIN.md) | Deep dive into the RuVector ecosystem |
| [RuVector Ecosystem](./ruvector/README.md) | RuVector package ecosystem documentation |
| [Architecture Decisions](./ruvector/architecture.md) | System design decisions |

---

## Quick Start (30 seconds)

```bash
# Install the plugin
npm install @ruvector/opencode-memory

# Optional: install the full vector engine for best performance
npm install @ruvector/core
```

Start your OpenCode session. The plugin activates automatically — no code changes required.

### First Memory Save

```typescript
// The agent can now use these tools automatically:
await memory_save({
  content: "Always use named exports in this project",
  tags: ["convention", "exports"],
  source: "manual",
  priority: "critical",
});

// Search relevant memories
const results = await memory_search({
  query: "export conventions",
  limit: 5,
});
```

---

## Where to Use This

| Use Case | Benefit |
|---|---|
| **AI-assisted coding sessions** | Agent remembers your project conventions automatically |
| **Multi-session development** | Knowledge persists between sessions |
| **Team knowledge bases** | Store and retrieve architecture decisions |
| **Onboarding** | New devs (or agents) can search past decisions |
| **Code review patterns** | Remember recurring issues and solutions |
| **RAG pipelines** | Local retrieval-augmented generation for codebases |

---

## Tech Stack

- **TypeScript 5.7** with strict mode — fully typed
- **ESM modules** for Node.js 22+
- **HNSW** (Hierarchical Navigable Small World) vector index
- **Cosine similarity** for semantic search
- **Zod** for configuration validation
- **Vitest** with 90%+ coverage threshold
- **Biome** for linting and formatting
