# RuVector: Complete Ecosystem Reference

> **Repository**: [ruvnet/ruvector](https://github.com/ruvnet/ruvector)
> **Author**: rUv (Cognitum) — CES 2026 Innovation Award Honoree
> **License**: MIT | **Latest Release**: v0.88.0

RuVector is a **self-learning, self-optimizing vector database** with graph intelligence, local AI inference,
and PostgreSQL integration — all built in Rust and deployable from a single file.

Unlike traditional vector databases that store and search data the same way every time, RuVector
**watches how you use it and gets smarter**: search results improve automatically, the system tunes itself
to your workload, and it runs AI models directly on your hardware — no cloud APIs, no per-query billing.

## Quick Start

```bash
# Interactive installer — lists all available packages
npx ruvector install

# Core vector database (Node.js / TypeScript)
npm install @ruvector/core

# RVF cognitive containers (universal binary format)
npm install @ruvector/rvf

# Self-learning engine (SONA)
npm install @ruvector/sona

# Self-learning hooks integration (Claude Code / OpenCode)
npx @ruvector/cli hooks init && npx @ruvector/cli hooks install
```

### Minimal TypeScript Example

```typescript
import { VectorDb, VectorEntry, SearchResult } from '@ruvector/core';

const db = new VectorDb({
  dimensions: 1536,           // Match your embedding model's output dimension
  maxElements: 100_000,       // Pre-allocate index capacity
  storagePath: './vectors.db', // Omit for in-memory-only mode
  distanceMetric: 'cosine',   // Best for normalized LLM embeddings (OpenAI, Cohere)
  ef_construction: 200,       // Higher = better recall, slower builds
  m: 16,                      // Higher = better recall, more memory
});

// Insert a vector with metadata
const entry: VectorEntry = {
  id: 'doc_1',
  vector: new Float32Array(1536), // Replace with a real embedding from your model
  metadata: { source: 'my-docs', category: 'technical' },
};
const id = await db.insert(entry);

// Search for nearest neighbors
const results: SearchResult[] = await db.search({
  vector: new Float32Array(1536), // Replace with your query embedding
  k: 10,
});
// [{ id: 'doc_1', score: 0.99, metadata: { source: 'my-docs', ... } }, ...]
```

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture](ruvector/architecture.md) | System design, Mermaid diagrams, DDD bounded contexts |
| [Core API](ruvector/core-api.md) | `@ruvector/core` — VectorDb class, HNSW, distance metrics |
| [RVF Cognitive Containers](ruvector/rvf-cognitive-containers.md) | `.rvf` format, COW branching, witness chains, CLI |
| [SONA Engine](ruvector/sona-engine.md) | Self-learning, Micro-LoRA, EWC++, trajectory recording |
| [Attention Mechanisms](ruvector/attention-mechanisms.md) | 46 attention types, GNN integration patterns |
| [Ecosystem Packages](ruvector/ecosystem-packages.md) | All 49+ npm packages — installation matrix |
| [Use Cases](ruvector/use-cases.md) | RAG, agent memory, semantic search, swarms — with TypeScript code |
| [Performance & Security](ruvector/performance-security.md) | Benchmarks, SIMD, quantization, post-quantum crypto |
| [PostgreSQL Extension](ruvector/postgresql-extension.md) | Drop-in pgvector replacement, 290+ SQL functions |
| [Deployment](ruvector/deployment.md) | Node.js, Browser, Edge, Docker, self-booting `.rvf` |
| [MCP Integration](ruvector/mcp-integration.md) | Model Context Protocol server for AI agents |
| [Troubleshooting](ruvector/troubleshooting.md) | Diagnostic matrix, HNSW tuning, performance fixes |

## What Makes RuVector Different

| Capability | Traditional Vector DB | RuVector |
|------------|----------------------|----------|
| Learning | Static — never improves | SONA adapts in <1ms per request |
| Deployment | Servers + dependencies | Single `.rvf` file — boots in 125ms |
| Versioning | None | Git-like COW branching |
| Security | Basic auth | Post-quantum crypto + witness chains |
| Local inference | External API required | Built-in via ruvllm (GGUF, LoRA) |
| Hallucination detection | Manual guardrails | Sheaf Laplacian coherence engine |
| Graph queries | Separate graph DB required | Cypher + SPARQL built in |
| PostgreSQL | pgvector-compatible | Drop-in replacement (290+ SQL functions) |
| Distributed sync | Manual + etcd | Raft consensus + CRDT delta sync |

## Key Concepts

- **HNSW** — Hierarchical Navigable Small Worlds: approximate nearest-neighbor search with
  early-exit optimization (reduces latency 30–50% on coherent queries).
- **GNN** — Graph Neural Network layer atop HNSW results; learns from query patterns to improve
  ranking over time. Gets smarter the more you use it.
- **SONA** — Self-Optimizing Neural Architecture: dual-loop learning (instant Micro-LoRA <1ms +
  periodic background EWC++ to prevent catastrophic forgetting).
- **RVF** — RuVector Format: a binary cognitive container holding vectors, models, graph state,
  Linux kernel image, eBPF programs, and cryptographic attestation in a single file.
- **COW** — Copy-On-Write: branching a 1M-vector database creates only a ~2.5 MB delta, not a full copy.
- **Prime Radiant** — Coherence engine using Sheaf Laplacian to detect AI hallucinations by measuring
  structural inconsistency in the learned graph.
- **MCP** — Model Context Protocol gateway for integrating RuVector with AI agent orchestration
  platforms (Claude-Flow, Agentic-Flow, etc.).

## AI Agent SKILL

This repository includes a fully-configured AI agent SKILL for integrating RuVector capabilities
into any coding assistant. The SKILL is defined once canonically and referenced across all IDE integrations.

**Canonical SKILL source**: [`docs/ruvector/skill-ruvector-prime.md`](ruvector/skill-ruvector-prime.md)

**IDE / CLI integrations** (all reference the canonical source above):

| Environment | Reference File |
|-------------|----------------|
| GitHub Copilot | `.github/skills/bmad-ruvector-prime/SKILL.md` |
| OpenCode | `.opencode/skills/bmad-ruvector-prime/SKILL.md` |
| Generic agents / CLI | `.agent/skills/bmad-ruvector-prime/SKILL.md` |

Any update to `skill-ruvector-prime.md` is automatically reflected in all three environments,
as the reference files contain only a directive to load the canonical path.
