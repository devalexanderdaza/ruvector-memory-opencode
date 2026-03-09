# @ruvector/opencode-memory

Local-first memory plugin for OpenCode with automatic activation and Node.js runtime guards.

## Quick Start

```bash
npm install @ruvector/opencode-memory
```

On the next OpenCode session, the plugin can activate automatically using default settings (no manual bootstrap).

## Node.js Compatibility

This package requires Node.js >=22.0.0.

If an older version is used, activation returns an actionable message:

`ruvector-memory requires Node.js >=22.0.0. Current: {version}. Please upgrade: https://nodejs.org`

## Public API

```ts
import { activatePlugin, deactivatePlugin } from "@ruvector/opencode-memory";
```

## Configuration

Optional configuration file path:

- `.opencode/ruvector_memory_config.yaml`

Example:

```yaml
db_path: .opencode/custom.db
cache_size: 1024
log_level: debug
preload_top_memories: 8
```

See `BUILD.md` for scripts and contributor workflow.
