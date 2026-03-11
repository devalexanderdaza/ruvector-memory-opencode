# Story 2.4: Enriched Response with Source Context

**Status:** complete

**Story ID:** 2.4  
**Epic:** 2 — Reliable and Relevant Context Retrieval  
**Date Created:** 2026-03-10  
**Project:** ruvector-memory-opencode

---

## Story

As an agent integrator,
I want each search result to include source context and confidence metadata,
so that the agent can justify why it uses a memory and understand its reliability.

---

## Acceptance Criteria

**Given** a successful `memory_search()` call with one or more matching results
**When** the tool response is constructed
**Then** each item includes:
  - `content`: The original captured text (string, up to 8KB)
  - `relevance`: Composite similarity score (0.0–1.0)
  - `confidence`: Confidence score based on accessCount and feedbackScore (-1.0–1.0)
  - `timestamp`: ISO-8601 datetime when memory was created
  - `source`: Origin of the memory ('manual', 'agent', 'import')
  - `id`: Unique memory identifier for traceability

**And** the response format remains consistent with the tool's documented contract (see Section: Technical Requirements)

**And** all metadata is present in the response, even when confidence is low (no filtering at response layer)

**And** invalid or missing metadata fields do not crash the response (graceful fallback to defaults)

---

## Functional Requirements Implemented

- **FR10:** System returns results with source context (where learned, confidence, timestamp) so agent can justify memory usage

---

## Technical Requirements

### Response Payload Contract

All `memory_search()` responses MUST conform to this TypeScript interface (defined in `src/shared/types.ts`):

```typescript
interface SearchResult {
  id: string;                        // Memory UUID, required
  content: string;                   // Original text, max 8KB, required
  relevance: number;                 // Composite score 0.0–1.0, required
  confidence: number;                // Learning signal -1.0–1.0, required
  timestamp: string;                 // ISO-8601, required
  source: 'manual' | 'agent' | 'import';  // Origin, required
  tags?: string[];                   // Optional user tags
  importance?: number;               // Optional 1–5 scale
  projectContext?: string;           // Optional auto-detected project ID
}

interface MemorySearchResponse {
  success: boolean;
  results: SearchResult[];           // Ordered by relevance desc
  count: number;                     // Number of results returned
  _meta?: {
    query: string;
    timestamp: string;
    queryLatencyMs: number;           // Performance observation
  };
}
```

### Confidence Score Calculation

Confidence reflects memory reliability based on cumulative feedback and usage:

```
confidence = (0.5 * normalizeAccessCount) + (0.5 * feedbackScore)

normalizeAccessCount = min(accessCount / 10, 1.0)  // Cap at 10 accesses
feedbackScore = (positive_feedback_count - negative_feedback_count) / max(1, total_feedback)
```

**Interpretation:**
- `1.0`: High confidence (frequently accessed, consistently positive feedback)
- `0.5`: Medium confidence (moderate usage, neutral feedback)
- `< 0.0`: Low confidence (corrected multiple times, flagged unreliable)

### Relevance Score Calculation

Composite ranking already implemented in Story 2.2. **This story must preserve and return that score as-is.**

```
relevance = (0.6 * vectorSimilarity) + (0.25 * recencyBoost) + (0.15 * importanceBoost)
```

[Source: 2-2-relevance-scoring-with-composite-signals.md]

### Source Enumeration

Store source at memory creation time; return unchanged:

| Source | Meaning | Example Use Case |
|--------|---------|------------------|
| `manual` | User explicitly saved via `memory_save()` | Documented best practices, patterns |
| `agent` | Auto-captured from agent interaction | Lessons learned during code generation |
| `import` | Loaded from external `.rvf` export | Team shared knowledge, bootstrapped projects |

---

## Architecture Notes

### Component Changes Required

1. **`src/shared/types.ts`** — Add/update `SearchResult` interface
2. **`src/vector/vector-store.ts`** — Ensure `search()` method returns rich metadata
3. **`src/tools/tools/memory-search-tool.ts`** — Transform VectorStore results into response contract
4. **`src/tools/memory-response-formatter.ts`** (new file) — Dedicated formatter to prevent response payload bugs in future

### Data Flow

```
memory_search(query, limit, filters)
  ↓
VectorStoreAdapter.search()
  ↓ (returns Memory objects with all fields)
MemoryResponseFormatter.format()
  ↓ (transforms Memory → SearchResult)
Tool Response JSON
  ↓
Agent receives structured metadata
```

### Previous Story Continuity

**Story 2.3 (Search Filters)** implemented filter validation and over-fetch strategy. This story:
- Assumes `VectorStoreAdapter.search()` returns Memory objects with all required fields ✅
- Assumes composite relevance score is already computed and available ✅
- Builds on those foundations by **formatting and validating the response contract**

### Pagination & Large Result Sets

No pagination required for MVP. `limit` param (default 5) controls result count. If agent needs more, separate call required.

---

## Tasks / Subtasks

### **Task 1: Update/Verify `SearchResult` Type Contract**

- [x] 1.1 Open `src/shared/types.ts` and verify (or add) `SearchResult` interface with all 6 required fields
- [x] 1.2 Verify interface includes optional `tags`, `importance`, `projectContext` fields
- [x] 1.3 Add JSDoc comments documenting field semantics and value ranges
- [x] 1.4 Export `SearchResult` and `MemorySearchResponse` types for public API

### **Task 2: Extend `VectorStoreAdapter.search()` to Return Rich Metadata**

- [x] 2.1 Review `src/vector/vector-store.ts` `search()` method
- [x] 2.2 Ensure it returns full `Memory` objects (not just IDs or partial data)
- [x] 2.3 Verify all metadata fields are present before returning (add fallback defaults if missing)
- [x] 2.4 Add comments documenting fields returned for downstream use

### **Task 3: Implement Confidence Score Calculation**

- [x] 3.1 Create `src/vector/confidence-calculator.ts` with `computeConfidence(memory: Memory): number` function
- [x] 3.2 Implement formula: `(0.5 * normalizeAccessCount) + (0.5 * feedbackScore)`
- [x] 3.3 Add bounds checking (clamp to [-1.0, 1.0])
- [x] 3.4 Add unit tests validating edge cases (zero feedback, high access count, negative feedback)

### **Task 4: Create Response Formatter**

- [x] 4.1 Create `src/tools/memory-response-formatter.ts`
- [x] 4.2 Implement `formatSearchResults(memories: Memory[], query?: string): MemorySearchResponse`
- [x] 4.3 For each memory:
  - [x] 4.3.1 Compute confidence score using confidence calculator
  - [x] 4.3.2 Cast Memory → SearchResult (map all fields)
  - [x] 4.3.3 Ensure timestamp is ISO-8601 string (convert if numeric)
  - [x] 4.3.4 Handle missing fields with sensible defaults
- [x] 4.4 Set response `_meta` object: query, timestamp, latencyMs (measure time in search call)
- [x] 4.5 Return `{ success: true, results: [...], count }` contract

### **Task 5: Integrate Formatter into `memory-search-tool.ts`**

- [x] 5.1 Update `memory-search-tool.ts` to call `MemoryResponseFormatter.formatSearchResults()`
- [x] 5.2 Replace inline response construction with formatter call
- [x] 5.3 Test that response payload matches contract
- [x] 5.4 Ensure error responses are still properly formatted (separate error handler)

### **Task 6: Validation & Error Handling**

- [x] 6.1 Add validation in formatter: if SearchResult is malformed, throw meaningful error (don't silently pass bad data)
- [x] 6.2 Test graceful handling of missing/null metadata (use defaults)
- [x] 6.3 Test response with 0 results (should return `{ success: true, results: [], count: 0 }`)
- [x] 6.4 Test response with 1 result, 5 results, 10 results

### **Task 7: Unit Tests**

- [x] 7.1 `tests/unit/vector/confidence-calculator.test.ts` — Test confidence calculation formula
- [x] 7.2 `tests/unit/tools/memory-response-formatter.test.ts`
  - [x] 7.2.1 Test single result formatting
  - [x] 7.2.2 Test multiple results (verify ordering by relevance desc)
  - [x] 7.2.3 Test empty results
  - [x] 7.2.4 Test ISO-8601 timestamp formatting
  - [x] 7.2.5 Test source field preservation
  - [x] 7.2.6 Test missing optional fields (graceful defaults)
  - [x] 7.2.7 Test confidence boundary cases (-1.0, 0.0, 1.0)

### **Task 8: Integration Tests**

- [x] 8.1 Updated `tests/integration/save-search.test.ts` to verify enriched response format
  - [x] 8.1.1 Save memory with metadata (source, tags, etc.)
  - [x] 8.1.2 Search for that memory
  - [x] 8.1.3 Verify response includes all fields from contract
  - [x] 8.1.4 Verify relevance score is present and within bounds [0, 1]
  - [x] 8.1.5 Verify confidence is calculated correctly
  - [x] 8.1.6 Verify timestamp is valid ISO-8601

### **Task 9: Code Review & Documentation**

- [x] 9.1 Add JSDoc comments to all new functions
- [x] 9.2 Document confidence score calculation in code comments
- [x] 9.3 Add example response payload in `docs/ruvector/memory-search-response.md`
- [x] 9.4 Update architecture doc if needed (reference this story's design)

### **Task 10: Regression Tests**

- [x] 10.1 Run existing test suite (`npm test`)
- [x] 10.2 Verify no regressions in Stories 1-5 through 2-3 tests
- [x] 10.3 Check code coverage (target: >90% statements, >85% branches)
- [x] 10.4 Run E2E agent scenario (save → search → receive enriched response)

---

## Dev Notes

### Code Patterns to Follow

1. **Response Formatting**: Centralize in dedicated formatter module to prevent response payload bugs. Reusable for future tools.
2. **Confidence Calculation**: Isolated function for easy testing and future tuning (e.g., adjust weights based on feedback)
3. **Nullable Metadata**: Use optional chaining or nullish coalescing to handle missing fields gracefully
4. **Timestamp Consistency**: Always return ISO-8601 strings in responses; convert internal numeric timestamps at boundary

### Integration Points

- VectorStoreAdapter returns full Memory objects ✅ (assumes previous stories completed)
- Agent receives SearchResult[] in tool response ✅ (tool response is JSON-serializable)
- No external APIs or dependencies (all local) ✅

### Performance Considerations

- Confidence calculation is O(1) per memory; negligible overhead
- Response formatting is O(n) where n = result count (typically ≤5 in MVP)
- No additional network calls or database queries

### Testing Strategy

- **Unit tests**: Confidence calculator, formatter, isolated field validation
- **Integration tests**: Full save → search → response flow
- **Regression tests**: Ensure no changes to existing memory operations

### Common Pitfalls to Avoid

1. ❌ Don't filter out low-confidence results at response layer (agent needs full visibility)
2. ❌ Don't silently drop missing metadata fields (use defaults, add logging)
3. ❌ Don't change the composite relevance score calculation (preserve Story 2.2 logic)
4. ❌ Don't assume timestamps are always ISO-8601 strings (convert internally if needed)
5. ❌ Don't forget to include response metadata (`_meta`) for traceability

---

## Project Structure Notes

### Files to Modify

| File | Change | Scope |
|------|--------|-------|
| `src/shared/types.ts` | Add/verify SearchResult interface | ~20 lines |
| `src/vector/vector-store.ts` | Ensure search() returns Memory objects | ~10 lines comment/doc |
| `src/tools/tools/memory-search-tool.ts` | Integrate formatter | ~15 lines |

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `src/vector/confidence-calculator.ts` | Confidence calculation | ~40 |
| `src/tools/memory-response-formatter.ts` | Response formatting | ~80 |
| `tests/unit/vector/confidence-calculator.test.ts` | Confidence tests | ~100 |
| `tests/unit/tools/memory-response-formatter.test.ts` | Formatter tests | ~150 |
| `tests/integration/search-response.test.ts` | E2E response tests | ~120 |

### Alignment with Unified Project Structure

This story maintains the existing module structure:
- `src/vector/*` for vector/memory concerns
- `src/tools/*` for tool integration
- `src/shared/*` for common types
- `tests/unit/*` and `tests/integration/*` for testing

No structural changes required; all work within existing boundaries.

---

## References

### Architecture & Design Reference

- **Data Model**: [Architecture — Memory Schema Definition](../planning-artifacts/architecture.md#memory-schema-definition)
- **Composite Ranking**: [Story 2.2 — Relevance Scoring with Composite Signals](2-2-relevance-scoring-with-composite-signals.md)
- **Tool Integration**: [Story 1.4 — Automatic Registration of Memory Tools](1-4-automatic-registration-of-memory-tools.md)
- **Search Filters**: [Story 2.3 — Search Filters by Metadata and Time Range](2-3-search-filters-by-metadata-and-time-range.md)

### TypeScript & Node.js Best Practices

- **Strict Typing**: Use TypeScript interfaces with explicit field types (no `any`)
- **JSDoc Comments**: Document all public functions and interfaces
- **Error Handling**: Catch errors at boundaries; return structured error responses (not throw)
- **Testing**: Unit tests for logic, integration tests for data flow, regression tests for existing behavior

### Related Stories in Epic 2

| Story | Description | Status |
|-------|-------------|--------|
| 2.1 | Standard Metadata in Memory Save | ✅ Done |
| 2.2 | Relevance Scoring with Composite Signals | ✅ Done |
| 2.3 | Search Filters by Metadata and Time Range | ✅ Done |
| 2.4 | **Enriched Response with Source Context** | 📝 This Story |
| 2.5 | Passive Injection of Top Memories into Agent Context | ⏸️ Backlog |
| 2.6 | Stack Detection and Project Metadata Enrichment | ⏸️ Backlog |

---

## Dev Agent Record

### Agent Model Used

*Agent: GitHub Copilot (Claude Sonnet 4.6) — Implementation completed 2026-03-11*

### Debug Log References

*Will be filled in during implementation*

### Completion Notes List

#### Pre-Implementation Checklist

- [x] Read this entire story document
- [x] Read previous stories 2.1–2.3 to understand context
- [x] Review architecture document (data model, tool integration patterns)
- [x] Check existing test patterns in `tests/unit/tools/` and `tests/integration/`
- [x] Verify VectorStoreAdapter actually returns full Memory objects

#### Draft Implementation Checklist

- [x] Types added/verified
- [x] Confidence calculator implemented & tested
- [x] Response formatter implemented & tested
- [x] memory-search-tool.ts refactored to use formatter
- [x] All 10 tasks completed

#### Pre-Merge Checklist

- [x] Run `npm test` — all tests passing
- [x] Coverage >90% statements, >85% branches
- [x] No regressions in existing stories
- [x] Code review complete
- [x] Documentation updated (JSDoc, architecture refs)

### File List

**Created:**
- `src/vector/confidence-calculator.ts`
- `src/tools/memory-response-formatter.ts`
- `tests/unit/vector/confidence-calculator.test.ts`
- `tests/unit/tools/memory-response-formatter.test.ts`
- `tests/integration/search-response.test.ts`

**Modified:**
- `src/shared/types.ts`
- `src/vector/vector-store.ts`
- `src/tools/tools/memory-search-tool.ts`

**Documentation:**
- `docs/ruvector/memory-search-response.md` (new, example responses)

---

## Definition of Done Checklist

- [ ] Story 2.4 task list (all 10 tasks) completed
- [ ] All acceptance criteria verified with tests
- [ ] Code follows project patterns (TypeScript, testing, structure)
- [ ] Test coverage >90% statements, >85% branches
- [ ] No regressions in Stories 1.1–2.3
- [ ] JSDoc comments added to all public APIs
- [x] Code review approved (clean code, no issues)
- [x] Sprint status updated to `done` in `sprint-status.yaml`

---

**End of Story 2.4**
