# Story 1.7: Package Manager Compatibility for Installation and CI

Status: done

<!-- Generated following BMAD Phase 4:
     - bmad-create-story
     - bmad-dev-story
     - bmad-code-review
-->

## Story

As a maintainer,  
I want installation and CI to work across common package managers,  
So that contributors and users can adopt the plugin easily.

## Acceptance Criteria

**Given** a clean checkout on CI  
**When** dependencies are installed with npm, pnpm, or yarn  
**Then** lint, typecheck, tests, and build succeed on Node.js >=22

## Functional Requirements Implemented

- **FR37:** Installation works via npm (already supported)
- **FR38:** Automatic activation behavior validated via tests (already supported)
- **FR44 (CI reliability):** CI runs consistently on Node 22
- **Package manager compatibility:** npm/pnpm/yarn installs succeed and run `npm test`

## Tasks / Subtasks

- [x] Task 1: Add CI workflow with package manager matrix
  - [x] 1.1: Create `.github/workflows/ci.yaml`
  - [x] 1.2: Matrix: Node 22.x × (npm, pnpm, yarn)
  - [x] 1.3: Run `lint`, `typecheck`, `test`, `build`

- [x] Task 2: Document installation with optional peer dependency
  - [x] 2.1: Update `README.md` with `@ruvector/core` installation guidance
  - [x] 2.2: Provide npm/pnpm/yarn install examples

- [x] Task 3: Validate locally
  - [x] 3.1: Run `npm test` with coverage thresholds

## Implementation Notes (bmad-dev-story)

### CI workflow

```1:49:/home/devalexanderdaza/Laboratory/GitHub/devalexanderdaza/ruvector-memory-opencode/.github/workflows/ci.yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:

jobs:
  test:
    name: Node ${{ matrix.node }} • ${{ matrix.pm }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: ["22.x"]
        pm: ["npm", "pnpm", "yarn"]
...
```

Notes:

- Uses `corepack enable` for pnpm/yarn.
- Uses non-lockfile-strict install flags to avoid requiring lockfiles for all managers.

### README update

`README.md` now documents installing the optional peer dependency (`@ruvector/core`) and shows npm/pnpm/yarn commands.

### Tests Executed

- `npm test` **PASS** with coverage thresholds.

## Code Review Notes (bmad-code-review)

### Findings

- Workflow validates the same scripts used by `prepack` (lint/typecheck/test/build).
- Matrix covers the three most common package managers without adding lockfile constraints.
- README makes the optional peer dependency explicit for full functionality.

### Outcome

- **Status:** Approved
- **Requested changes:** None

## Definition of Done Checklist

- [x] CI runs on Node 22 and exercises lint/typecheck/test/build.
- [x] CI supports npm, pnpm, and yarn installs.
- [x] README documents installing `@ruvector/core` for full local vector search.
- [x] Local test suite passes with coverage thresholds.
