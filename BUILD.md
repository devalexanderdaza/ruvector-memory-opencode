# Build and Installation

## Requirements

- Node.js >=22.0.0
- npm >=10

## Install

```bash
npm install @ruvector/opencode-memory
```

## Development Setup

```bash
npm install
```

## Scripts

- `npm run build`: Build ESM output and declaration files to `dist/`
- `npm run test`: Run unit and integration tests with coverage
- `npm run test:watch`: Run Vitest in watch mode
- `npm run lint`: Run Biome checks
- `npm run format`: Format repository files with Biome
- `npm run typecheck`: Run strict TypeScript checks
- `npm run prepack`: Validate lint, types, tests, and build before publish

## OpenCode Plugin Integration

This plugin auto-registers with OpenCode via the plugin manifest pattern:

- **Entry point**: `src/plugin-manifest.ts` exports a plugin descriptor with `name`, `activate`, and `deactivate` methods.
- **Activation**: OpenCode discovers the plugin through package.json `main` field and calls `activate()` automatically on agent session start.
- **No manual setup**: Users don't need to import or configure anything - installation via npm is sufficient.

For plugin lifecycle hooks, see `src/core/plugin.ts` (activation) and `src/core/lifecycle.ts` (deactivation).

## Zero-Configuration Defaults

If `.opencode/ruvector_memory_config.yaml` does not exist, plugin defaults are used:

- `db_path`: `.opencode/ruvector-memory.db`
- `cache_size`: `512`
- `log_level`: `info`
- `preload_top_memories`: `5`

Config priority order:

1. Explicit config file values
2. Environment variables (`RUVECTOR_MEMORY_*`)
3. Built-in defaults
