# Unified Route Architecture

This document defines the standard architecture for HTTP route handlers.

## Design Principles

1. **Table-driven routing** - No if-chains
2. **Type-safe request parsing** - Zod at boundaries
3. **Unified context** - All handlers receive same context
4. **Standard response envelope** - Consistent structure
5. **Domain/Handler separation** - Handlers don't contain business logic

## Core Types

### RouteDef

```typescript
// src/core/server/http/route-types.ts

/**
 * Route definition for table-driven routing
 */
export interface RouteDef<TParams = unknown, TBody = unknown, TResult = unknown> {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

  /** Path pattern (supports :param syntax) */
  path: string;

  /** Request body schema (for POST/PUT/PATCH) */
  bodySchema?: z.ZodType<TBody>;

  /** Query params schema */
  querySchema?: z.ZodType<TParams>;

  /** Handler function */
  handler: RouteHandler<TParams, TBody, TResult>;

  /** Optional description for documentation */
  description?: string;
}
```

### RouteContext

```typescript
/**
 * Context passed to all route handlers
 */
export interface RouteContext<TParams = unknown, TBody = unknown> {
  /** Validated request body */
  body: TBody;

  /** Validated query parameters */
  params: TParams;

  /** Path parameters (e.g., :id) */
  pathParams: Record<string, string>;

  /** Session manager */
  sessionManager: NativeSessionManager;

  /** Application config */
  config: Config;

  /** Request ID for logging */
  requestId: string;

  /** Original request (for headers, etc.) */
  req: Request;
}
```

### RouteHandler

```typescript
/**
 * Route handler type
 */
export type RouteHandler<TParams, TBody, TResult> = (
  ctx: RouteContext<TParams, TBody>
) => Promise<Result<TResult, DomainError>>;
```

### Response Envelope

```typescript
/**
 * Standard success response
 */
interface SuccessResponse<T> {
  success: true;
  data: T;
  requestId: string;
}

/**
 * Standard error response
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}
```

## Route Registry

```typescript
// src/core/server/http/route-registry.ts

class RouteRegistry {
  private routes: Map<string, RouteDef[]> = new Map();

  /**
   * Register a route
   */
  register<TParams, TBody, TResult>(route: RouteDef<TParams, TBody, TResult>): void {
    const key = `${route.method}:${route.path}`;
    // Store route definition
  }

  /**
   * Find matching route for request
   */
  match(method: string, path: string): {
    route: RouteDef;
    pathParams: Record<string, string>;
  } | null {
    // Match against registered routes
  }
}
```

## Route Executor

```typescript
// src/core/server/http/route-executor.ts

/**
 * Execute route with full pipeline:
 * 1. Parse request body (if schema provided)
 * 2. Parse query params (if schema provided)
 * 3. Create context with requestId
 * 4. Call handler
 * 5. Convert Result to Response
 */
export async function executeRoute(
  route: RouteDef,
  req: Request,
  pathParams: Record<string, string>,
  deps: RouteDeps
): Promise<Response> {
  const requestId = generateRequestId();

  // Parse body
  let body: unknown = undefined;
  if (route.bodySchema && hasBody(req.method)) {
    const rawBody = await req.json();
    const parsed = route.bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error, requestId);
    }
    body = parsed.data;
  }

  // Parse query
  let params: unknown = undefined;
  if (route.querySchema) {
    const url = new URL(req.url);
    const raw = Object.fromEntries(url.searchParams);
    const parsed = route.querySchema.safeParse(raw);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error, requestId);
    }
    params = parsed.data;
  }

  // Create context
  const ctx: RouteContext = {
    body,
    params,
    pathParams,
    sessionManager: deps.sessionManager,
    config: deps.config,
    requestId,
    req
  };

  // Execute handler
  const result = await route.handler(ctx);

  // Convert to response
  return resultToResponse(result, requestId);
}
```

## Domain Error Mapping

```typescript
// src/core/errors.ts additions

export function toHttpStatus(error: DomainError): number {
  switch (error.code) {
    case 'SESSION_NOT_FOUND':
    case 'BLOCK_NOT_FOUND':
      return 404;
    case 'SESSION_ALREADY_EXISTS':
      return 409;
    case 'VALIDATION_FAILED':
      return 400;
    case 'PATH_TRAVERSAL':
    case 'UNAUTHORIZED':
      return 403;
    case 'DAEMON_NOT_RUNNING':
      return 503;
    default:
      return 500;
  }
}
```

## Example Route Definition

```typescript
// src/core/server/http/routes/api/sessions-routes.ts

import { z } from 'zod';

// Schema definitions
const CreateSessionBody = z.object({
  name: z.string().min(1),
  dir: z.string().optional(),
  tmuxSession: z.string().optional()
});

// Route definitions
export const sessionRoutes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/sessions',
    handler: listSessions,
    description: 'List all sessions'
  },
  {
    method: 'POST',
    path: '/api/sessions',
    bodySchema: CreateSessionBody,
    handler: createSession,
    description: 'Create a new session'
  },
  {
    method: 'DELETE',
    path: '/api/sessions/:name',
    handler: deleteSession,
    description: 'Delete a session'
  }
];

// Handler implementations (pure domain logic)
async function listSessions(
  ctx: RouteContext
): Promise<Result<SessionResponse[], DomainError>> {
  const sessions = ctx.sessionManager.listSessions();
  return ok(sessions.map(toSessionResponse));
}

async function createSession(
  ctx: RouteContext<unknown, z.infer<typeof CreateSessionBody>>
): Promise<Result<SessionResponse, DomainError>> {
  const { name, dir, tmuxSession } = ctx.body;

  if (ctx.sessionManager.hasSession(name)) {
    return err(sessionAlreadyExists(name));
  }

  const session = await ctx.sessionManager.createSession({
    name,
    dir: dir || process.cwd(),
    tmuxSession
  });

  return ok(toSessionResponse(session));
}
```

## Migration Strategy

### Phase 1: Foundation (P1)
- Create `RouteDef`, `RouteContext`, `RouteHandler` types
- Create `RouteRegistry` and `RouteExecutor`
- Define common error model
- Define response envelope

### Phase 2: Validation (P2)
- Create request parser layer with Zod
- Define Raw types for external data
- Add schema validation to route executor

### Phase 3: Registry (P3)
- Implement route registry
- Implement route matcher
- Add 404/405 handling

### Phase 4: Migration (P4)
- Migrate routes one file at a time
- Start with simplest (auth, notifications)
- End with most complex (blocks, claude-quotes)

### Phase 5: Cleanup (P5)
- Remove domain logic from handlers
- Unify handler return types
- Add requestId to all routes

### Phase 6: Observability (P6)
- Structure route logging
- Add request timing
- Add error tracking

### Phase 7: Testing (P7)
- Add route executor tests
- Add route matcher tests
- Add contract tests for each route

### Phase 8: Finalization (P8)
- Create new route template
- Update coding standards
- Deprecate old patterns

## File Structure

```
src/core/server/http/
├── route-types.ts        # RouteDef, RouteContext, RouteHandler
├── route-registry.ts     # RouteRegistry class
├── route-executor.ts     # executeRoute function
├── route-matcher.ts      # Path matching utilities
├── response.ts           # Response envelope helpers
├── utils.ts              # Existing utilities
└── routes/
    └── api/
        ├── types.ts      # (deprecated - use route-types.ts)
        ├── sessions.ts   # Session routes
        ├── blocks.ts     # Block routes
        └── ...
```

## Coding Rules

### ✅ DO

1. **Define routes in route tables**
   ```typescript
   export const myRoutes: RouteDef[] = [
     { method: 'GET', path: '/api/items', handler: listItems },
     { method: 'POST', path: '/api/items', bodySchema: CreateItemSchema, handler: createItem }
   ];
   ```

2. **Use Zod schemas for validation at boundaries**
   ```typescript
   const CreateItemSchema = z.object({
     name: z.string().min(1),
     value: z.number().positive()
   });
   ```

3. **Return `Result<T, DomainError>` from handlers**
   ```typescript
   async function getItem(ctx: RouteContext): Promise<Result<Item, AnyDomainError>> {
     const item = findItem(ctx.pathParams.id);
     if (!item) return err(notFound('Item not found'));
     return ok(item);
   }
   ```

4. **Use `RouteContext` for all dependencies**
   ```typescript
   // Access sessionManager, config, requestId through context
   const session = ctx.sessionManager.getSession(ctx.pathParams.name);
   ```

5. **Use path parameters with `:param` syntax**
   ```typescript
   { method: 'GET', path: '/api/sessions/:name/blocks/:blockId', handler: getBlock }
   ```

### ❌ DON'T

1. **Don't use if-chains for routing**
   ```typescript
   // ❌ WRONG
   if (path === '/api/sessions') { ... }
   else if (path.startsWith('/api/sessions/')) { ... }
   ```

2. **Don't return raw `Response` objects**
   ```typescript
   // ❌ WRONG
   return new Response(JSON.stringify(data), { status: 200 });

   // ✅ CORRECT
   return ok(data);  // Executor wraps in envelope
   ```

3. **Don't throw exceptions for expected errors**
   ```typescript
   // ❌ WRONG
   throw new Error('Session not found');

   // ✅ CORRECT
   return err(sessionNotFound(name));
   ```

4. **Don't access raw request body without validation**
   ```typescript
   // ❌ WRONG
   const body = await req.json();

   // ✅ CORRECT (use bodySchema)
   { bodySchema: MySchema, handler: (ctx) => { ctx.body.validatedField } }
   ```

5. **Don't inline domain logic in handlers**
   ```typescript
   // ❌ WRONG - handler doing too much
   async function createSession(ctx) {
     if (!validateName(name)) { ... }
     const session = await startProcess(name);
     await writeToFile(session);
     return ok(session);
   }

   // ✅ CORRECT - delegate to domain service
   async function createSession(ctx) {
     return ctx.sessionManager.create(ctx.body);
   }
   ```

## Reference Template

See `src/core/server/http/route-template.ts.example` for a complete route module template.

---

*Last updated: 2026-03-21*
