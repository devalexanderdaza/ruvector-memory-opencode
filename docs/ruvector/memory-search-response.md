# Memory Search Response Format

## Overview

The `memory_search` tool returns an enriched `MemorySearchResponse` object with source context,
confidence scores, and composite relevance ranking. This document describes the response contract
and provides example payloads.

## Response Contract

```typescript
interface MemorySearchResponse {
  success: boolean;          // Whether the search operation succeeded
  results: SearchResult[];   // Ranked list of matching memories (sorted by relevance, descending)
  count: number;             // Total number of results returned
  _meta?: {
    query?: string;          // The original search query
    timestamp: string;       // Response generation time (ISO-8601)
    queryLatencyMs: number;  // Total search latency in milliseconds
  };
}

interface SearchResult {
  id: string;                               // Memory UUID
  content: string;                          // Original text (max 8KB)
  relevance: number;                        // Composite relevance score [0.0–1.0], higher = more relevant
  confidence: number;                       // Memory reliability score [-1.0–1.0], higher = more trusted
  timestamp: string;                        // Creation time (ISO-8601)
  source: 'manual' | 'agent' | 'import';   // How the memory was created
  tags?: string[];                          // Optional categorization tags
  importance?: number;                      // Optional priority level [1–5]
  projectContext?: string;                  // Optional project the memory belongs to
}
```

## Relevance Score

Relevance is derived from the composite vector search score, transformed from "lower distance is better"
to "higher is better" in range [0.0, 1.0]:

```
relevance = max(0, 1.0 - |compositeScore|)
```

The composite score already incorporates signals from:
- Cosine vector distance to the query
- Recency boost (newer memories rank slightly higher)
- Priority boost (`critical` memories rank higher, `low` memories rank lower)
- Confidence boost (trusted memories rank slightly higher)

## Confidence Score

Confidence reflects memory reliability based on usage and feedback:

```
confidence = (0.5 × normalizeAccessCount) + (0.5 × feedbackScore)

Where:
  normalizeAccessCount = min(accessCount / 10, 1.0)
  feedbackScore        = (positive_feedback - negative_feedback) / max(1, total_feedback)
```

**Interpretation:**
| Range | Meaning |
|-------|---------|
| `0.8 – 1.0` | High confidence: frequently accessed, consistently positive feedback |
| `0.4 – 0.8` | Medium confidence: moderate usage, neutral/positive feedback |
| `0.0 – 0.4` | Low confidence: low usage, no meaningful feedback yet |
| `< 0.0`     | Unreliable: memory has received significant negative corrections |

## Example Payloads

### Successful Search with Results

```json
{
  "success": true,
  "count": 2,
  "results": [
    {
      "id": "mem-abc123",
      "content": "Always use async/await with proper try-catch for error handling in TypeScript",
      "relevance": 0.92,
      "confidence": 0.80,
      "timestamp": "2026-03-10T14:30:00Z",
      "source": "manual",
      "tags": ["typescript", "error-handling", "best-practices"],
      "importance": 4,
      "projectContext": "ruvector-memory-opencode"
    },
    {
      "id": "mem-def456",
      "content": "Use Result types instead of throwing exceptions in library code",
      "relevance": 0.78,
      "confidence": 0.25,
      "timestamp": "2026-03-09T08:00:00Z",
      "source": "agent",
      "tags": ["patterns", "functional"],
      "importance": 3
    }
  ],
  "_meta": {
    "query": "typescript error handling best practices",
    "timestamp": "2026-03-12T22:57:00.000Z",
    "queryLatencyMs": 47
  }
}
```

### Successful Search — No Results

```json
{
  "success": true,
  "count": 0,
  "results": [],
  "_meta": {
    "query": "kubernetes deployment strategies",
    "timestamp": "2026-03-12T22:57:00.000Z",
    "queryLatencyMs": 12
  }
}
```

### Failed Search — Database Not Ready

```json
{
  "success": false,
  "error": "Memory database is not ready",
  "code": "ENOTREADY",
  "reason": "initialization"
}
```

## Source Field Values

| Value | Description |
|-------|-------------|
| `manual` | Created directly by the user via `memory_save` |
| `agent` | Created or updated automatically by an AI agent |
| `import` | Imported from an external source or migration |

When the stored source value is absent or invalid, the formatter defaults to `"manual"`.

## Sorting

Results are always sorted by `relevance` descending — the most relevant memory appears first.

## Related Files

- Implementation: [src/tools/memory-response-formatter.ts](../../src/tools/memory-response-formatter.ts)
- Confidence logic: [src/vector/confidence-calculator.ts](../../src/vector/confidence-calculator.ts)
- Types: [src/shared/types.ts](../../src/shared/types.ts)
- Tool integration: [src/tools/tools/memory-search-tool.ts](../../src/tools/tools/memory-search-tool.ts)
