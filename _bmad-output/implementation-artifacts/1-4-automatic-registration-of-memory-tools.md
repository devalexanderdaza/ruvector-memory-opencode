# Story 1.4: Automatic Registration of Memory Tools

Status: done

<!-- Generated following BMAD Phase 4:
     - bmad-create-story
     - bmad-dev-story
     - bmad-code-review
-->

## Story

As an agent integrator,  
I want memory tools to register automatically in the agent context,  
So that agents can use them without boilerplate.

## Acceptance Criteria

**Given** an active plugin in a valid project  
**When** an agent session starts  
**Then** `memory_save`, `memory_search`, and `memory_learn_from_feedback` are registered automatically  
**And** registration requires no imports or additional initialization code

## Functional Requirements Implemented

- **FR31:** Plugin auto-registers memory tools with OpenCode agent context on initialization
- **FR32:** `memory_save()`, `memory_search()`, and `memory_learn_from_feedback()` are available as tools
- **FR33:** Zero boilerplate required

## Tasks / Subtasks

- [x] Task 1: Create tools subsystem scaffolding (AC: tool availability)
  - [x] 1.1: Add `src/tools/tool-injector.ts` with a minimal registry interface
  - [x] 1.2: Add `src/tools/index.ts` to expose `injectTools`
  - [x] 1.3: Add tool handler factories for the three tools (stub responses allowed)

- [x] Task 2: Wire tool registration into plugin activation (AC: auto-registration)
  - [x] 2.1: Extend `PluginActivationContext` to accept an optional `toolRegistry`
  - [x] 2.2: Call `injectTools(context)` during `activatePlugin()` synchronous phase
  - [x] 2.3: Ensure missing registry does not break activation (log + skip)

- [x] Task 3: Tests + quality gates (AC: verified)
  - [x] 3.1: Unit test: registry present → tools registered with correct names
  - [x] 3.2: Unit test: registry missing → registration skipped
  - [x] 3.3: Unit test: handlers return structured `ToolResponse` stubs
  - [x] 3.4: Run full `npm test` to satisfy global coverage thresholds

## Implementation Notes (bmad-dev-story)

### Key Files

- `src/tools/tool-injector.ts`: registers tools against an injected registry
- `src/tools/tools/*`: tool handler factories for `memory_save`, `memory_search`, and `memory_learn_from_feedback`
- `src/core/plugin.ts`: calls `injectTools(context)` during activation
- `tests/unit/tools/tool-injector.test.ts`: validates registration and handler shape

### Tool registration (snake_case names)

```28:42:/home/devalexanderdaza/Laboratory/GitHub/devalexanderdaza/ruvector-memory-opencode/src/tools/tool-injector.ts
  registry.registerTool("memory_save", createMemorySaveTool());
  registry.registerTool("memory_search", createMemorySearchTool());
  registry.registerTool("memory_learn_from_feedback", createMemoryLearnTool());
```

### Activation wiring

```61:73:/home/devalexanderdaza/Laboratory/GitHub/devalexanderdaza/ruvector-memory-opencode/src/core/plugin.ts
    // Register OpenCode tools synchronously (stubs allowed); never blocks activation.
    injectTools(context);
```

### Default handler behavior (until Story 1.5)

Handlers are intentionally registered even before full implementation; they return a structured stub response:

```3:14:/home/devalexanderdaza/Laboratory/GitHub/devalexanderdaza/ruvector-memory-opencode/src/tools/tools/memory-save-tool.ts
export function createMemorySaveTool(): (input?: unknown) => Promise<ToolResponse<unknown>> {
  return async function memory_save(): Promise<ToolResponse<unknown>> {
    return {
      success: false,
      error: "memory_save is registered but not implemented yet",
      code: "ENOTIMPLEMENTED",
      reason: "tool-not-implemented",
    };
  };
}
```

### Tests Executed

- `npm test` (full suite + coverage thresholds): **PASS**
- Unit tests added:
  - `tests/unit/tools/tool-injector.test.ts`

## Code Review Notes (bmad-code-review)

### Findings

- Tool names follow the architecture’s requirement: **snake_case** for agent tools.
- Registration is **non-blocking**: missing registry does not cause activation failure.
- Handler stubs return unified `ToolResponse` shape and do not throw.
- Tests cover both registration and handler execution, keeping global coverage thresholds passing.

### Outcome

- **Status:** Approved
- **Requested changes:** None

## Definition of Done Checklist

- [x] Tools are registered automatically when a registry is provided.
- [x] Registration does not require imports/boilerplate at call sites.
- [x] Missing tool registry does not break activation.
- [x] Unit tests cover registry + handler behavior.
- [x] Full test suite passes with coverage thresholds.
