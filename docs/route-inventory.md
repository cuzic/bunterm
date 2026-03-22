# Route Inventory

This document inventories all HTTP routes in the bunterm codebase.

## Architecture Overview

```
http-handler.ts
├── /api/* → handleApiRequest (api/index.ts)
│   ├── sessions-routes.ts
│   ├── blocks-routes.ts
│   ├── notifications-routes.ts
│   ├── shares-routes.ts
│   ├── files-routes.ts
│   ├── preview-routes.ts
│   ├── ai-routes.ts
│   ├── auth-routes.ts
│   └── claude-quotes (api-handler.ts) - table-driven
├── Static routes (static-routes.ts)
└── Page routes (page-routes.ts)
```

## Current Route Patterns

### Pattern 1: If-chain (Legacy)

```typescript
// sessions-routes.ts style
if (apiPath === '/sessions' && method === 'GET') { ... }
if (apiPath === '/sessions' && method === 'POST') { ... }
if (apiPath.startsWith('/sessions/') && method === 'DELETE') { ... }
```

**Files using this pattern:**
- `sessions-routes.ts`
- `blocks-routes.ts`
- `notifications-routes.ts`
- `shares-routes.ts`
- `files-routes.ts`
- `preview-routes.ts`
- `ai-routes.ts`
- `auth-routes.ts`

### Pattern 2: Table-driven (Preferred)

```typescript
// api-handler.ts (claude-quotes) style
const ROUTE_TABLE: RouteDefinition[] = [
  { exact: '/sessions', handler: handleSessions },
  { pattern: /^\/turn\/([^/]+)$/, handler: handleTurn },
  { prefix: '/recent', handler: handleRecent }
];
```

**Files using this pattern:**
- `features/ai/server/quotes/api-handler.ts`

## API Routes Inventory

### Sessions API (`/api/sessions*`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/status` | sessions-routes | Daemon status |
| GET | `/api/sessions` | sessions-routes | List sessions |
| GET | `/api/tmux/sessions` | sessions-routes | List tmux sessions |
| POST | `/api/sessions` | sessions-routes | Create session |
| DELETE | `/api/sessions/:name` | sessions-routes | Delete session |

### Blocks API (`/api/sessions/:name/*`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/sessions/:name/blocks` | blocks-routes | List blocks |
| GET | `/api/sessions/:name/blocks/:id` | blocks-routes | Get block |
| POST | `/api/sessions/:name/commands` | blocks-routes | Execute command |
| POST | `/api/sessions/:name/blocks/:id/cancel` | blocks-routes | Cancel command |
| GET | `/api/sessions/:name/integration-status` | blocks-routes | Shell integration status |

### Notifications API (`/api/push*`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/api/push/subscribe` | notifications-routes | Subscribe |
| DELETE | `/api/push/unsubscribe/:id` | notifications-routes | Unsubscribe |
| GET | `/api/push/vapid-key` | notifications-routes | Get VAPID key |

### Shares API (`/api/shares*`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/shares` | shares-routes | List shares |
| POST | `/api/shares` | shares-routes | Create share |
| DELETE | `/api/shares/:token` | shares-routes | Delete share |

### Files API (`/api/files*`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/files/browse` | files-routes | Browse directory |
| POST | `/api/files/upload` | files-routes | Upload file |

### Preview API (`/api/preview*`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/preview/:name/html` | preview-routes | Preview HTML |

### AI API (`/api/ai*`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/ai/runners` | ai-routes | List runners |
| POST | `/api/ai/run` | ai-routes | Run AI command |
| GET | `/api/ai/run/:id` | ai-routes | Get run status |

### Auth API (`/api/auth*`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/api/auth/verify` | auth-routes | Verify share password |

### Claude Quotes API (`/api/claude-quotes*`)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/claude-quotes/sessions` | sessions-route | List Claude sessions |
| GET | `/api/claude-quotes/recent` | recent-route | Recent turns |
| GET | `/api/claude-quotes/recent-markdown` | recent-route | Recent markdown |
| GET | `/api/claude-quotes/turn/:uuid` | turn-route | Get turn content |
| GET | `/api/claude-quotes/project-markdown` | markdown-route | Project markdown |
| GET | `/api/claude-quotes/plans` | plans-route | Plan files |
| GET | `/api/claude-quotes/file-content` | file-content-route | File content |
| GET | `/api/claude-quotes/git-diff` | git-diff-route | Git diff |
| GET | `/api/claude-quotes/git-diff-file` | git-diff-route | Single file diff |

## Page Routes (`page-routes.ts`)

| Path | Description |
|------|-------------|
| `/` | Portal page |
| `/:session/` | Terminal page |
| `/share/:token` | Share page |

## Static Routes (`static-routes.ts`)

| Path | Description |
|------|-------------|
| `/terminal-ui.js` | Terminal UI bundle |
| `/terminal-ui.css` | Terminal UI styles |
| `/manifest.json` | PWA manifest |
| `/sw.js` | Service worker |
| Various icons | PWA icons |

## Shared Types

### ApiContext (types.ts)

```typescript
interface ApiContext {
  req: Request;
  config: Config;
  sessionManager: NativeSessionManager;
  basePath: string;
  apiPath: string;
  method: string;
  sentryEnabled: boolean;
}
```

### QuoteRouteContext (quotes/routes/types.ts)

```typescript
interface QuoteRouteContext {
  params: URLSearchParams;
  headers: Record<string, string>;
  sessionManager: NativeSessionManager;
}
```

## Issues Identified

### 1. Inconsistent Route Definitions
- Some use if-chains, some use table-driven
- No unified RouteDefinition type across all handlers

### 2. Missing Request Validation
- Body parsing done inline with `req.json()`
- No schema validation (Zod not used)

### 3. Inconsistent Error Handling
- Some use `errorResponse()`, some return raw `Response`
- Error codes not standardized

### 4. No Request ID Tracking
- Logging doesn't include request correlation IDs

### 5. Duplicated Patterns
- Session name extraction repeated
- Method+path matching repeated

## Recommendations

1. **Unified RouteDef type** - Define once, use everywhere
2. **Table-driven routing** - Convert all if-chains
3. **Request parser layer** - Zod schemas at entry
4. **RouteContext** - Unified context with requestId
5. **Response envelope** - Standard success/error format

---

*Generated: 2026-03-21*
