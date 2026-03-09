# RuVector: System Architecture

> **Back to index**: [README.md](README.md)

## Overview

RuVector is structured around Domain-Driven Design (DDD) bounded contexts, each published as
separate Rust crates and npm packages. The system composes a vector store, a graph neural network
(GNN), a self-learning engine (SONA), and a universal binary format (RVF) that can encapsulate and
deploy all components as a single file.

## High-Level Component Diagram

```mermaid
graph TB
    subgraph "User Applications"
        TS["TypeScript / JavaScript"]
        PY["Python (via HTTP)"]
        CLI["CLI (npx ruvector)"]
    end

    subgraph "SDK Layer"
        CORE["@ruvector/core<br/>VectorDb — HNSW k-NN"]
        RVF_SDK["@ruvector/rvf<br/>RvfDatabase — Cognitive Containers"]
        SONA_SDK["@ruvector/sona<br/>SonaEngine — Self-Learning"]
        ATT["@ruvector/attention<br/>46 Attention Mechanisms"]
    end

    subgraph "Bridge Layer"
        NAPI["NAPI-RS<br/>(Node.js native bindings)"]
        WASM["WebAssembly (~46KB + 5.5KB tile)"]
    end

    subgraph "Rust Core"
        HNSW_CORE["ruvector-core<br/>HNSW + SIMD (AVX-512 / NEON)"]
        GNN_CORE["ruvector-gnn<br/>Graph Neural Network"]
        SONA_CORE["ruvector-sona<br/>Micro-LoRA + EWC++"]
        RVF_CORE["rvf-runtime<br/>Segments + COW + Crypto"]
    end

    subgraph "Storage"
        MMAP["mmap vectors"]
        HNSW_IDX["HNSW index"]
        RVF_FILE[".rvf file"]
        PG["PostgreSQL"]
    end

    TS --> CORE
    TS --> RVF_SDK
    TS --> SONA_SDK
    CLI --> CORE

    CORE --> NAPI
    RVF_SDK --> NAPI
    SONA_SDK --> NAPI
    CORE --> WASM
    RVF_SDK --> WASM

    NAPI --> HNSW_CORE
    NAPI --> GNN_CORE
    NAPI --> SONA_CORE
    NAPI --> RVF_CORE
    WASM --> HNSW_CORE
    WASM --> RVF_CORE

    HNSW_CORE --> MMAP
    HNSW_CORE --> HNSW_IDX
    GNN_CORE --> HNSW_CORE
    RVF_CORE --> RVF_FILE
    HNSW_CORE --> PG
```

## Runtime Deployment Targets

```mermaid
graph LR
    RUST_CORE["Rust Core Engine"]

    RUST_CORE -->|"NAPI-RS bindings"| NODE["Node.js ≥18<br/>52K inserts/sec"]
    RUST_CORE -->|"wasm32-unknown-unknown"| BROWSER["Browser<br/>~46KB WASM + 5.5KB tile"]
    RUST_CORE -->|"wasm32-wasi"| WORKER["Cloudflare Workers<br/>/ Edge Runtime"]
    RUST_CORE -->|"NAPI-RS"| DENO["Deno<br/>(npm: specifier)"]
    RUST_CORE -->|"C/Rust extension"| POSTGRES["PostgreSQL<br/>290+ SQL functions"]
    RUST_CORE -->|"RVF container"| BARE["Bare Metal<br/>Single .rvf — boots 125ms"]
    RUST_CORE -->|"cargo binary"| IOT["IoT / Edge<br/>~5µW/inference"]
```

## Query Processing Pipeline

```mermaid
sequenceDiagram
    participant App as Application
    participant SDK as @ruvector/core
    participant HNSW as HNSW Index
    participant GNN as GNN Layer
    participant SONA as SONA Engine

    App->>SDK: db.search({ vector, k })
    SDK->>HNSW: Approximate k-NN lookup
    HNSW-->>SDK: Raw candidate set (k*ef_search candidates)
    SDK->>GNN: Apply graph attention to candidates
    Note over GNN: Multi-head attention weights<br/>neighbors by learned relationships
    GNN-->>SDK: Re-ranked result set
    SDK-->>App: SearchResult[] (top-k)

    Note over SDK,SONA: Async feedback loop
    App->>SDK: User interaction signal (click, dwell, skip)
    SDK->>SONA: endTrajectory(builder, qualityScore)
    SONA->>SONA: Micro-LoRA update (<1ms)
    Note over SONA: Periodic background: EWC++ + pattern clustering
    SONA-->>GNN: Updated attention weights
```

## DDD Bounded Contexts

```mermaid
graph TB
    subgraph "Vector Store Context"
        VS_VDB["VectorDb (HNSW)"]
        VS_DIST["Distance Metrics<br/>cosine · euclidean · dot"]
        VS_QUANT["Quantization<br/>f32 · f16 · bf16 · int8"]
        VS_MMAP["Memory-Mapped Storage"]
    end

    subgraph "Graph Engine Context"
        GE_GNN["GNN Layers"]
        GE_ATT["Attention Mechanisms (×46)"]
        GE_GRAPH["Property Graph<br/>Cypher · SPARQL"]
        GE_MINCUT["Stoer-Wagner Mincut"]
    end

    subgraph "Learning Context"
        LC_SONA["SONA Engine"]
        LC_MICRO["Micro-LoRA (rank 1-2, <1ms)"]
        LC_BASE["Base LoRA (rank 8+, periodic)"]
        LC_EWC["EWC++ (anti-forgetting)"]
        LC_PATTERNS["ReasoningBank (pattern store)"]
    end

    subgraph "Container Context"
        CC_RVF["RVF Runtime"]
        CC_COW["COW Branching"]
        CC_WITNESS["Witness Chain (audit)"]
        CC_CRYPTO["Post-Quantum Crypto<br/>ML-DSA-65 · Ed25519 · SHAKE-256"]
        CC_KERNEL["Linux Microkernel (optional)"]
    end

    subgraph "Routing Context"
        RC_MCP["MCP Gateway"]
        RC_DAG["Execution DAG"]
        RC_COGGATE["Cognitum Gate (fast routing)"]
        RC_RAFT["Raft Consensus"]
        RC_CRDT["CRDT Delta Sync"]
    end

    VS_VDB --> GE_GNN
    GE_GNN --> LC_SONA
    LC_SONA --> GE_ATT
    VS_VDB --> CC_RVF
    CC_RVF --> RC_MCP
```

## RVF Segment Structure

The RVF format packs multiple typed segments into a single binary file. Every tool preserves
unknown segments, enabling backward compatibility.

```mermaid
graph LR
    subgraph "RVF File (example: agent_memory.rvf)"
        M["0x00 MANIFEST_SEG<br/>File UUID, dimension, metric"]
        V["0x01 VEC_SEG<br/>Raw float32/int8 vectors"]
        I["0x02 INDEX_SEG<br/>HNSW graph structure"]
        ME["0x03 META_SEG<br/>JSON / CBOR metadata"]
        Q["0x04 QUANT_SEG<br/>Quantization codebooks"]
        OV["0x05 OVERLAY_SEG<br/>LoRA adapter weights"]
        G["0x06 GRAPH_SEG<br/>Property graph adjacency"]
        W["0x0B WITNESS_SEG<br/>Append-only audit chain"]
        CR["0x0A CRYPTO_SEG<br/>Signatures + key material"]
        K["0x0E KERNEL_SEG<br/>Linux microkernel (optional)"]
        COW["0x20 COW_MAP_SEG<br/>Copy-on-write cluster map"]
    end
```

## SONA Dual-Loop Learning Architecture

```mermaid
graph TB
    subgraph "Instant Loop (< 1ms)"
        IL_INPUT["Inference Input"]
        IL_MICRO["Micro-LoRA (rank 1-2)"]
        IL_GRAD["Gradient Accumulation"]
        IL_APPLY["Apply to activations"]
    end

    subgraph "Background Loop (periodic, 30-60 min)"
        BL_CLUSTER["k-means Pattern Clustering"]
        BL_BASE["Base LoRA Update (rank 8+)"]
        BL_EWC["EWC++ Stability Check"]
        BL_PRUNE["Low-quality pattern pruning"]
    end

    subgraph "ReasoningBank"
        RB["Learned Patterns<br/>General · Reasoning · Factual<br/>Creative · CodeGen · Conversational"]
    end

    IL_INPUT --> IL_MICRO
    IL_MICRO --> IL_GRAD
    IL_GRAD --> IL_APPLY
    IL_APPLY --> BL_CLUSTER

    BL_CLUSTER --> RB
    BL_CLUSTER --> BL_BASE
    BL_BASE --> BL_EWC
    BL_EWC --> BL_PRUNE
    BL_PRUNE --> RB
    RB --> IL_MICRO
```

## Mathematical Foundations

### HNSW (Hierarchical Navigable Small Worlds)

The index is organized as hierarchical layers. Layer 0 contains all vectors; higher layers
contain random subsets for long-range jumps. Search starts at the top layer and greedily
descends, pruning traversal with early-exit when GNN coherence confidence exceeds threshold.

- **ef_construction** — candidate pool size during index build (higher = better recall, slower build)
- **m** — number of bidirectional links per node (higher = better recall, more memory)
- **ef_search** — candidate pool at query time (tune for recall vs. latency trade-off)

### Sheaf Laplacian (Prime Radiant Coherence Engine)

RuVector extends the standard graph Laplacian to a **sheaf Laplacian** that measures the
*residual inconsistency* across the vector graph. Given a query response, it computes:

$$\delta = \| \mathcal{L}_{\mathcal{F}} \cdot x \|$$

where $\mathcal{L}_{\mathcal{F}}$ is the Coboundary map of the sheaf over the graph. When
$\delta$ exceeds a configurable threshold, the system flags the output as a potential hallucination.

### Stoer-Wagner Mincut

Applied to the attention routing graph to identify the weakest computational paths. Paths
below the mincut threshold are pruned, reducing unnecessary computation by up to **50%**
without significant recall loss.

## Key Design Principles

- **Files under 500 lines** — all source files are kept small; bounded contexts enforce separation.
- **Typed interfaces** — every public API uses strict TypeScript types (full `.d.ts` declarations).
- **Event Sourcing** — all database state changes flow through immutable events recorded in the witness chain.
- **TDD London School** — mock-first testing; integration tests verify bounded context contracts.
- **Zero secrets in code** — input validation at all system boundaries; file paths sanitized against traversal.
