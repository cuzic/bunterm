# Domain Models

This document defines the core domain models and their responsibilities.

## Model Categories

### 1. Configuration Models (Immutable after load)

These models represent configuration that is loaded once and rarely changes.

| Model | Source | Required Fields | Optional Fields |
|-------|--------|-----------------|-----------------|
| `Config` | config.yaml | base_path, daemon_port, listen_addresses | hostname, sessions |
| `TerminalUiConfig` | config.yaml | font_size_*, double_tap_delay | - |
| `NotificationConfig` | config.yaml | enabled, bell_notification | contact_email, patterns |
| `FileTransferConfig` | config.yaml | enabled, max_file_size | allowed_extensions |
| `SessionDefinition` | config.yaml | name, dir, path | - |

**Invariants**:
- All fields have defaults via Zod schemas
- After validation, no optional fields except explicitly optional ones
- hostname is optional (local development doesn't need it)

### 2. State Models (Mutable at runtime)

These models represent runtime state that changes during execution.

| Model | Persistence | Required Fields | Optional Fields |
|-------|-------------|-----------------|-----------------|
| `DaemonState` | state.json | pid, port, started_at | - |
| `SessionState` | state.json | name, pid, path, dir, started_at | - |
| `ShareState` | state.json | token, sessionName, createdAt, expiresAt | password |
| `PushSubscriptionState` | state.json | id, endpoint, keys, createdAt | sessionName |

**Invariants**:
- `daemon` in State may be null (daemon not running)
- All session fields are required when session exists
- password in ShareState is optional (public shares)

### 3. Response Models (API boundaries)

These models are returned from API endpoints.

| Model | Context | Required Fields | Optional Fields |
|-------|---------|-----------------|-----------------|
| `SessionResponse` | GET /api/sessions | name, port, path, fullPath, dir, pid, started_at | tmuxSession |
| `StatusResponse` | GET /api/status | daemon, sessions | - |
| `ErrorResponse` | Error responses | error | - |

**Invariants**:
- SessionResponse requires all fields for an active session
- tmuxSession is optional (tmux mode may be disabled)

### 4. Request Models (API input)

| Model | Context | Required Fields | Optional Fields |
|-------|---------|-----------------|-----------------|
| `StartSessionRequest` | POST /api/sessions | name, dir | path |

**Invariants**:
- path is optional; derived from name if not provided

## Model Lifecycle

### Session Lifecycle

```
[Not Exists] → start → [Running] → stop → [Not Exists]
                           ↓
                      [Attached to tmux]
```

- **Not Exists**: No SessionState, no process
- **Running**: SessionState exists, pid is active
- **Attached**: Running + tmuxSession is set

### Daemon Lifecycle

```
[Not Running] → start → [Running] → stop → [Not Running]
                             ↓
                        [Has Sessions]
```

- **Not Running**: DaemonState is null
- **Running**: DaemonState exists, pid is active
- **Has Sessions**: Running + sessions.length > 0

## Optional Field Policy

### Allowed Optional

| Field | Reason |
|-------|--------|
| `Config.hostname` | Local development doesn't use hostname |
| `ShareState.password` | Public shares don't need password |
| `SessionResponse.tmuxSession` | tmux may be disabled |
| `NotificationConfig.contact_email` | Optional feature |
| `PushSubscriptionState.sessionName` | Global subscriptions |

### Should NOT be Optional (Future Work)

| Field | Current | Should Be |
|-------|---------|-----------|
| `ResolvedSession.pid` | `pid?` | Always present when running |

## Validation Boundaries

### Boundary Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│                    External World                   │
│  (HTTP requests, config files, CLI args, env vars) │
└────────────────────────┬────────────────────────────┘
                         │ Raw types (unknown, string, etc.)
                         ▼
┌─────────────────────────────────────────────────────┐
│              Boundary Layer (Validation)            │
│  - Zod schemas                                      │
│  - Request parsers                                  │
│  - Config loaders                                   │
│  - Returns Result<DomainType, ValidationError>      │
└────────────────────────┬────────────────────────────┘
                         │ Domain types (validated, typed)
                         ▼
┌─────────────────────────────────────────────────────┐
│                   Domain Layer                      │
│  - Business logic                                   │
│  - No validation needed                             │
│  - Types are trusted                                │
└─────────────────────────────────────────────────────┘
```

### External → Internal

1. **config.yaml** → `Config`: Zod validation at load time
2. **state.json** → `State`: Zod validation at load time
3. **API requests** → Request models: Zod validation in routes

### Internal → External

1. **State** → **state.json**: Serialization via JSON.stringify
2. **Session** → **SessionResponse**: Transform in route handler
3. **Error** → **ErrorResponse**: Map via toHttpStatus()

### Validation + Conversion Pattern

```typescript
// 1. Define Raw type (external)
interface RawSessionRequest {
  name?: unknown;
  port?: unknown;
}

// 2. Define Domain type (internal)
interface SessionRequest {
  name: string;
  port: number;
}

// 3. Validation function returns Result
function parseSessionRequest(
  raw: RawSessionRequest
): Result<SessionRequest, ConfigValidationError> {
  if (typeof raw.name !== 'string' || !raw.name) {
    return err(configValidationFailed('name', 'must be non-empty string'));
  }
  if (typeof raw.port !== 'number' || !Number.isInteger(raw.port)) {
    return err(configValidationFailed('port', 'must be integer'));
  }

  return ok({
    name: raw.name,
    port: raw.port
  });
}

// 4. Use in route
async function handleCreateSession(req: Request): Promise<Response> {
  const raw = await req.json() as RawSessionRequest;
  const parsed = parseSessionRequest(raw);

  if (isErr(parsed)) {
    return resultResponse(parsed);  // 400 Bad Request
  }

  // Domain code can trust the types
  const session = await createSession(parsed.value);
  return jsonResponse(session, { status: 201 });
}
```

## Raw Types (Unsafe Boundary Types)

### Naming Convention

- Prefix with `Raw` for external input types
- These types allow `unknown`, `null`, and optional fields
- Must be validated before use in domain logic

```typescript
// Raw types for external data
interface RawConfig {
  base_path?: unknown;
  daemon_port?: unknown;
  sessions?: unknown[];
}

// Domain types are strict
interface Config {
  base_path: string;
  daemon_port: number;
  sessions: SessionDefinition[];
}
```

### File Organization

| Location | Type Category |
|----------|---------------|
| `types.ts` | Domain types (strict) |
| `raw-types.ts` or inline | Raw types (permissive) |
| `parsers.ts` | Raw → Domain conversion |

## Type Safety Recommendations

1. **Avoid `| null` in domain models** - Use discriminated unions
2. **Avoid `?` for required-when-present fields** - Split into state-specific types
3. **Validate at boundaries** - Internal code can trust types
4. **Use exhaustive switches** - Compiler catches missing cases

## Removing Optionals from Domain Types

### Before: Optional Fields

```typescript
// BAD: Optional fields make code defensive
interface Session {
  name: string;
  pid?: number;           // Maybe running?
  tmuxSession?: string;   // Maybe attached?
}

// Forces defensive code everywhere
if (session.pid) {
  // Is it running?
}
```

### After: Discriminated Unions

```typescript
// GOOD: State is explicit in the type
type Session =
  | { state: 'stopped'; name: string }
  | { state: 'running'; name: string; pid: number }
  | { state: 'attached'; name: string; pid: number; tmuxSession: string };

// No optionals - state determines available fields
switch (session.state) {
  case 'running':
    console.log(session.pid);  // TypeScript knows pid exists
    break;
}
```

### Guidelines

| Pattern | When to Use |
|---------|-------------|
| Optional (`?`) | External input before validation |
| Union | Internal domain state |
| Defaults | Config values with sensible fallbacks |

## null vs undefined Policy

### Use `undefined` for:

- Optional function parameters (`function foo(x?: string)`)
- Missing object properties (`interface X { y?: string }`)
- Values that haven't been set yet

### Use `null` for:

- Explicit absence in external data (JSON from API)
- Values deliberately set to empty
- DOM operations (consistent with browser APIs)

### Avoid Mixed Usage

```typescript
// BAD: Mixed null and undefined
interface Session {
  pid: number | null | undefined;  // Which one means what?
}

// GOOD: Pick one and be consistent
interface Session {
  pid?: number;  // undefined = not running
}

// Or use discriminated union
type Session =
  | { running: false }
  | { running: true; pid: number };
```

### At Boundaries

```typescript
// External JSON may have null - validate and normalize
interface RawApiResponse {
  session: { name: string; pid: number | null };
}

// Internal model uses undefined
interface Session {
  name: string;
  pid?: number;
}

function normalizeSession(raw: RawApiResponse): Session {
  return {
    name: raw.session.name,
    pid: raw.session.pid ?? undefined  // null → undefined
  };
}
```

---

*Last updated: 2026-03-21*
