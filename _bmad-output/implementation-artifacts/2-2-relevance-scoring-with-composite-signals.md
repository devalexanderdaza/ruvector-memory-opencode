# Story 2.2: Relevance Scoring with Composite Signals

Status: done

<!-- Generated following BMAD Phase 4:
     - bmad-create-story (reconciled)
     - bmad-dev-story
     - pending explicit bmad-code-review command run
-->

## Story

As an agent user,
I want results to use a combined score (similarity, confidence, recency),
So that the most useful context appears first.

## Acceptance Criteria

**Given** multiple candidate memories for a query
**When** I run `memory_search`
**Then** results are ordered by a documented composite score
**And** the score is deterministic for equivalent inputs

## Functional Requirements Implemented

- **FR5:** Confidence signal included in ranking via metadata (`confidence` in [0, 1], default 0.5).
- **FR8:** Deterministic composite ranking built from similarity base score + confidence and recency adjustments.

## Tasks / Subtasks

- [x] Task 1: Implement composite scoring model
  - [x] 1.1 Keep similarity score as deterministic base
  - [x] 1.2 Add confidence contribution with bounded normalization
  - [x] 1.3 Add recency contribution based on `created_at`

- [x] Task 2: Preserve deterministic ordering semantics
  - [x] 2.1 Keep lower composite distance as better
  - [x] 2.2 Sort explicitly by composite score

- [x] Task 3: Add test evidence for composite signals
  - [x] 3.1 Unit test for priority influence (existing metadata signal)
  - [x] 3.2 Unit test for confidence influence
  - [x] 3.3 Integration test confirms ranked retrieval behavior

## Evidence

- Code:
  - `src/vector/vector-store.ts`
  - `src/tools/tools/memory-save-tool.ts`
- Tests:
  - `tests/unit/vector/save-search.test.ts`
  - `tests/integration/save-search.test.ts`
  - `tests/unit/tools/memory-save-tool.test.ts`
- Validation:
  - `npm test` passing with coverage thresholds met

## Code Review Notes (bmad-code-review)

### Findings & Resolutions

**🔴 H1 — DoS via unbounded `limit` (FIXED)**
`parseQueryAndLimit` lacked a cap. Added `MAX_SEARCH_LIMIT = 100` constant in
`memory-search-tool.ts`; `limit` is now clamped to `[1, 100]` before hitting
HNSW. New test: `caps limit at MAX_SEARCH_LIMIT to prevent resource exhaustion`.

**🔴 H2 — Magic numbers in scoring formula (FIXED)**
Weights `0.05`, `-0.02`, `0.02`, `0.01`, `0.04` extracted as named module-level
constants with JSDoc in `vector-store.ts`:
`PRIORITY_BOOST_CRITICAL`, `PRIORITY_PENALTY_LOW`, `RECENCY_BOOST_DAY`,
`RECENCY_BOOST_WEEK`, `CONFIDENCE_SCALE`.

**🟡 M1 — Missing confidence boundary tests (FIXED)**
Added test `clamps confidence values outside [0, 1] to valid range` in
`tests/unit/vector/save-search.test.ts`.

**🟡 M2 — Architecture divergence: user-supplied confidence vs feedback-driven**
Architecture ADR defines `feedbackScore` as a computed signal (Epic 3).
For MVP, `confidence` is accepted as direct user input. Intentional shortcut;
full feedback-driven confidence is scoped to Epic 3 story 3.2.

### Outcome

- **Status:** Approved
- **High issues fixed:** 2
- **Medium issues fixed:** 1
- **Action items created:** 1 (M2 — Epic 3 scope)

## Definition of Done Checklist

- [x] Composite score is documented and implemented as named constants.
- [x] Similarity + confidence + recency are all represented in ranking behavior.
- [x] Ordering is deterministic for equivalent inputs (same DB state, same time).
- [x] Automated tests cover composite ranking for priority and confidence.
- [x] Confidence boundary clamping is tested.
- [x] `limit` resource-exhaustion vector is capped and tested.
- [x] Code review complete — all HIGH and MEDIUM issues resolved.
- [x] Sprint status synced to `done`.
