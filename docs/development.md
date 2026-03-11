# Development Guide

This guide covers how to set up the development environment, build, test, lint, and contribute to `@ruvector/opencode-memory`.

---

## Prerequisites

| Tool | Version |
|---|---|
| **Node.js** | >= 22.0.0 |
| **npm** | >= 10 |
| **Git** | any |

---

## Setup

```bash
# Clone the repository
git clone https://github.com/devalexanderdaza/ruvector-memory-opencode.git
cd ruvector-memory-opencode

# Install all dependencies (including dev)
npm install
```

---

## Project Structure

```
ruvector-memory-opencode/
├── src/                     # TypeScript source code
│   ├── index.ts             # Public API entry point
│   ├── plugin-manifest.ts   # OpenCode plugin descriptor
│   ├── core/                # Plugin lifecycle
│   ├── config/              # Configuration pipeline
│   ├── detection/           # Project context detection
│   ├── tools/               # Memory tools
│   ├── vector/              # Vector store adapter
│   └── shared/              # Types, errors, logger, utils
├── tests/
│   ├── unit/                # Unit tests (mirrors src/ structure)
│   └── integration/         # Integration tests
├── dist/                    # Build output (ESM, .d.ts files)
├── docs/                    # Documentation
├── package.json
├── tsconfig.json            # TypeScript strict mode
├── tsup.config.ts           # Build configuration (ESM)
├── vitest.config.ts         # Test runner configuration
└── biome.json               # Linter and formatter
```

---

## Available Scripts

| Script | Command | Description |
|---|---|---|
| **Build** | `npm run build` | Compile TypeScript → `dist/` (ESM + declaration files) |
| **Test** | `npm test` | Run all tests with coverage report |
| **Test Watch** | `npm run test:watch` | Vitest in watch mode (re-runs on save) |
| **Lint** | `npm run lint` | Biome checks (linting + format check) |
| **Format** | `npm run format` | Auto-format all files with Biome |
| **Type Check** | `npm run typecheck` | TypeScript strict type validation (no emit) |
| **Pre-publish** | `npm run prepack` | Full validation: lint + typecheck + test + build |

---

## Building

```bash
npm run build
```

Output goes to `dist/`:
- `dist/index.js` — ESM bundle
- `dist/index.d.ts` — TypeScript declarations
- `dist/*.js.map` — Source maps

**Build tool:** [tsup](https://tsup.egoist.dev/) — wraps esbuild for fast bundling with declaration generation.

**Config:** `tsup.config.ts`

```typescript
{
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  target: "node22",
}
```

---

## Testing

```bash
# Run all tests with coverage
npm test

# Run in watch mode (development)
npm run test:watch

# Run a specific test file
npx vitest run tests/unit/core/plugin.test.ts

# Run tests matching a pattern
npx vitest run --grep "activatePlugin"
```

**Test framework:** [Vitest](https://vitest.dev/) with v8 coverage provider.

**Config:** `vitest.config.ts`

### Coverage Thresholds

The repository enforces these minimums:

| Metric | Threshold |
|---|---|
| Lines | 90% |
| Statements | 90% |
| Functions | 90% |
| Branches | 85% |

If coverage drops below these thresholds, `npm test` fails.

### Test Structure

Tests mirror the `src/` directory structure:

```
tests/
├── unit/
│   ├── config/
│   │   ├── defaults.test.ts
│   │   └── env-loader.test.ts
│   ├── core/
│   │   ├── plugin.test.ts
│   │   └── lifecycle.test.ts
│   ├── detection/
│   │   └── project-detector.test.ts
│   ├── shared/
│   │   ├── logger.test.ts
│   │   └── token-counter.test.ts
│   ├── tools/
│   │   ├── memory-save-tool.test.ts
│   │   ├── memory-search-tool.test.ts
│   │   ├── memory-context-injector.test.ts
│   │   ├── memory-response-formatter.test.ts
│   │   ├── tool-injector.test.ts
│   │   └── tool-error-handling.test.ts
│   ├── vector/
│   │   ├── vector-store.test.ts
│   │   ├── initialization.test.ts
│   │   ├── confidence-calculator.test.ts
│   │   ├── metadata-parsing.test.ts
│   │   └── save-search.test.ts
│   └── public-api.test.ts
└── integration/
    └── plugin-activation.test.ts
```

### Writing Tests

Follow the existing test patterns:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetPluginStateForTests } from "../../src/core/plugin.js";

describe("MyModule", () => {
  beforeEach(() => {
    resetPluginStateForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should do something", async () => {
    // Arrange
    const input = { content: "test memory" };

    // Act
    const result = await memory_save(input);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
```

---

## Linting and Formatting

**Tool:** [Biome](https://biomejs.dev/) — fast linter + formatter in one tool.

```bash
# Check for lint errors and format issues
npm run lint

# Auto-fix formatting
npm run format
```

**Config:** `biome.json`

Biome is configured to check:
- `src/` — all TypeScript source files
- `tests/` — all test files
- `*.json`, `*.ts` config files
- `BUILD.md`, `README.md`

### Key Rules

- No unused variables
- No explicit `any` (use `unknown` and type guards)
- Consistent import ordering
- 2-space indentation
- Single quotes for strings
- Trailing commas in multi-line expressions
- No semicolons (Biome default for TypeScript)

---

## TypeScript Configuration

**Config:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "."
  }
}
```

Key strictness settings:
- `strict: true` — enables all strict mode checks
- `noUncheckedIndexedAccess: true` — array index access returns `T | undefined`
- `exactOptionalPropertyTypes: true` — optional props must be explicitly undefined

```bash
# Run type check only (no build output)
npm run typecheck
```

---

## Code Organization Principles

### 1. Module Boundaries

Each subdirectory in `src/` has a clear responsibility:

| Module | Responsibility | Should NOT |
|---|---|---|
| `core/` | Lifecycle, state | Access vector DB directly |
| `config/` | Load and validate config | Know about tools or vector |
| `detection/` | Detect project context | Know about memories |
| `tools/` | OpenCode tool definitions | Manage DB initialization |
| `vector/` | Vector DB operations | Know about tools |
| `shared/` | Cross-cutting utilities | Have business logic |

### 2. Error Handling

- All tool functions return `ToolResponse<T>` — never throw
- Use custom error classes from `shared/errors.ts` for internal errors
- Background tasks catch all errors and set `isDegraded = true`

### 3. Types

All types are defined in `shared/types.ts`. This is the single source of truth.

- Export types from `shared/types.ts`
- Import types using `import type {}` syntax
- Never define types locally in implementation files

### 4. Logging

Use the structured logger from `shared/logger.ts`:

```typescript
import { logger } from "../shared/logger.js";

logger.info("operation_name", { key: "value", count: 42 });
logger.warn("something_unusual", { detail: "..." });
logger.error("operation_failed", { error: "message" });
```

Log event names use `snake_case`.

---

## Adding a New Memory Tool

1. Create the tool factory in `src/tools/tools/my-tool.ts`:

```typescript
import type { ToolResponse } from "../../shared/types.js";

export function createMyTool(): (input?: unknown) => Promise<ToolResponse<MyResult>> {
  return async function my_tool(input?: unknown): Promise<ToolResponse<MyResult>> {
    // 1. Validate input
    // 2. Initialize vector store if needed
    // 3. Call vector store or other services
    // 4. Return ToolResponse
  };
}
```

2. Register the tool in `src/tools/tool-injector.ts`:

```typescript
import { createMyTool } from "./tools/my-tool.js";

export function injectTools(context: PluginActivationContext): void {
  // ... existing tools ...
  registry.register("my_tool", createMyTool());
}
```

3. Add types to `src/shared/types.ts`
4. Write tests in `tests/unit/tools/my-tool.test.ts`

---

## Pre-Publish Checklist

Before publishing a new version, run:

```bash
npm run prepack
```

This runs in order:
1. `npm run lint` — no lint errors
2. `npm run typecheck` — no type errors
3. `npm run test` — all tests pass, coverage thresholds met
4. `npm run build` — successful build

All steps must pass for `npm publish` to proceed.

---

## Versioning

The package follows [Semantic Versioning](https://semver.org/):

- **Patch** (0.2.x): Bug fixes, no API changes
- **Minor** (0.x.0): New features, backward compatible
- **Major** (x.0.0): Breaking API changes

---

## Dependencies Policy

- **Production dependencies**: Kept minimal. Currently only `zod`.
- **Peer dependencies**: `@ruvector/core` is optional — plugin works without it.
- **Dev dependencies**: Tools only (biome, tsup, vitest, typescript).

Before adding a new dependency:
1. Check if it can be implemented with < 50 lines of code
2. Check the GitHub advisory database for vulnerabilities
3. Prefer zero-dependency or minimal packages
