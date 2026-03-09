# PostgreSQL Extension — `ruvector-postgres`

> **Back to index**: [README.md](README.md)
> **Packages**: `ruvector-postgres` · `@ruvector/pg-extension`
> **PostgreSQL versions**: 14, 15, 16
> **pgvector compatibility**: Drop-in replacement (all `pgvector` SQL syntax works unchanged)

The RuVector PostgreSQL extension adds HNSW vector indexing, GNN-enhanced similarity search,
and 290+ SQL functions directly to PostgreSQL. It is a drop-in replacement for `pgvector` —
existing `pgvector` SQL queries run without modification, with improved performance.

## Installation

```bash
# Option 1: npm-based installer (manages the C extension binary)
npm install ruvector-postgres
npx ruvector-postgres install --pg-config=$(pg_config --bindir)/pg_config

# Option 2: From source (requires Rust + cargo)
git clone https://github.com/ruvnet/ruvector
cd ruvector/extensions/postgresql
cargo pgrx install --release

# Option 3: Docker
docker pull ruvnet/ruvector-postgres:0.88.0
docker run -e POSTGRES_PASSWORD=secret -p 5432:5432 ruvnet/ruvector-postgres:0.88.0
```

```sql
-- Enable the extension in your database
CREATE EXTENSION IF NOT EXISTS ruvector;
```

## Basic Usage

```sql
-- Create a table with a vector column (1536-dim for OpenAI embeddings)
CREATE TABLE documents (
  id        SERIAL PRIMARY KEY,
  title     TEXT NOT NULL,
  body      TEXT,
  embedding vector(1536),
  category  TEXT,
  tenant_id UUID NOT NULL DEFAULT gen_random_uuid()
);

-- Build an HNSW index for fast approximate nearest-neighbor search
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- Insert vectors (embedding is a PostgreSQL array cast to vector)
INSERT INTO documents (title, body, embedding, category)
VALUES (
  'GDPR Overview',
  'The General Data Protection Regulation...',
  '[0.01, -0.02, 0.87, ...]'::vector,  -- 1536 values
  'legal'
);

-- Cosine similarity search (find 10 most similar to query vector)
SELECT
  id,
  title,
  1 - (embedding <=> '[0.01, ...]'::vector) AS score
FROM documents
WHERE category = 'legal'                       -- B-tree index on category
ORDER BY embedding <=> '[0.01, ...]'::vector   -- HNSW ANN scan
LIMIT 10;
```

## Distance Operators

| Operator | Metric | Index Type |
|----------|--------|-----------|
| `<=>` | Cosine distance (1 − similarity) | `vector_cosine_ops` |
| `<->` | L2 (Euclidean) distance | `vector_l2_ops` |
| `<#>` | Negative dot product | `vector_ip_ops` |

```sql
-- Euclidean distance
SELECT id, embedding <-> '[...]'::vector AS l2_dist
FROM documents ORDER BY l2_dist LIMIT 5;

-- Dot product (use when vectors are pre-normalized for speed)
SELECT id, embedding <#> '[...]'::vector AS dot_score
FROM documents ORDER BY dot_score LIMIT 5;
```

## HNSW Index Configuration

```sql
-- High-recall index
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 32, ef_construction = 400);

-- Tune ef_search at query time (without rebuilding)
SET ruvector.ef_search = 200;
SELECT id FROM documents ORDER BY embedding <=> '[...]'::vector LIMIT 10;
RESET ruvector.ef_search;
```

## Multi-Tenancy

Isolate vectors per tenant with row-level security:

```sql
-- Enable row-level security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy: each user sees only their own tenant's rows
CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Application sets the tenant context at session start
SET app.tenant_id = '550e8400-e29b-41d4-a716-446655440000';

-- Queries automatically filter to tenant's rows
SELECT id, title FROM documents
ORDER BY embedding <=> '[...]'::vector LIMIT 10;
```

## GNN-Enhanced Search

RuVector extends pgvector with GNN-assisted re-ranking via a custom SQL function:

```sql
-- GNN re-rank: first fetch k*3 candidates via HNSW, then re-rank with GNN
SELECT id, title, score
FROM ruvector_gnn_search(
  table_name  => 'documents',
  query       => '[0.01, -0.02, 0.87, ...]'::vector,
  k           => 10,
  ef_search   => 60,    -- Fetch 60 candidates (6× expansion)
  gnn_layers  => 2
) AS (id int, title text, score float4);
```

## 290+ SQL Functions

RuVector exposes all pgvector functions plus extensions:

```sql
-- Vector arithmetic
SELECT vector_add('[1,2,3]'::vector, '[4,5,6]'::vector);       -- [5,7,9]
SELECT vector_sub('[4,5,6]'::vector, '[1,2,3]'::vector);       -- [3,3,3]
SELECT vector_mul('[1,2,3]'::vector, '[4,5,6]'::vector);       -- [4,10,18]
SELECT vector_scale('[1,2,3]'::vector, 2.0);                   -- [2,4,6]

-- Norms and similarity
SELECT vector_norm('[3,4]'::vector);                            -- 5
SELECT vector_normalize('[3,4]'::vector);                      -- [0.6,0.8]
SELECT cosine_similarity('[1,0]'::vector, '[1,0]'::vector);    -- 1.0
SELECT dot_product('[1,2,3]'::vector, '[4,5,6]'::vector);      -- 32

-- Aggregates
SELECT avg(embedding) FROM documents WHERE category = 'legal';  -- centroid vector
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY embedding <=> '[...]'::vector)
FROM documents;

-- Index statistics
SELECT ruvector_index_stats('documents_embedding_idx');
-- { "vectors": 150000, "m": 16, "ef_construction": 200, "recall_estimate": 0.94 }
```

## TypeScript Integration

```typescript
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function semanticSearch(queryVector: Float32Array, k = 10, tenantId: string) {
  const vectorString = `[${Array.from(queryVector).join(',')}]`;

  const { rows } = await pool.query(
    `SET app.tenant_id = $1;
     SELECT id, title, 1 - (embedding <=> $2::vector) AS score
     FROM documents
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    [tenantId, vectorString, k],
  );

  return rows as Array<{ id: number; title: string; score: number }>;
}

async function insertDocument(
  title: string,
  embedding: Float32Array,
  category: string,
  tenantId: string,
) {
  const vectorString = `[${Array.from(embedding).join(',')}]`;
  const { rows } = await pool.query(
    `INSERT INTO documents (title, embedding, category, tenant_id)
     VALUES ($1, $2::vector, $3, $4)
     RETURNING id`,
    [title, vectorString, category, tenantId],
  );
  return rows[0].id as number;
}
```

## Pgvector Compatibility

All standard `pgvector` syntax works without changes:

```sql
-- pgvector syntax — works unchanged in ruvector-postgres
CREATE TABLE items (embedding vector(1536));
CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops);
SELECT * FROM items ORDER BY embedding <=> '[...]'::vector LIMIT 5;
```

Migration from `pgvector`:

```sql
-- 1. Drop pgvector
DROP EXTENSION vector;

-- 2. Install ruvector
CREATE EXTENSION ruvector;

-- 3. No schema changes needed — all indexes, columns, and queries are compatible
-- Optional: rebuild HNSW indexes to use ruvector's improved construction
REINDEX INDEX CONCURRENTLY your_hnsw_index;
```

## Performance vs. pgvector

| Metric | pgvector 0.7 | ruvector-postgres 0.88 |
|--------|:-----------:|:-------------------:|
| HNSW build (1M vecs) | 42 min | 18 min |
| Search latency p50 (1M) | 8.2ms | 3.1ms |
| Search throughput (1M) | 1 800 qps | 3 200 qps |
| Recall@10 (ef=100) | 0.91 | 0.94 |
| Memory per 1M vecs (1536-dim f16) | 6.2 GB | 4.8 GB |

*Benchmarks run on PostgreSQL 16, AWS m7i.4xlarge.*
