# ADR 004: Daemon Logging System

## Status

Accepted

## Context

デーモンがバックグラウンドで実行中にクラッシュする問題が発生したが、原因を特定するのが困難だった。

問題点:
- デーモンは `stdio: 'ignore'` で起動されるため、stdout/stderr が破棄される
- エラーが発生してもログが残らない
- フォアグラウンド実行では安定するがバックグラウンドでは不安定

具体的なバグ:
- `accept-encoding: undefined` を HTTP ヘッダーに設定しようとしてクラッシュ
- ヘッダー値が `undefined` の場合、http-proxy が例外を投げる

## Decision

### 1. Logger ユーティリティの導入

**決定**: コンポーネントベースのロガーを `src/utils/logger.ts` に実装

```typescript
export function createLogger(component: string) {
  return {
    debug(message: string, ...args: unknown[]): void { ... },
    info(message: string, ...args: unknown[]): void { ... },
    warn(message: string, ...args: unknown[]): void { ... },
    error(message: string, ...args: unknown[]): void { ... }
  };
}
```

**出力フォーマット**:
```
[2024-01-01T12:00:00.000Z] INFO  [daemon] Starting daemon on port 7680
[2024-01-01T12:00:00.100Z] DEBUG [session] Starting session: my-project
```

### 2. ログレベル制御

**決定**: 環境変数 `TTYD_MUX_LOG_LEVEL` でログレベルを制御

```bash
TTYD_MUX_LOG_LEVEL=debug ttyd-mux daemon  # 詳細ログ
TTYD_MUX_LOG_LEVEL=error ttyd-mux daemon  # エラーのみ
```

**レベル優先度**: `debug < info < warn < error`

デフォルトは `info`。

### 3. コンポーネント別ロギング

**決定**: 各モジュールでコンポーネント名を指定してロガーを作成

| コンポーネント | ファイル | 用途 |
|----------------|----------|------|
| `daemon` | daemon/index.ts | デーモンライフサイクル |
| `server` | daemon/server.ts | HTTP リクエスト/レスポンス |
| `session` | daemon/session-manager.ts | セッション管理 |
| `proxy` | daemon/proxy.ts | WebSocket プロキシ |

### 4. バグ修正: undefined ヘッダー値

**決定**: レスポンスヘッダーのコピー時に `undefined` 値をフィルタリング

```typescript
// Before (bug)
headers['accept-encoding'] = proxyRes.headers['accept-encoding'];

// After (fix)
if (value !== undefined) {
  headers[key] = value;
}
```

## Consequences

### Positive

- デーモンの動作を詳細に追跡可能
- バグの原因特定が容易に
- `accept-encoding: undefined` バグを発見・修正

### Negative

- ログ出力によるわずかなパフォーマンスオーバーヘッド
- ログファイルへの出力は未実装（現状は stdout/stderr のみ）

### Future Work

- ログファイルへのローテーション出力
- 構造化ログ（JSON 形式）対応
