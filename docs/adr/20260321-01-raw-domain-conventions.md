# Raw/Domain Type Conventions

境界入力の型設計規約。外部入力を安全に Domain に変換するためのルール。

## Core Principle

```
External Input → Raw Type → Schema Validation → Domain Type → Service/Handler
                           (Parse Error)        (Domain Error possible)
```

- **Raw**: 外部から来たままの形。optional, unknown, stringly-typed を許容
- **Domain**: 内部で使う確定した形。原則 optional 禁止、型が強い

---

## 1. Raw Type Naming Conventions

### HTTP 境界

| Source | Naming | Example |
|--------|--------|---------|
| Query parameters | `RawXxxQuery` | `RawSessionsQuery` |
| Request body | `RawXxxBody` | `RawCreateSessionBody` |
| Path parameters | `RawXxxParams` | `RawBlockParams` |
| Headers | `RawXxxHeaders` | `RawAuthHeaders` |

### Other Boundaries

| Source | Naming | Example |
|--------|--------|---------|
| CLI options | `RawXxxOptions` | `RawUpOptions` |
| CLI arguments | `RawXxxArgs` | `RawAttachArgs` |
| JSON parse result | `RawXxxJson` | `RawStateJson` |
| WebSocket message | `RawXxxMessage` | `RawClientMessage` |
| File content | `RawXxxFile` | `RawConfigFile` |
| Environment | `RawEnvVars` | `RawEnvVars` |
| External API response | `RawXxxResponse` | `RawCaddyResponse` |

### File Location

```
src/
├── types/
│   ├── raw/           # Raw types (external input shapes)
│   │   ├── http.ts    # RawXxxQuery, RawXxxBody
│   │   ├── ws.ts      # RawClientMessage, RawServerMessage
│   │   ├── cli.ts     # RawXxxOptions
│   │   └── config.ts  # RawConfigFile, RawStateJson
│   └── domain/        # Domain types (internal models)
│       ├── session.ts
│       ├── block.ts
│       └── config.ts
```

---

## 2. Domain Type Rules

### 2.1 No Optional in Domain (原則)

```typescript
// ❌ Bad: Domain with optional
interface Session {
  name: string;
  cwd?: string;        // Why optional? Ambiguous
  tmuxSession?: string;
}

// ✅ Good: Explicit union for state variants
interface AttachedSession {
  name: string;
  cwd: string;
  tmuxSession: string;
}

interface DetachedSession {
  name: string;
  cwd: string;
  tmuxSession: null;  // Explicit absence
}

type Session = AttachedSession | DetachedSession;
```

### 2.2 null vs undefined

| Value | Meaning | Usage |
|-------|---------|-------|
| `undefined` | Not provided / unknown | Raw types only |
| `null` | Explicitly absent | Domain types |

```typescript
// Raw (from external)
interface RawSessionQuery {
  name?: string;       // May not be provided
  tmuxSession?: string;
}

// Domain (internal)
interface SessionInput {
  name: string;        // Required after validation
  tmuxSession: string | null;  // Explicitly present or absent
}
```

### 2.3 String Literal Unions (Not Magic Strings)

```typescript
// ❌ Bad: Magic strings
function handleStatus(status: string) {
  if (status === 'running') { /* ... */ }
  if (status === 'stopped') { /* ... */ }
}

// ✅ Good: Exhaustive union
type SessionStatus = 'running' | 'stopped' | 'error';

function handleStatus(status: SessionStatus) {
  switch (status) {
    case 'running': /* ... */ break;
    case 'stopped': /* ... */ break;
    case 'error': /* ... */ break;
    // TypeScript catches missing cases
  }
}
```

### 2.4 Branded Types for IDs/Paths

```typescript
// Simple branded type
type SessionId = string & { readonly __brand: 'SessionId' };
type FilePath = string & { readonly __brand: 'FilePath' };
type Port = number & { readonly __brand: 'Port' };

// Constructor functions
function sessionId(raw: string): SessionId {
  if (!raw || raw.length > 100) {
    throw new Error('Invalid session ID');
  }
  return raw as SessionId;
}

function port(raw: number): Port {
  if (!Number.isInteger(raw) || raw < 1 || raw > 65535) {
    throw new Error('Invalid port');
  }
  return raw as Port;
}
```

---

## 3. Parse Error vs Domain Error

### Parse Error (Validation Failure)

発生タイミング: Schema validation 時
原因: 入力の形式不正

```typescript
interface ParseError {
  type: 'parse';
  code: 'MISSING_FIELD' | 'INVALID_TYPE' | 'INVALID_FORMAT' | 'OUT_OF_RANGE';
  field: string;
  message: string;
  source: 'query' | 'body' | 'path' | 'json' | 'env' | 'file' | 'ws';
}

// Examples
{ type: 'parse', code: 'MISSING_FIELD', field: 'sessionName', source: 'query' }
{ type: 'parse', code: 'INVALID_TYPE', field: 'limit', source: 'query', message: 'Expected number' }
{ type: 'parse', code: 'INVALID_FORMAT', field: 'uuid', source: 'path', message: 'Invalid UUID format' }
```

### Domain Error (Business Rule Failure)

発生タイミング: Domain logic 実行時
原因: ビジネス条件の不成立

```typescript
interface DomainError {
  type: 'domain';
  code: 'NOT_FOUND' | 'ALREADY_EXISTS' | 'PERMISSION_DENIED' | 'INVALID_STATE' | 'CONFLICT';
  resource?: string;
  message: string;
}

// Examples
{ type: 'domain', code: 'NOT_FOUND', resource: 'session:foo' }
{ type: 'domain', code: 'ALREADY_EXISTS', resource: 'session:bar' }
{ type: 'domain', code: 'INVALID_STATE', message: 'Session is not running' }
```

### Error Boundary

```
Request
  ↓
[Query/Body Parsing] ──ParseError──→ HTTP 400/422
  ↓
[Path Param Parsing] ──ParseError──→ HTTP 400/422
  ↓
Domain Input (validated)
  ↓
[Service Logic] ──DomainError──→ HTTP 404/409/403
  ↓
Domain Output
  ↓
Response
```

---

## 4. Schema to Type Flow

### Zod Schema as Source of Truth

```typescript
// schemas/http/sessions.ts
import { z } from 'zod';

// Raw query schema
export const RawSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['running', 'stopped', 'all']).optional(),
});

// Inferred Raw type
export type RawSessionsQuery = z.input<typeof RawSessionsQuerySchema>;
// { limit?: string | number | undefined; status?: string | undefined }

// Validated output (Domain Input)
export type SessionsQueryInput = z.output<typeof RawSessionsQuerySchema>;
// { limit?: number; status?: 'running' | 'stopped' | 'all' }

// Domain type with defaults applied
export interface SessionsQuery {
  limit: number;
  status: 'running' | 'stopped' | 'all';
}

// Transform function
export function toSessionsQuery(input: SessionsQueryInput): SessionsQuery {
  return {
    limit: input.limit ?? 20,
    status: input.status ?? 'all',
  };
}
```

### Usage in Handler

```typescript
// Handler receives validated input
handler: async (ctx) => {
  // ctx.params is already validated by route executor
  const input = ctx.params as SessionsQueryInput;

  // Apply defaults and create domain object
  const query = toSessionsQuery(input);

  // Service receives domain type (no optional)
  const sessions = await sessionService.list(query);

  return ok({ sessions });
}
```

---

## 5. Migration Strategy

### Phase 1: Foundation
1. Create `src/types/errors.ts` with `ParseError` and `DomainError`
2. Create `src/utils/parse-helpers.ts` with common parsers
3. Document this convention in CLAUDE.md

### Phase 2: High-Risk Boundaries
1. WebSocket message schemas
2. State file schema
3. Protocol message schemas

### Phase 3: HTTP Routes
1. Add explicit Raw types for routes without schema
2. Verify all routes have querySchema/bodySchema
3. Remove `as z.infer<>` in favor of explicit types

### Phase 4: CLI/Config
1. CLI options schemas
2. Config file schemas
3. Environment variable schema

---

## 6. Quick Reference

### Do ✅

- Define Raw type for every external input
- Use Zod schema as source of truth
- Apply defaults in transformation function, not schema
- Use union types for state variants
- Return `ParseError` for validation failures
- Return `DomainError` for business rule failures

### Don't ❌

- Pass raw request/options to services
- Use `as` for unvalidated data
- Mix optional and explicit absence
- Use magic strings for enum values
- Catch parse errors and return domain errors
- Use `?.` chains in domain logic
