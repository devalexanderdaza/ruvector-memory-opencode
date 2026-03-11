# Story 2.3: Search Filters by Metadata and Time Range

Status: ready-for-dev

<!-- Generated following BMAD Phase 4 — create-story -->

## Story

As a developer,
I want to filter searches by tags, content type, and dates,
So that I can narrow results to a specific operational context.

## Acceptance Criteria

**Given** a query with metadata and date filters
**When** `memory_search` is processed
**Then** only results matching all filters are returned
**And** invalid filters return a structured and actionable error

## Functional Requirements Implemented

- **FR9:** System filters results by optional metadata (content_type / source, tags, date range).

## Architecture Notes

- `@ruvector/core` VectorDb HNSW does not support predicate pushdown — filters must
  be applied **client-side** on the items returned from the HNSW k-NN call.
- Over-fetch strategy: search for `limit * FILTER_OVERSAMPLE_FACTOR` candidates from
  HNSW, apply filters, then return the top `limit` matching items.
  `FILTER_OVERSAMPLE_FACTOR` defaults to 5 (configurable constant); this avoids
  returning fewer items than requested in most cases while keeping resource use bounded.
- Date filters accept ISO-8601 strings (`"2025-01-01"`) or epoch-milliseconds numbers;
  invalid date strings must produce a structured error (not a silent empty result).
- All filters are additive (AND semantics): a result must satisfy every supplied filter.
- `tags` filter uses OR semantics: an item matches if it has **any** of the supplied tags.

## Tasks / Subtasks

- [ ] Task 1: Extend `MemorySearchFilters` type in `src/shared/types.ts`
  - [ ] 1.1 Add `export interface MemorySearchFilters` with:
    - `tags?: string[]` — include items that have any of these tags (OR)
    - `source?: string` — exact match on the `source` metadata field
    - `created_after?: string | number` — items created strictly after this date/epoch
    - `created_before?: string | number` — items created strictly before this date/epoch
  - [ ] 1.2 Add optional `filters?: MemorySearchFilters` to any search input helper (or document
    usage inline; `memory_search` already accepts an object input schema)

- [ ] Task 2: Extend `parseQueryAndLimit` → `parseSearchInput` in `memory-search-tool.ts`
  - [ ] 2.1 Rename / expand function to extract `filters` from object inputs alongside
    `query` and `limit`
  - [ ] 2.2 Validate date fields: reject non-parseable date strings with `EINVALID` error
  - [ ] 2.3 Reject `created_after >= created_before` (inverted range) with `EINVALID` error
  - [ ] 2.4 Pass validated `filters` through to `store.search(query, limit, filters)`

- [ ] Task 3: Implement client-side filter application in `VectorStoreAdapter`
  in `src/vector/vector-store.ts`
  - [ ] 3.1 Add `FILTER_OVERSAMPLE_FACTOR = 5` constant
  - [ ] 3.2 Over-fetch `limit * FILTER_OVERSAMPLE_FACTOR` candidates from HNSW
    when any filter is active
  - [ ] 3.3 Implement `applyFilters(items, filters)` helper:
    - Filter by `tags` (OR match against item's `metadata.tags` array)
    - Filter by `source` (exact string equality against `metadata.source`)
    - Filter by `created_after` (item's `metadata.created_at` epoch > filter date epoch)
    - Filter by `created_before` (item's `metadata.created_at` epoch < filter date epoch)
  - [ ] 3.4 Slice to top `limit` items after filtering and re-ranking (preserve composite sort)

- [ ] Task 4: Input validation error contracts
  - [ ] 4.1 Invalid date string → `{ success: false, error: "...", code: "EINVALID", reason: "validation" }`
  - [ ] 4.2 Inverted date range → same error shape, message names both fields
  - [ ] 4.3 `tags: []` (empty array) → treat as "no tag filter" (pass-through)

- [ ] Task 5: Tests
  - [ ] 5.1 Unit test: `applyFilters` with `tags` filter — returns only items with matching tag
  - [ ] 5.2 Unit test: `applyFilters` with `source` filter — exact match only
  - [ ] 5.3 Unit test: `applyFilters` with `created_after` / `created_before` date range
  - [ ] 5.4 Unit test: combined filters (AND semantics) — item must satisfy all
  - [ ] 5.5 Unit test: `parseSearchInput` rejects invalid date string with `EINVALID`
  - [ ] 5.6 Unit test: `parseSearchInput` rejects inverted date range with `EINVALID`
  - [ ] 5.7 Integration test: `memory_search` with `tags` filter returns only matching items
  - [ ] 5.8 Integration test: `memory_search` without filters is unaffected (regression)

## Evidence

> To be filled during implementation.

- Code:
  - `src/shared/types.ts` — `MemorySearchFilters` interface
  - `src/tools/tools/memory-search-tool.ts` — `parseSearchInput` with filter validation
  - `src/vector/vector-store.ts` — `FILTER_OVERSAMPLE_FACTOR`, `applyFilters`, updated `search()`
- Tests:
  - `tests/unit/vector/save-search.test.ts`
  - `tests/unit/tools/memory-search-tool.test.ts`
  - `tests/integration/save-search.test.ts`
- Validation:
  - `npm test` passing with coverage thresholds met

## Definition of Done Checklist

- [ ] `memory_search` with `tags` filter returns only matching results.
- [ ] `memory_search` with date range filters excludes out-of-range results.
- [ ] Invalid filter inputs (bad date, inverted range) return `{ success: false, code: "EINVALID" }`.
- [ ] No filter → behavior is identical to current (regression-safe).
- [ ] All new code paths covered by unit and integration tests.
- [ ] Code review complete.
- [ ] Sprint status synced to `done`.
