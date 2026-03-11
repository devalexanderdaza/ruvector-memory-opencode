# Story 2.1: Standard Metadata in Memory Save

Status: done

<!-- Generated following BMAD Phase 4:
     - bmad-create-story
     - bmad-dev-story
     - artifact reconciliation after validation
-->

## Story

As a developer,
I want to attach useful metadata (tags, source, priority) when saving memory,
So that retrieval becomes more precise and traceable.

## Acceptance Criteria

**Given** a `memory_save` request with optional metadata
**When** memory is persisted
**Then** tags, source, and priority are stored consistently
**And** if metadata is not provided, valid default values are applied

## Functional Requirements Implemented

- **FR3:** Optional metadata tags (`tags`, `source`, `priority`) for organization and traceability.

## Tasks / Subtasks

- [x] Task 1: Extend memory save input model
  - [x] 1.1 Add typed metadata fields to save input contract
  - [x] 1.2 Keep compatibility with string input and object input

- [x] Task 2: Implement metadata normalization in tool layer
  - [x] 2.1 Persist defaults when metadata is absent (`tags=[]`, `source=unknown`, `priority=normal`)
  - [x] 2.2 Validate and sanitize provided metadata

- [x] Task 3: Verify persisted metadata through search responses
  - [x] 3.1 Assert default metadata path
  - [x] 3.2 Assert explicit metadata path

## Evidence

- Code:
  - `src/shared/types.ts`
  - `src/tools/tools/memory-save-tool.ts`
- Tests:
  - `tests/unit/tools/memory-save-tool.test.ts`
- Validation:
  - `npm test` passing with coverage thresholds met

## Definition of Done Checklist

- [x] Metadata defaults are applied when absent.
- [x] Metadata fields are preserved when provided.
- [x] Tool contract remains structured and non-throwing.
- [x] Tests validate both default and explicit metadata behavior.
