# Boundary Input Inventory

境界入力の棚卸し結果。Raw/Domain 分離の対象箇所一覧。

## Summary

| Boundary Type | Count | Validation Status | Priority |
|---------------|-------|-------------------|----------|
| HTTP Routes (ctx.params/body/pathParams) | ~30 routes | Partial (Zod schemas exist) | P1 |
| JSON.parse() | ~35 locations | Mostly unvalidated | P1 |
| process.env | ~30 references | No validation | P2 |
| CLI options | ~40+ usages | No schema validation | P2 |
| WebSocket messages | ~5 handlers | Type assertions only | P1 |
| File reads (JSON/config) | ~15 locations | Partial validation | P2 |
| fetch() responses (browser) | ~40+ locations | Type assertions only | P3 |

---

## 1. HTTP Routes

### Current Pattern (Good)
Routes in `src/core/server/http/routes/api/` use Zod schemas:

```typescript
// Route definition with schema
{
  method: 'GET',
  path: '/api/claude-quotes/sessions',
  querySchema: SessionsQuerySchema,  // ✅ Validated
  handler: async (ctx) => {
    const { limit } = ctx.params as z.infer<typeof SessionsQuerySchema>;
    // ...
  }
}
```

### Issues
- `ctx.params as z.infer<>` - 型アサーションで検証結果を受け取り（安全だが明示的でない）
- `ctx.pathParams['name']` - string | undefined のまま使用
- `ctx.body as SomeType` - bodySchema がない場合は危険

### Locations
- `src/core/server/http/routes/api/blocks-routes.ts` - 10 handlers
- `src/core/server/http/routes/api/claude-quotes-routes.ts` - 11 handlers
- `src/core/server/http/routes/api/sessions-routes.ts` - 7 handlers
- `src/core/server/http/routes/api/ai-routes.ts` - 6 handlers
- `src/core/server/http/routes/api/files-routes.ts` - 5 handlers
- `src/core/server/http/routes/api/preview-routes.ts` - 5 handlers
- `src/core/server/http/routes/api/notifications-routes.ts` - 4 handlers
- `src/core/server/http/routes/api/shares-routes.ts` - 3 handlers
- `src/core/server/http/routes/api/auth-routes.ts` - 1 handler

### Legacy Routes (Higher Risk)
`src/features/ai/server/quotes/routes/` - 直接 `ctx.params.get()` を使用:
```typescript
const sessionName = ctx.params.get('session');  // string | null
const count = Math.min(Number.parseInt(ctx.params.get('count') ?? '20', 10), 50);
```

---

## 2. JSON.parse() Usage

### High Risk (No Validation After Parse)
```typescript
// src/core/protocol/helpers.ts:31
const parsed = JSON.parse(data);  // → unknown のまま使用

// src/browser/terminal/terminal-client.ts:681
const message: ServerMessage = JSON.parse(data);  // 型アサーション

// src/core/config/state.ts:82
const parsed = JSON.parse(content) as Partial<State>;  // as で強制

// src/core/cli/commands/reload.ts:52
const result: ReloadResult = JSON.parse(response);  // 型アサーション
```

### Medium Risk (Partial Validation)
```typescript
// src/browser/toolbar/StorageManager.ts:80
const parsed: unknown = JSON.parse(raw);  // unknown だが後続で検証なし

// src/browser/toolbar/SnippetManager.ts:321
const data = JSON.parse(text) as SnippetStorageType;  // 型アサーション
```

### Locations
- `src/utils/jsonl.ts:41` - JSONL parsing
- `src/browser/terminal/terminal-client.ts:681` - WS message
- `src/browser/terminal/app/hooks/useTerminal.ts:150` - WS message
- `src/browser/terminal/app/stores/chatStore.ts:308` - WS message
- `src/core/server/ws/session-token.ts:208` - JWT payload
- `src/core/config/state.ts:82` - State file
- `src/core/protocol/helpers.ts:31` - Protocol message
- `src/core/client/daemon-spawner.ts:103` - Process list
- `src/core/cli/commands/reload.ts:52` - Reload result
- `src/core/cli/services/status-service.ts:34` - Process status
- `src/features/claude-watcher/server/message-parser.ts:38,53` - Claude history
- `src/features/ai/server/response-parser.ts:86` - AI response
- `src/features/file-transfer/server/file-transfer.ts:464` - File metadata
- `src/features/notifications/server/vapid.ts:37` - VAPID keys

---

## 3. process.env References

### Critical (Security/Config)
```typescript
// src/core/server/ws/session-token.ts:306
const envSecret = process.env['BUNTERM_WS_SECRET'];

// src/core/server/ws/origin-validator.ts:115
devMode: options?.devMode ?? process.env.NODE_ENV === 'development',
```

### Configuration
```typescript
// src/core/config/state.ts:19,27
process.env['BUNTERM_CONFIG_DIR'] ?? join(homedir(), '.config', 'bunterm');
process.env['BUNTERM_STATE_DIR'] ?? join(homedir(), '.local', 'state', 'bunterm');

// src/utils/logger.ts:11,21
process.env['BUNTERM_LOG_FILE'] || null;
process.env['BUNTERM_LOG_LEVEL'] as LogLevel || 'info';
```

### Shell/Runtime
```typescript
// src/core/server/session-manager.ts:111
process.env['SHELL'] || '/bin/bash'

// src/utils/tmux-client.ts:98
!!process.env['TMUX']
```

---

## 4. CLI Options

### Pattern
```typescript
// src/core/cli/commands/up.ts
const name = options.name ?? dir.split('/').pop() ?? 'default';
const shouldAttach = options.detach ? false : (options.attach ?? config.auto_attach);
```

### Issues
- Commander の出力を直接使用
- 型は `unknown` または `any` 相当
- default 値処理が分散

### Locations
- `src/core/cli/commands/up.ts`
- `src/core/cli/commands/down.ts`
- `src/core/cli/commands/list.ts`
- `src/core/cli/commands/daemon.ts`
- `src/core/cli/commands/doctor.ts`
- `src/core/cli/commands/attach.ts`
- `src/core/cli/commands/caddy.ts`
- `src/core/cli/commands/deploy.ts`
- `src/core/cli/commands/share.ts`
- `src/core/cli/commands/shutdown.ts`

---

## 5. WebSocket Messages

### Server → Client
```typescript
// src/browser/terminal/terminal-client.ts:681
this.ws.onmessage = (event) => {
  const data = typeof event.data === 'string' ? event.data : '';
  const message: ServerMessage = JSON.parse(data);  // ❌ No validation
  // ...
};
```

### Client → Server
```typescript
// src/core/protocol/helpers.ts
export function parseClientMessage(data: string): ClientMessage | null {
  const parsed = JSON.parse(data);  // ❌ No schema
  if (parsed && typeof parsed === 'object' && 'type' in parsed) {
    return parsed as ClientMessage;  // ❌ Type assertion
  }
  return null;
}
```

---

## 6. File Reads

### JSON Files
```typescript
// src/core/config/state.ts:82
const parsed = JSON.parse(content) as Partial<State>;

// src/features/notifications/server/vapid.ts:37
return JSON.parse(content) as VapidKeys;
```

### Config Files (YAML)
```typescript
// src/core/config/config.ts:36
const content = readFileSync(path, 'utf-8');
const raw = yaml.parse(content);  // ❌ No schema validation
```

---

## 7. fetch() Responses (Browser)

### Pattern
```typescript
// src/browser/toolbar/QuoteManager.ts:333
const data = await fetchJSON<{ sessions: ClaudeSessionInfo[] }>(url);

// src/browser/toolbar/SessionSwitcher.ts:291
const sessions = await fetchJSON<Array<{ name: string; tmuxSession?: string }>>(url);
```

### Issues
- `fetchJSON<T>` は型パラメータで型を指定するだけ
- 実際のレスポンス検証なし
- サーバー変更時に型不一致の可能性

---

## Priority Order for Migration

### P0: Foundation
1. Parse helper utilities (`parseQuery`, `parseBody`, `parseJson`)
2. ParseError 型定義
3. 命名規約ドキュメント

### P1: High Risk
1. WebSocket message parsing (`parseClientMessage`, `parseServerMessage`)
2. State file (`state.ts`)
3. Protocol helpers (`helpers.ts`)
4. Legacy quote routes

### P2: Medium Risk
1. CLI options schema
2. Config file validation
3. process.env validation at startup

### P3: Low Risk
1. Browser fetch response validation
2. File read validation (non-critical)

---

## Next Steps

1. [ ] Raw/Domain 命名規約を決定
2. [ ] 共通 parse helper を作成
3. [ ] ParseError 型を定義
4. [ ] WebSocket message schema を作成（最初の適用対象）
