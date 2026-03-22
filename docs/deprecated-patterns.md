# Deprecated Patterns

This document lists patterns that are deprecated and should not be used in new code.

## HTTP Routing

### ❌ If-Chain Routing

**Deprecated**: Using if-chains to match routes.

```typescript
// ❌ DEPRECATED
async function handleApi(ctx: ApiContext): Promise<Response | null> {
  if (ctx.apiPath === '/api/sessions' && ctx.method === 'GET') {
    return listSessions(ctx);
  }
  if (ctx.apiPath.startsWith('/api/sessions/') && ctx.method === 'DELETE') {
    const name = ctx.apiPath.split('/')[3];
    return deleteSession(ctx, name);
  }
  return null;
}
```

**Use instead**: Table-driven routing with `RouteDef[]`.

```typescript
// ✅ CORRECT
export const sessionRoutes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/sessions',
    handler: listSessions
  },
  {
    method: 'DELETE',
    path: '/api/sessions/:name',
    handler: deleteSession
  }
];
```

### ❌ ApiContext / ApiRouteHandler

**Deprecated**: `ApiContext` and `ApiRouteHandler` from `routes/api/types.ts`.

```typescript
// ❌ DEPRECATED
import type { ApiContext, ApiRouteHandler } from './routes/api/types.js';

const handler: ApiRouteHandler = async (ctx: ApiContext) => {
  // ...
  return new Response(JSON.stringify(data));
};
```

**Use instead**: `RouteContext` and `RouteHandler` from `route-types.ts`.

```typescript
// ✅ CORRECT
import type { RouteContext, RouteHandler, RouteDef } from '@/core/server/http/route-types.js';
import { ok, err } from '@/utils/result.js';

const handler: RouteHandler<unknown, unknown, MyResult> = async (ctx) => {
  // ...
  return ok(data);
};
```

### ❌ Manual Response Construction

**Deprecated**: Creating Response objects directly with JSON.stringify.

```typescript
// ❌ DEPRECATED
return new Response(JSON.stringify({ success: true, data: items }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
});
```

**Use instead**: Return `Result<T, DomainError>` and let the executor handle response construction.

```typescript
// ✅ CORRECT
return ok(items);  // Executor wraps in envelope
```

### ❌ Throwing Errors for Expected Cases

**Deprecated**: Throwing exceptions for expected error cases.

```typescript
// ❌ DEPRECATED
async function getSession(name: string) {
  const session = sessions.get(name);
  if (!session) {
    throw new Error(`Session '${name}' not found`);
  }
  return session;
}
```

**Use instead**: Return `Result<T, DomainError>` with typed errors.

```typescript
// ✅ CORRECT
import { ok, err } from '@/utils/result.js';
import { sessionNotFound } from '@/core/errors.js';

async function getSession(name: string): Result<Session, SessionNotFoundError> {
  const session = sessions.get(name);
  if (!session) {
    return err(sessionNotFound(name));
  }
  return ok(session);
}
```

### ❌ Manual Path Parameter Extraction

**Deprecated**: Extracting path parameters with string operations.

```typescript
// ❌ DEPRECATED
const parts = ctx.apiPath.split('/');
const sessionName = decodeURIComponent(parts[3] || '');
const blockId = parts[5] ? decodeURIComponent(parts[5]) : null;
```

**Use instead**: Define path parameters in route path and access via `ctx.pathParams`.

```typescript
// ✅ CORRECT
const route: RouteDef = {
  method: 'GET',
  path: '/api/sessions/:name/blocks/:blockId',
  handler: async (ctx) => {
    const { name, blockId } = ctx.pathParams;
    // ...
  }
};
```

### ❌ Unvalidated Request Body Access

**Deprecated**: Accessing request body without schema validation.

```typescript
// ❌ DEPRECATED
const body = await ctx.req.json();
const name = body.name; // Could be undefined, wrong type, etc.
```

**Use instead**: Define `bodySchema` with Zod and access validated `ctx.body`.

```typescript
// ✅ CORRECT
const CreateSessionSchema = z.object({
  name: z.string().min(1)
});

const route: RouteDef<unknown, z.infer<typeof CreateSessionSchema>> = {
  method: 'POST',
  path: '/api/sessions',
  bodySchema: CreateSessionSchema,
  handler: async (ctx) => {
    const { name } = ctx.body; // Type-safe, validated
    // ...
  }
};
```

## Migration Timeline

- **New code**: Must use the new patterns immediately
- **Existing code**: Should be migrated when touched
- **Legacy types**: Will be removed in a future major version

## References

- [docs/route-architecture.md](route-architecture.md) - Full architecture documentation
- [src/core/server/http/route-template.ts.example](../src/core/server/http/route-template.ts.example) - Template for new routes
- [src/core/server/http/route-types.ts](../src/core/server/http/route-types.ts) - New type definitions

---

*Last updated: 2026-03-21*
