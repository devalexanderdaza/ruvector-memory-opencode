# Troubleshooting Guide

> **Back to index**: [README.md](README.md)

## Quick Diagnostic Matrix

| Symptom | Most Likely Cause | First Fix |
|---------|------------------|-----------|
| `Error: native module not found` | Missing optional dep | [→ Native module not found](#native-module-not-found) |
| `RangeError: dimensions mismatch` | Vector size wrong | [→ Dimension mismatch](#dimension-mismatch) |
| Recall < 0.85 at k=10 | Low ef_search | [→ Low recall](#low-recall) |
| Search latency > 20ms | Index too large for RAM | [→ Slow search](#slow-search) |
| `ENOMEM` / OOM crash | Index exceeded RAM | [→ OOM errors](#out-of-memory-oom) |
| `ENOENT` on open | File path wrong / missing | [→ File not found](#file-not-found) |
| Filter returns empty results | Metadata type mismatch | [→ Filter not working](#filter-not-working) |
| High CPU on insert | ef_construction too high | [→ Slow inserts](#slow-inserts) |
| Witness chain `valid: false` | File tampered / corrupted | [→ Corrupted witness chain](#corrupted-witness-chain) |
| WASM fails in browser | CSP blocks WASM | [→ WASM initialization fails](#wasm-initialization-fails) |

---

## Native Module Not Found

```
Error: Cannot find module '@ruvector/core-linux-x64-gnu'
```

**Cause**: The platform-specific optional dependency was not installed (common in Docker builds
using `npm ci --ignore-optional`).

**Fix**:

```bash
# Install without --ignore-optional
npm install

# Or install the specific binary manually:
npm install @ruvector/core-linux-x64-gnu   # Linux x64
npm install @ruvector/core-linux-arm64-gnu  # Linux ARM64
npm install @ruvector/core-darwin-arm64     # macOS Apple Silicon
npm install @ruvector/core-darwin-x64       # macOS Intel
npm install @ruvector/core-win32-x64-msvc  # Windows x64
```

**Verify**:

```javascript
const { VectorDb } = require('@ruvector/core');
console.log('Loaded successfully'); // Should not throw
```

**WASM fallback** (Node.js without native binary):

```bash
npm install @ruvector/core-wasm
```

```typescript
// Use the WASM build explicitly
import { VectorDbWasm as VectorDb } from '@ruvector/core-wasm';
```

---

## Dimension Mismatch

```
RangeError: vector has 384 dimensions, expected 1536
```

**Cause**: Inserting or searching with a vector of the wrong size.

**Fix**:

```typescript
const db = new VectorDb({ dimensions: 1536 }); // Set at construction time

// Always validate before insert
async function safeInsert(vector: Float32Array) {
  if (vector.length !== 1536) {
    throw new Error(`Expected 1536 dimensions, got ${vector.length}`);
  }
  await db.insert({ vector });
}
```

**Common model dimensions**:

| Model | Dimensions |
|-------|-----------|
| OpenAI text-embedding-3-small | 1536 |
| OpenAI text-embedding-3-large | 3072 |
| OpenAI text-embedding-ada-002 | 1536 |
| Cohere embed-english-v3.0 | 1024 |
| sentence-transformers/all-MiniLM-L6-v2 | 384 |
| sentence-transformers/all-mpnet-base-v2 | 768 |

---

## Low Recall

**Symptom**: The expected document is not in the top-k results even when you know it exists.

**Diagnosis**:

```typescript
// Check actual recall by comparing exhaustive vs approximate search
const exact = await db.search({ vector: queryVec, k: 100, efSearch: 10000 }); // Near-exhaustive
const approx = await db.search({ vector: queryVec, k: 10, efSearch: 100 });

const exactIds = new Set(exact.slice(0, 10).map(r => r.id));
const approxIds = new Set(approx.map(r => r.id));
const overlap = [...approxIds].filter(id => exactIds.has(id)).length;
console.log('Recall@10:', overlap / 10); // e.g. 0.71 → too low
```

**Fixes by cause**:

```typescript
// 1. Increase ef_search (most common fix)
const results = await db.search({ vector: queryVec, k: 10, efSearch: 200 }); // was 100

// 2. Rebuild index with higher ef_construction
const betterDb = new VectorDb({
  dimensions: 1536,
  ef_construction: 400,  // was 200
  m: 32,                 // was 16
});

// 3. Check distance metric — cosine requires normalized vectors
// If using dot product but vectors are not normalized:
function normalize(v: Float32Array): Float32Array {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map(x => x / norm) as unknown as Float32Array;
}
const results2 = await db.search({ vector: normalize(queryVec), k: 10 });
```

---

## Slow Search

**Symptom**: Latency > 10ms at k=10 with fewer than 100K vectors.

**Diagnosis**:

```typescript
const start = performance.now();
const results = await db.search({ vector: queryVec, k: 10 });
console.log(`Search latency: ${(performance.now() - start).toFixed(2)}ms`);
```

**Causes and fixes**:

```typescript
// 1. ef_search too high — try reducing to 50-100 for < 0.5ms
const fast = await db.search({ vector: queryVec, k: 10, efSearch: 50 });

// 2. Index larger than RAM — check memory usage
const stats = await db.len();
const estimatedGB = (stats * 1536 * 4) / 1e9;
console.log(`Estimated RAM: ${estimatedGB.toFixed(2)} GB`);
// If > available RAM → enable f16 quantization or RVF mmap

// 3. Concurrent searches bottlenecking — use worker_threads
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
// Each worker gets its own VectorDb instance for thread safety

// 4. Enable quantization to reduce working set
const compactDb = new VectorDb({
  dimensions: 1536,
  quantization: 'f16',  // ~50% memory reduction
});
```

---

## Out of Memory (OOM)

**Symptom**: Node.js crashes with `ENOMEM` or the process is killed by the OS.

**Fixes**:

```typescript
// 1. Use f16 or int8 quantization (halves/quarters memory)
const db = new VectorDb({
  dimensions: 1536,
  quantization: 'f16',
  storagePath: './vectors.db',
});

// 2. Use memory-mapped storage via RVF (vectors stay on disk, paged as needed)
import { RvfDatabase } from '@ruvector/rvf';
const rvf = await RvfDatabase.open('./large-dataset.rvf', {
  dimensions: 1536,
  // mmap is enabled by default in RvfDatabase
});

// 3. Increase Node.js heap limit (not a fix, but buys time)
// node --max-old-space-size=8192 server.js

// 4. Reduce ef_construction during index build (uses less RAM during build)
const buildDb = new VectorDb({
  dimensions: 1536,
  ef_construction: 100,  // Lower = less RAM during build; you can increase after
  maxElements: 1_000_000,
});
```

---

## File Not Found

```
Error: ENOENT: no such file or directory, open './vectors.db'
```

**Causes**:

- The file was never created (first run is fine — it will be created automatically).
- The directory does not exist (RuVector will **not** create parent directories).
- The path is relative and the working directory is different from expected.

**Fix**:

```typescript
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const storagePath = './data/vectors.db';
mkdirSync(dirname(storagePath), { recursive: true }); // Ensure directory exists

const db = new VectorDb({ dimensions: 1536, storagePath });
```

---

## Filter Not Working

**Symptom**: `filter: { category: 'legal' }` returns results from all categories.

**Cause**: Metadata values are stored as JSON. Type must match exactly.

```typescript
// Wrong: stored as number, filtering with string
await db.insert({ vector: v, metadata: { version: 2 } }); // stored as number
await db.search({ vector: q, k: 5, filter: { version: '2' } }); // string → no match

// Right: consistent types
await db.insert({ vector: v, metadata: { version: 2 } });
await db.search({ vector: q, k: 5, filter: { version: 2 } });  // number → matches

// Debug: inspect stored metadata
const entry = await db.get('doc-001');
console.log(typeof entry?.metadata?.version); // 'number'
```

---

## Slow Inserts

**Symptom**: Insert throughput drops below 10K ops/sec.

```typescript
// 1. Use batch insert via @ruvector/rvf (SIMD-optimized)
import { RvfDatabase } from '@ruvector/rvf';
const rvf = await RvfDatabase.open('./fast.rvf', { dimensions: 1536 });

// Batch insert is ~3.5× faster than individual inserts
const entries = vectors.map((v, i) => ({ id: `doc-${i}`, vector: v, metadata: {} }));
// Internal batch method (available via N-API directly)
// await rvfBatchInsert(handle, entries);

// 2. Disable witness chain signing during bulk load (re-enable after)
const bulk = await RvfDatabase.open('./bulk.rvf', {
  dimensions: 1536,
  signingKey: undefined, // Skip signing during bulk load
});
// ... bulk insert ...
// Load signing key after, then re-sign
await bulk.sign(signingKeyBytes);
```

---

## Corrupted Witness Chain

```
{ valid: false, tampered: true, firstBadEntry: 42 }
```

**This is a security event.** The file has been modified outside of RuVector, or the signing
key was changed without re-signing.

**Do not use the container until investigated.**

```typescript
// 1. Verify to get details
const report = await rvf.witnessChain.verify();
console.log('First bad entry:', report.firstBadEntry);
console.log('Expected hash:', report.expectedHash);
console.log('Found hash:', report.foundHash);

// 2. Restore from a known-good backup
// DO NOT attempt to repair the chain manually.

// 3. If intentional re-key: re-sign with the new key
// (Only do this if you have verified the data integrity through another means)
await rvf.sign(newKeyBytes);
```

---

## WASM Initialization Fails

**Symptom**: `TypeError: WebAssembly.instantiate is not allowed` or `init() never resolves`.

**Cause**: Content-Security-Policy (CSP) blocks WASM execution in the browser.

**Fix**: Add `'wasm-unsafe-eval'` (modern) or `'unsafe-eval'` (legacy) to your CSP:

```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'">
```

For bundlers, ensure `.wasm` files are resolved as assets, not inlined as base64:

```typescript
// vite.config.ts
export default {
  optimizeDeps: { exclude: ['@ruvector/core-wasm'] },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
};
```

---

## Enabling Debug Logging

```bash
# Full debug output
DEBUG=ruvector:* node your-app.js

# Specific namespaces
DEBUG=ruvector:hnsw,ruvector:sona node your-app.js
```

```typescript
// Programmatic debug level
process.env.RUVECTOR_LOG = 'debug'; // 'error' | 'warn' | 'info' | 'debug' | 'trace'
import { VectorDb } from '@ruvector/core'; // Must import AFTER setting env
```

---

## Getting Help

- **GitHub Issues**: [github.com/ruvnet/ruvector/issues](https://github.com/ruvnet/ruvector/issues)
- **npm page**: [npmjs.com/package/@ruvector/core](https://www.npmjs.com/package/@ruvector/core)
- Include in bug reports:
  - Node.js version (`node --version`)
  - Platform (`uname -a` or `node -e "console.log(process.platform, process.arch)"`)
  - RuVector version (`npm list @ruvector/core`)
  - Minimal reproduction script
