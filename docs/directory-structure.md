# Directory Structure and Import Policy

This document defines the responsibility boundaries and import rules for the bunterm codebase.

## Directory Structure

```
src/
├── index.ts              # CLI entry point
├── version.ts            # Version info (auto-generated)
├── core/                 # Core system (no feature dependencies)
├── features/             # Feature modules (may depend on core)
├── browser/              # Browser-side code
└── utils/                # Shared utilities
```

## Module Boundaries

### core/ - Core System

**Responsibility**: Foundational infrastructure that features depend on.

| Directory | Purpose |
|-----------|---------|
| `core/cli/` | CLI framework (commands, helpers, services) |
| `core/config/` | Configuration management |
| `core/client/` | CLI ↔ daemon communication |
| `core/daemon/` | Daemon entry point |
| `core/server/` | HTTP/WebSocket server |
| `core/terminal/` | PTY session management |
| `core/protocol/` | Message types and helpers |

**Rules**:
- core/ modules must NOT import from features/
- core/ modules may import from utils/
- core/ modules may import from other core/ modules

### features/ - Feature Modules

**Responsibility**: Self-contained functionality that extends core capabilities.

| Feature | Purpose |
|---------|---------|
| `features/ai/` | AI integration (Claude, Gemini, Codex) |
| `features/blocks/` | Block UI (Warp-style commands) |
| `features/claude-watcher/` | Claude Code session monitoring |
| `features/file-watcher/` | File system watching |
| `features/file-transfer/` | Upload/download |
| `features/notifications/` | Push notifications |
| `features/preview/` | HTML preview |
| `features/share/` | Read-only session sharing |

**Rules**:
- features/ may import from core/
- features/ may import from utils/
- features/ should NOT import from other features/ (avoid cross-dependencies)
- Each feature should have server/ and/or client/ subdirectories

### browser/ - Browser Code

**Responsibility**: Client-side code that runs in the browser.

| Directory | Purpose |
|-----------|---------|
| `browser/terminal/` | xterm.js integration |
| `browser/toolbar/` | Toolbar UI components |
| `browser/shared/` | Shared utilities (lifecycle, events) |

**Rules**:
- browser/ must NOT import from core/ or features/ server code
- browser/ may import from core/protocol/ (shared types)
- browser/ code is bundled separately

### utils/ - Shared Utilities

**Responsibility**: Pure utilities with no business logic.

| File | Purpose |
|------|---------|
| `errors.ts` | Error types |
| `logger.ts` | Logging |
| `jsonl.ts` | JSONL parsing |
| `git-service.ts` | Git operations |
| `markdown-scanner.ts` | File discovery |
| `path-security.ts` | Path validation |
| `process-runner.ts` | Process execution (DI) |
| `socket-client.ts` | Socket connections (DI) |
| `tmux-client.ts` | tmux operations (DI) |

**Rules**:
- utils/ must NOT import from core/ or features/
- utils/ modules should be stateless and side-effect free
- DI interfaces go here for testability

## Import Alias

Use `@/` to reference `src/`:

```typescript
// Good
import { loadConfig } from '@/core/config/config.js';
import { CliError } from '@/utils/errors.js';

// Bad - relative paths crossing module boundaries
import { loadConfig } from '../../core/config/config.js';
```

**When to use relative imports**:
- Within the same directory or immediate subdirectories
- For test files importing the module under test

## New File Placement Guide

| File Type | Location | Example |
|-----------|----------|---------|
| New CLI command | `core/cli/commands/` | `core/cli/commands/foo.ts` |
| CLI helper | `core/cli/helpers/` | `core/cli/helpers/bar.ts` |
| CLI service | `core/cli/services/` | `core/cli/services/baz-service.ts` |
| New feature | `features/<name>/server/` | `features/search/server/` |
| Browser feature | `features/<name>/client/` | `features/search/client/` |
| Shared utility | `utils/` | `utils/cache.ts` |
| Browser utility | `browser/shared/` | `browser/shared/debounce.ts` |
| Types for protocol | `core/protocol/` | `core/protocol/search.ts` |

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Service file | `*-service.ts` | `doctor-service.ts` |
| Helper file | `*-helper.ts` or descriptive | `url-builder.ts` |
| Test file | `*.test.ts` | `config.test.ts` |
| Type file | `types.ts` | `types.ts` |
| Index re-export | `index.ts` | `index.ts` |

## Dependency Injection

For testability, external dependencies are abstracted:

```typescript
// In utils/
export interface ProcessRunner {
  spawn(...): ChildProcess;
}

// In service
function myService(runner: ProcessRunner = defaultRunner) {
  // Use runner
}
```

See `docs/adr/009-dependency-injection-for-testability.md` for details.
